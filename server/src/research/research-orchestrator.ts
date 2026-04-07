/**
 * 연구 파이프라인 오케스트레이터
 *
 * 전략별 파라미터 그리드를 생성하고:
 *   Phase 1 (Screening): 짧은 백테스트로 후보 필터링
 *   Phase 2 (Full Validation): IS/OOS + Walk-Forward 검증
 *   Phase 3 (AI Review): 승격 전 AI 분석 (조건부)
 *   Phase 4 (Promotion): 통과한 파라미터를 paper_candidate로 승격
 *   Phase 5 (Re-explore): AI 파라미터 제안 → 새 그리드 → 재검증 (닫힌 루프)
 *
 * 검증 전멸 시: AI에 실패 분석을 요청하고 제안된 파라미터로 재탐색
 *
 * 모든 백테스트는 워커 풀에서 병렬 실행되어 메인 스레드를 차단하지 않는다.
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
import { BacktestWorkerPool, serializeCandleMap } from './worker-pool.js'
import {
  evaluateTrigger,
  executeReview,
  suggestionsToGrid,
  shouldReExplore,
  canCallAi,
  getPreviousBestEv,
  type ReviewResult,
  type CandidateSummary,
  type ReviewMetrics,
  type ParamSuggestion,
} from './ai-reviewer.js'
import { isAiEnabled } from '../services/ai-client.js'
import { supabase } from '../services/database.js'

// ─── 상수 ──────────────────────────────────────────────────────

const SCREENING_CRITERIA = {
  minEv: 0,
  minTrades: 10,
  maxMdd: 30,
  topRatio: 0.25,
  minTopN: 5,
  maxTopN: 20,
}

const SCREENING_CANDLE_LIMITS: Record<string, number> = {
  '1h': 4300,
  '4h': 1100,
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
  aiReviewId?: string
  reExplored?: boolean
}

/**
 * 단일 전략에 대한 연구 파이프라인 실행
 *
 * 흐름:
 *   그리드 생성 → 스크리닝 → 검증 → [AI 리뷰] → 승격 → [AI 재탐색]
 *   검증 전멸 시 → AI 실패 분석 → 제안 파라미터로 재탐색
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

  // 1. Screening
  const screeningCandles = sliceCandlesForScreening(allCandles, baseStrategy.config.timeframe)
  const screeningResults = await runScreening(sid, grid, screeningCandles)
  result.screeningPassed = screeningResults.length

  if (screeningResults.length === 0) {
    console.log(`[파이프라인] ${sid} — 스크리닝 통과 0개, 종료`)
    return result
  }

  console.log(`[파이프라인] ${sid} — 스크리닝 통과 ${screeningResults.length}/${grid.length}개`)

  // 2. Full Validation
  const validationResults = await runValidationPhase(sid, screeningResults, allCandles)
  result.validationPassed = validationResults.length

  // ── 검증 전멸 시: AI 실패 분석 + 재탐색 ──
  if (validationResults.length === 0) {
    console.log(`[파이프라인] ${sid} — 검증 통과 0개`)

    if (isAiEnabled()) {
      const reExploreResult = await handleValidationWipeout(
        baseStrategy, screeningResults, allCandles,
      )
      if (reExploreResult) {
        result.reExplored = true
        result.validationPassed = reExploreResult.validationPassed
        result.aiReviewId = reExploreResult.aiReviewId

        if (reExploreResult.best) {
          result.bestParamSet = reExploreResult.best.paramSet
          result.bestOosEv = reExploreResult.best.oosEv
          const promoted = await saveAndPromote(baseStrategy, reExploreResult.best, allCandles)
          result.promoted = promoted
          return result
        }
      }
    }

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

  // 4. AI 리뷰 (승격 전, 조건 충족 시)
  if (isAiEnabled()) {
    const aiResult = await runPrePromotionReview(
      baseStrategy, best, validationResults,
    )
    if (aiResult) {
      result.aiReviewId = aiResult.reviewId

      // AI confidence 게이트 + 재탐색 루프
      if (aiResult.analysis && shouldReExplore(aiResult.analysis)) {
        const reExploreResult = await runAiReExplore(
          baseStrategy, aiResult.analysis.paramSuggestions!, best.paramSet, allCandles,
        )
        if (reExploreResult && reExploreResult.oosEv > best.oosEv) {
          console.log(
            `[파이프라인] ${sid} AI 재탐색 승리: EV ${best.oosEv.toFixed(2)} → ${reExploreResult.oosEv.toFixed(2)}`
          )
          result.bestParamSet = reExploreResult.paramSet
          result.bestOosEv = reExploreResult.oosEv
          result.reExplored = true
          const promoted = await saveAndPromote(baseStrategy, reExploreResult, allCandles)
          result.promoted = promoted
          return result
        }
      }
    }
  }

  // 5. 승격 (원래 최적 후보로)
  const promoted = await saveAndPromote(baseStrategy, best, allCandles)
  result.promoted = promoted

  return result
}

// ─── 검증 전멸 시 AI 실패 분석 + 재탐색 ──────────────────────

interface ReExploreResult {
  validationPassed: number
  best: ValidatedCandidate | null
  aiReviewId: string
}

/**
 * 검증 통과 0개일 때 호출.
 * 스크리닝 통과 후보의 실패 패턴을 AI에 전달하여 파라미터 재제안을 받고,
 * 제안된 그리드로 스크리닝 → 검증을 재실행한다.
 */
async function handleValidationWipeout(
  baseStrategy: Strategy,
  screeningResults: ScreeningCandidate[],
  allCandles: CandleMap,
): Promise<ReExploreResult | null> {
  const sid = baseStrategy.config.id

  // 전략 UUID 조회
  const { data: strategyRow } = await supabase
    .from('strategies')
    .select('id')
    .eq('strategy_id', sid)
    .single()
  if (!strategyRow) return null

  // 비용 제어
  const allowed = await canCallAi(strategyRow.id, 'validation_wipeout')
  if (!allowed) return null

  // 스크리닝 결과 중 상위 3개의 실패 사유 수집 — 실제 검증 재실행하여 사유 확보
  const topCandidates = screeningResults.slice(0, 3)
  const failureReasons: string[] = []

  for (const candidate of topCandidates) {
    const validation = await runFullValidationInPool(sid, candidate.paramSet, allCandles)
    if (!validation.overallPass) {
      failureReasons.push(
        `params=${JSON.stringify(candidate.paramSet)}: ${validation.reasons.join(', ')}`
      )
    }
  }

  // 상위 후보의 평균 메트릭으로 리뷰 요청
  const avgMetrics: ReviewMetrics = {
    strategyName: sid,
    paramSet: topCandidates[0]?.paramSet ?? {},
    totalReturn: avg(topCandidates.map((c) => c.totalReturn)),
    maxDrawdown: avg(topCandidates.map((c) => c.mdd)),
    sharpe: 0,
    winRate: 0,
    expectedValue: avg(topCandidates.map((c) => c.ev)),
    profitFactor: 0,
    tradeCount: avg(topCandidates.map((c) => c.trades)),
    avgHoldHours: 0,
    costRatio: 0,
  }

  console.log(`[파이프라인] ${sid} AI 실패 분석 요청 (${failureReasons.length}개 사유)`)

  const reviewResult = await executeReview({
    triggerReason: 'validation_wipeout',
    reviewType: 'failure_analysis',
    strategyId: strategyRow.id,
    metrics: avgMetrics,
    failureReasons,
  })

  if (reviewResult.status !== 'completed' || !reviewResult.analysis || !shouldReExplore(reviewResult.analysis)) {
    return { validationPassed: 0, best: null, aiReviewId: reviewResult.reviewId }
  }

  // AI 제안으로 재탐색 (스크리닝 상위 후보의 파라미터를 베이스로)
  const bestScreeningParams = topCandidates[0]?.paramSet ?? {}
  const reExploreResult = await runAiReExplore(
    baseStrategy, reviewResult.analysis.paramSuggestions!, bestScreeningParams, allCandles,
  )

  return {
    validationPassed: reExploreResult ? 1 : 0,
    best: reExploreResult,
    aiReviewId: reviewResult.reviewId,
  }
}

// ─── 승격 전 AI 리뷰 ─────────────────────────────────────────

/**
 * 승격 전에 AI 리뷰를 실행 (조건 충족 시에만)
 *
 * 이전 최적 EV와 비교하여 performance_collapse도 감지.
 */
async function runPrePromotionReview(
  baseStrategy: Strategy,
  best: ValidatedCandidate,
  allCandidates: ValidatedCandidate[],
): Promise<ReviewResult | null> {
  const sid = baseStrategy.config.id

  // 전략 UUID 조회
  const { data: strategyRow } = await supabase
    .from('strategies')
    .select('id')
    .eq('strategy_id', sid)
    .single()
  if (!strategyRow) return null

  // 이전 최적 EV 조회 (성과 급락 판단)
  const previousBestEv = await getPreviousBestEv(strategyRow.id)

  // 비교 후보 요약 구성
  const candidateSummaries: CandidateSummary[] = allCandidates.map((c) => ({
    strategyName: sid,
    paramSet: c.paramSet,
    oosEv: c.oosEv,
    wfMedianEv: c.wfMedianEv,
    sharpe: c.validation.isOos.oos.sharpe,
    maxDrawdown: c.validation.isOos.oos.maxDrawdown,
    tradeCount: c.validation.isOos.oos.tradeCount,
  }))

  const bestMetrics: ReviewMetrics = {
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

  // 트리거 조건 평가 (이전 EV 포함)
  const triggerReason = evaluateTrigger(candidateSummaries, bestMetrics, previousBestEv)
  if (!triggerReason) return null

  // 비용 제어
  const allowed = await canCallAi(strategyRow.id, triggerReason)
  if (!allowed) return null

  console.log(`[파이프라인] ${sid} 승격 전 AI 리뷰: ${triggerReason}`)

  const reviewType = triggerReason === 'ambiguous_ranking' ? 'strategy_comparison' as const
    : triggerReason === 'param_re_explore' || triggerReason === 'performance_collapse'
      ? 'param_proposal' as const
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
    metrics: bestMetrics,
    segments,
    comparisonCandidates: triggerReason === 'ambiguous_ranking' ? candidateSummaries : undefined,
  })

  console.log(
    `[파이프라인] ${sid} AI 리뷰 완료: status=${result.status}, ` +
    `tokens=${result.inputTokens}+${result.outputTokens}, ${result.latencyMs}ms`
  )

  return result
}

// ─── AI 제안 → 재탐색 루프 ───────────────────────────────────

/**
 * AI의 paramSuggestions로 새 그리드를 만들어 스크리닝+검증 재실행
 *
 * @param bestParamSet 현재 최적 파라미터 (DEFAULT_PARAMS가 아닌 검증 통과 파라미터)
 * @returns 검증 통과 최적 후보 또는 null
 */
async function runAiReExplore(
  baseStrategy: Strategy,
  suggestions: ParamSuggestion[],
  bestParamSet: Record<string, number>,
  allCandles: CandleMap,
): Promise<ValidatedCandidate | null> {
  const sid = baseStrategy.config.id

  const newGrid = suggestionsToGrid(suggestions, bestParamSet, sid)
  if (newGrid.length === 0) {
    console.log(`[파이프라인] ${sid} AI 제안 그리드 변환 실패 — 재탐색 스킵`)
    return null
  }

  console.log(`[파이프라인] ${sid} AI 재탐색 시작 — ${newGrid.length}개 조합`)

  // 스크리닝
  const screeningCandles = sliceCandlesForScreening(allCandles, baseStrategy.config.timeframe)
  const screeningResults = await runScreening(sid, newGrid, screeningCandles)

  if (screeningResults.length === 0) {
    console.log(`[파이프라인] ${sid} AI 재탐색 스크리닝 통과 0개`)
    return null
  }

  // 검증
  const validationResults = await runValidationPhase(sid, screeningResults, allCandles)
  if (validationResults.length === 0) {
    console.log(`[파이프라인] ${sid} AI 재탐색 검증 통과 0개`)
    return null
  }

  // 최적 후보
  const best = validationResults.reduce((a, b) => a.oosEv > b.oosEv ? a : b)

  console.log(
    `[파이프라인] ${sid} AI 재탐색 완료 — 검증 통과 ${validationResults.length}개, ` +
    `최적 OOS EV=${best.oosEv.toFixed(2)}`
  )

  return best
}

// ─── Phase 1: Screening ───────────────────────────────────────

interface ScreeningCandidate {
  paramSet: ParamSet
  ev: number
  trades: number
  mdd: number
  totalReturn: number
}

async function runScreening(
  strategyId: string,
  grid: ParamSet[],
  screeningCandles: CandleMap,
): Promise<ScreeningCandidate[]> {
  const pool = BacktestWorkerPool.getInstance()
  const serializedCandles = serializeCandleMap(screeningCandles)

  const tasks = grid.map((paramSet) => ({
    strategyId,
    serializedCandles,
    paramOverrides: paramSet,
  }))

  const batchResults = await pool.runBatch(tasks)

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

async function runValidationPhase(
  strategyId: string,
  candidates: ScreeningCandidate[],
  allCandles: CandleMap,
): Promise<ValidatedCandidate[]> {
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

// ─── Phase 4: DB 저장 + 승격 ─────────────────────────────────

async function saveAndPromote(
  baseStrategy: Strategy,
  best: ValidatedCandidate,
  allCandles: CandleMap,
): Promise<boolean> {
  const sid = baseStrategy.config.id

  const { data: strategyRow } = await supabase
    .from('strategies')
    .select('id, status')
    .eq('strategy_id', sid)
    .single()

  if (!strategyRow) {
    console.error(`[파이프라인] ${sid} — DB에서 전략을 찾을 수 없음`)
    return false
  }

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

  const pool = BacktestWorkerPool.getInstance()
  const fullResult = await pool.runBacktest(sid, allCandles, best.paramSet)
  const fullEv = calculateExpectedValue(fullResult)

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

  const segments: Array<{ segment: SegmentResult }> = [
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

// ─── 유틸 ─────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
