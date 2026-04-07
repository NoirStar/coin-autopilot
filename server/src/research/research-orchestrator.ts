/**
 * 연구 파이프라인 오케스트레이터
 *
 * 전략별 파라미터 그리드를 생성하고:
 *   Phase 1 (Screening): 짧은 백테스트로 후보 필터링
 *   Phase 2 (Full Validation): IS/OOS + Walk-Forward 검증
 *   Phase 3 (Promotion): 통과한 파라미터를 paper_candidate로 승격
 *
 * 모든 백테스트는 워커 풀에서 병렬 실행되어 메인 스레드를 차단하지 않는다.
 * 기존 research-loop.ts의 크론 스케줄러가 이 모듈을 호출한다.
 */

import type {
  Strategy,
  CandleMap,
  BacktestResult,
  StrategyStatus,
} from '../core/types.js'
import { generateGrid, type ParamSet } from './param-explorer.js'
import { calculateExpectedValue, type ValidationResult, type SegmentResult } from './validation-engine.js'
import { runFullValidationInPool } from './validation-pool.js'
import { BacktestWorkerPool, serializeCandleMap, type BacktestTask } from './worker-pool.js'
import { evaluateTrigger, executeReview, type TriggerReason } from './ai-reviewer.js'
import { isAiEnabled } from '../services/ai-client.js'
import { supabase } from '../services/database.js'

// ─── 상수 ──────────────────────────────────────────────────────

/** Screening 기준: 짧은 백테스트에서 명백히 안 되는 조합 제거 */
const SCREENING_CRITERIA = {
  minEv: 0,              // EV > 0
  minTrades: 10,         // 최소 거래 수
  maxMdd: 30,            // MDD < 30%
  topRatio: 0.25,        // 상위 25%
  minTopN: 5,            // 최소 5개는 통과
  maxTopN: 20,           // 최대 20개까지
}

/** Screening용 캔들 수 (최근 6개월) */
const SCREENING_CANDLE_LIMITS: Record<string, number> = {
  '1h': 4300,   // ~6개월
  '4h': 1100,   // ~6개월
}

// ─── 메인 파이프라인 ───────────────────────────────────────────

interface PipelineResult {
  strategyId: string
  gridSize: number
  screeningPassed: number
  validationPassed: number
  promoted: boolean
  bestParamSet?: ParamSet
  bestOosEv?: number
}

/**
 * 단일 전략에 대한 연구 파이프라인 실행
 *
 * 모든 백테스트는 워커 풀에서 병렬 실행된다.
 *
 * @param baseStrategy 기본 전략 인스턴스 (DEFAULT_PARAMS)
 * @param allCandles 전체 캔들 데이터 (full validation용)
 * @returns PipelineResult
 */
export async function runResearchPipeline(
  baseStrategy: Strategy,
  allCandles: CandleMap,
): Promise<PipelineResult> {
  const sid = baseStrategy.config.id
  const result: PipelineResult = {
    strategyId: sid,
    gridSize: 0,
    screeningPassed: 0,
    validationPassed: 0,
    promoted: false,
  }

  // 0. 파라미터 그리드 생성
  const grid = generateGrid(sid)
  result.gridSize = grid.length

  if (grid.length === 0) {
    console.log(`[파이프라인] ${sid} — 파라미터 그리드 없음, 스킵`)
    return result
  }

  console.log(`[파이프라인] ${sid} — 그리드 ${grid.length}개 조합 생성`)

  // 1. Screening: 짧은 백테스트로 후보 필터링 (워커 풀 병렬)
  const screeningCandles = sliceCandlesForScreening(allCandles, baseStrategy.config.timeframe)
  const screeningResults = await runScreening(sid, grid, screeningCandles)
  result.screeningPassed = screeningResults.length

  if (screeningResults.length === 0) {
    console.log(`[파이프라인] ${sid} — 스크리닝 통과 0개, 종료`)
    return result
  }

  console.log(`[파이프라인] ${sid} — 스크리닝 통과 ${screeningResults.length}/${grid.length}개`)

  // 2. Full Validation: IS/OOS + Walk-Forward (워커 풀 병렬)
  const validationResults = await runValidationPhase(sid, screeningResults, allCandles)
  result.validationPassed = validationResults.length

  if (validationResults.length === 0) {
    console.log(`[파이프라인] ${sid} — 검증 통과 0개, 종료`)
    return result
  }

  // 3. 최적 파라미터 선택 (OOS EV 기준)
  const best = validationResults.reduce((a, b) =>
    a.oosEv > b.oosEv ? a : b
  )

  result.bestParamSet = best.paramSet
  result.bestOosEv = best.oosEv

  console.log(
    `[파이프라인] ${sid} — 검증 통과 ${validationResults.length}개, ` +
    `최적 OOS EV=${best.oosEv.toFixed(2)}`
  )

  // 4. DB 저장 + 승격
  const promoted = await saveAndPromote(baseStrategy, best, allCandles)
  result.promoted = promoted

  // 5. AI 리뷰 자동 트리거 (비동기, 파이프라인 블로킹 없음)
  if (isAiEnabled()) {
    triggerAiReviewIfNeeded(baseStrategy, best, validationResults).catch((err) => {
      console.error(`[파이프라인] ${sid} AI 리뷰 트리거 오류:`, err)
    })
  }

  return result
}

// ─── Phase 1: Screening ───────────────────────────────────────

interface ScreeningCandidate {
  paramSet: ParamSet
  ev: number
  trades: number
  mdd: number
  totalReturn: number
}

/**
 * 짧은 백테스트로 후보를 걸러낸다 (워커 풀 병렬)
 */
async function runScreening(
  strategyId: string,
  grid: ParamSet[],
  screeningCandles: CandleMap,
): Promise<ScreeningCandidate[]> {
  const pool = BacktestWorkerPool.getInstance()
  const serializedCandles = serializeCandleMap(screeningCandles)

  // 모든 그리드 조합을 배치로 실행
  const tasks = grid.map((paramSet) => ({
    strategyId,
    serializedCandles,
    paramOverrides: paramSet,
  }))

  const batchResults = await pool.runBatch(tasks)

  // 결과 필터링
  const candidates: ScreeningCandidate[] = []

  for (let i = 0; i < batchResults.length; i++) {
    const btResult = batchResults[i]
    if (!btResult) continue

    const ev = calculateExpectedValue(btResult)

    if (
      ev > SCREENING_CRITERIA.minEv &&
      btResult.totalTrades >= SCREENING_CRITERIA.minTrades &&
      btResult.maxDrawdown < SCREENING_CRITERIA.maxMdd
    ) {
      candidates.push({
        paramSet: grid[i],
        ev,
        trades: btResult.totalTrades,
        mdd: btResult.maxDrawdown,
        totalReturn: btResult.totalReturn,
      })
    }
  }

  // EV 기준 정렬, 상위 N개 선택
  candidates.sort((a, b) => b.ev - a.ev)

  const topN = Math.min(
    SCREENING_CRITERIA.maxTopN,
    Math.max(
      SCREENING_CRITERIA.minTopN,
      Math.ceil(grid.length * SCREENING_CRITERIA.topRatio),
    ),
  )

  return candidates.slice(0, topN)
}

/**
 * Screening용 캔들 슬라이스 (최근 6개월)
 */
function sliceCandlesForScreening(
  allCandles: CandleMap,
  timeframe: string,
): CandleMap {
  const limit = SCREENING_CANDLE_LIMITS[timeframe] ?? 2000
  const screened: CandleMap = new Map()

  for (const [symbol, candles] of allCandles) {
    if (candles.length <= limit) {
      screened.set(symbol, candles)
    } else {
      screened.set(symbol, candles.slice(candles.length - limit))
    }
  }

  return screened
}

// ─── Phase 2: Full Validation ─────────────────────────────────

interface ValidatedCandidate {
  paramSet: ParamSet
  oosEv: number
  wfMedianEv: number
  validation: ValidationResult
}

/**
 * IS/OOS + Walk-Forward 검증 실행 (워커 풀 병렬)
 */
async function runValidationPhase(
  strategyId: string,
  candidates: ScreeningCandidate[],
  allCandles: CandleMap,
): Promise<ValidatedCandidate[]> {
  // 모든 후보의 검증을 병렬 실행
  const validationPromises = candidates.map((candidate) =>
    runFullValidationInPool(strategyId, candidate.paramSet, allCandles)
      .then((validation): ValidatedCandidate | null => {
        if (validation.overallPass) {
          const wfEvs = validation.walkForward.map((r) => r.expectedValue).sort((a, b) => a - b)
          const medianEv = wfEvs.length > 0 ? wfEvs[Math.floor(wfEvs.length / 2)] : 0

          return {
            paramSet: candidate.paramSet,
            oosEv: validation.isOos.oos.expectedValue,
            wfMedianEv: medianEv,
            validation,
          }
        }
        console.log(
          `[파이프라인] ${strategyId} 검증 실패: ${validation.reasons.join(', ')}`
        )
        return null
      })
      .catch((err) => {
        console.error(`[파이프라인] ${strategyId} 검증 오류:`, err.message)
        return null
      })
  )

  const results = await Promise.all(validationPromises)
  return results.filter((r): r is ValidatedCandidate => r !== null)
}

// ─── Phase 3: DB 저장 + 승격 ──────────────────────────────────

/**
 * 최적 파라미터를 DB에 저장하고 전략을 paper_candidate로 승격
 */
async function saveAndPromote(
  baseStrategy: Strategy,
  best: ValidatedCandidate,
  allCandles: CandleMap,
): Promise<boolean> {
  const sid = baseStrategy.config.id

  // DB에서 전략 UUID 조회
  const { data: strategyRow } = await supabase
    .from('strategies')
    .select('id, status')
    .eq('strategy_id', sid)
    .single()

  if (!strategyRow) {
    console.error(`[파이프라인] ${sid} — DB에서 전략을 찾을 수 없음`)
    return false
  }

  // research_run 생성
  const { data: runData, error: runError } = await supabase
    .from('research_runs')
    .insert({
      strategy_id: strategyRow.id,
      market_scope: baseStrategy.config.exchange === 'okx' ? 'BTC-USDT' : 'BTC-KRW',
      parameter_set: best.paramSet,
      status: 'completed',
      pipeline_mode: 'pipeline',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runError || !runData) {
    console.error(`[파이프라인] ${sid} — research_run 생성 실패:`, runError?.message)
    return false
  }

  const runId = runData.id

  // 최적 파라미터로 전체 백테스트 (워커에서 실행)
  const pool = BacktestWorkerPool.getInstance()
  const fullResult = await pool.runBacktest(sid, allCandles, best.paramSet)
  const fullEv = calculateExpectedValue(fullResult)

  // research_run_metrics 저장
  const grossProfit = fullResult.trades
    .filter((t) => t.pnlPct > 0)
    .reduce((sum, t) => sum + t.pnlPct, 0)
  const grossLoss = Math.abs(
    fullResult.trades
      .filter((t) => t.pnlPct < 0)
      .reduce((sum, t) => sum + t.pnlPct, 0),
  )
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
  const avgFeePct = fullResult.trades.length > 0
    ? fullResult.trades.reduce((s, t) => s + t.feePct, 0) / fullResult.trades.length
    : 0
  const costRatio = fullResult.totalReturn !== 0
    ? (avgFeePct * fullResult.totalTrades) / Math.abs(fullResult.totalReturn)
    : 0

  await supabase.from('research_run_metrics').insert({
    research_run_id: runId,
    total_return: fullResult.totalReturn,
    max_drawdown: fullResult.maxDrawdown,
    win_rate: fullResult.winRate,
    sharpe: fullResult.sharpeRatio,
    profit_factor: Math.round(profitFactor * 100) / 100,
    trade_count: fullResult.totalTrades,
    avg_hold_hours: fullResult.avgHoldHours,
    cost_ratio: Math.round(costRatio * 10000) / 100,
    expected_value: Math.round(fullEv * 100) / 100,
    equity_curve: fullResult.equityCurve,
    trades: fullResult.trades.map((t) => ({
      ...t,
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime.toISOString(),
    })),
  })

  // research_run_segments 저장
  const segments: Array<{
    segment: SegmentResult
  }> = [
    { segment: best.validation.isOos.is },
    { segment: best.validation.isOos.oos },
    ...best.validation.walkForward.map((seg) => ({ segment: seg })),
  ]

  for (const { segment: seg } of segments) {
    await supabase.from('research_run_segments').insert({
      research_run_id: runId,
      segment_name: seg.segment.name,
      segment_role: seg.segment.role,
      start_date: seg.startDate.toISOString(),
      end_date: seg.endDate.toISOString(),
      candle_count: seg.candleCount,
      total_return: seg.totalReturn,
      max_drawdown: seg.maxDrawdown,
      expected_value: Math.round(seg.expectedValue * 100) / 100,
      win_rate: seg.winRate,
      trade_count: seg.tradeCount,
      sharpe: seg.sharpe,
    })
  }

  // 승격 판단: 이미 paper 이상이면 재승격 불필요
  const currentStatus = strategyRow.status as StrategyStatus
  const promotableStatuses: StrategyStatus[] = [
    'research_only',
    'backtest_running',
    'backtest_completed',
    'validated_candidate',
  ]

  if (!promotableStatuses.includes(currentStatus)) {
    console.log(`[파이프라인] ${sid} 이미 ${currentStatus} 상태 — 파라미터만 갱신`)
  }

  // 원자적 승격 — promote_strategy_with_params RPC
  const reason =
    `[파이프라인] OOS EV=${best.oosEv.toFixed(2)}, WF 중앙값 EV=${best.wfMedianEv.toFixed(2)}, ` +
    `전체 Sharpe=${fullResult.sharpeRatio}, MDD=${fullResult.maxDrawdown}%`

  const { data: paramSetId, error: rpcError } = await supabase.rpc(
    'promote_strategy_with_params',
    {
      p_strategy_id: strategyRow.id,
      p_param_set: best.paramSet,
      p_run_id: runId,
      p_from_status: currentStatus,
      p_reason: reason,
    },
  )

  if (rpcError) {
    console.error(`[파이프라인] ${sid} 승격 RPC 오류:`, rpcError.message)
    return false
  }

  console.log(
    `[파이프라인] ${sid} 승격! → paper_candidate | ` +
    `param_set_id=${paramSetId} | ${reason}`
  )

  return true
}

// ─── AI 리뷰 자동 트리거 ──────────────────────────────────────

/**
 * 파이프라인 결과를 평가하여 AI 리뷰가 필요하면 자동 실행
 *
 * 비동기로 실행되어 파이프라인 흐름을 차단하지 않는다.
 * 이벤트 기반 호출이므로 매 파이프라인마다 AI를 부르지 않는다.
 */
async function triggerAiReviewIfNeeded(
  baseStrategy: Strategy,
  best: ValidatedCandidate,
  allCandidates: ValidatedCandidate[],
): Promise<void> {
  const sid = baseStrategy.config.id

  // 비교 후보 요약 구성
  const candidateSummaries = allCandidates.map((c) => ({
    strategyName: sid,
    paramSet: c.paramSet,
    oosEv: c.oosEv,
    wfMedianEv: c.wfMedianEv,
    sharpe: c.validation.isOos.oos.sharpe,
    maxDrawdown: c.validation.isOos.oos.maxDrawdown,
    tradeCount: c.validation.isOos.oos.tradeCount,
  }))

  // 최적 후보 메트릭
  const bestMetrics = {
    strategyName: sid,
    paramSet: best.paramSet,
    totalReturn: best.validation.isOos.oos.totalReturn,
    maxDrawdown: best.validation.isOos.oos.maxDrawdown,
    sharpe: best.validation.isOos.oos.sharpe,
    winRate: best.validation.isOos.oos.winRate,
    expectedValue: best.oosEv,
    profitFactor: 0,
    tradeCount: best.validation.isOos.oos.tradeCount,
    avgHoldHours: 0,
    costRatio: 0,
  }

  // 트리거 조건 평가
  const triggerReason = evaluateTrigger(candidateSummaries, bestMetrics)
  if (!triggerReason) return

  console.log(`[파이프라인] ${sid} AI 리뷰 트리거: ${triggerReason}`)

  // 전략 DB UUID 조회
  const { data: strategyRow } = await supabase
    .from('strategies')
    .select('id')
    .eq('strategy_id', sid)
    .single()

  if (!strategyRow) return

  // 최근 연구 실행 ID
  const { data: latestRun } = await supabase
    .from('research_runs')
    .select('id')
    .eq('strategy_id', strategyRow.id)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(1)
    .single()

  // 리뷰 실행
  const reviewType = triggerReason === 'ambiguous_ranking' ? 'strategy_comparison' as const
    : triggerReason === 'param_re_explore' ? 'param_proposal' as const
    : 'research_analysis' as const

  const segments = [
    best.validation.isOos.is,
    best.validation.isOos.oos,
    ...best.validation.walkForward,
  ].map((seg) => ({
    name: seg.segment.name,
    role: seg.segment.role,
    totalReturn: seg.totalReturn,
    maxDrawdown: seg.maxDrawdown,
    expectedValue: seg.expectedValue,
    winRate: seg.winRate,
    tradeCount: seg.tradeCount,
    sharpe: seg.sharpe,
  }))

  const result = await executeReview({
    triggerReason,
    reviewType,
    strategyId: strategyRow.id,
    researchRunId: latestRun?.id,
    metrics: bestMetrics,
    segments,
    comparisonCandidates: triggerReason === 'ambiguous_ranking' ? candidateSummaries : undefined,
  })

  console.log(
    `[파이프라인] ${sid} AI 리뷰 완료: status=${result.status}, ` +
    `tokens=${result.inputTokens}+${result.outputTokens}, ${result.latencyMs}ms`
  )
}
