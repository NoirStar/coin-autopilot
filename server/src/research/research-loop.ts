import type {
  Strategy,
  CandleMap,
  Candle,
  BacktestResult,
  StrategyStatus,
} from '../core/types.js'
import { VALIDATION_THRESHOLDS } from '../core/types.js'
import { getAllStrategies } from '../strategy/registry.js'
import { loadCandles } from '../data/candle-collector.js'
import { runBacktest } from './backtest-engine.js'
import { supabase } from '../services/database.js'

// ─── 상수 ──────────────────────────────────────────────────────

/** 타임프레임별 백테스트 캔들 수 (워밍업 200개 + 실평가 구간)
 *  1h: 18000개 ≈ 2년 (실평가 ~740일)
 *  4h: 5000개 ≈ 2.7년 (실평가 ~800일) */
const CANDLE_LIMITS: Record<string, number> = {
  '1h': 18000,
  '4h': 5000,
}
const DEFAULT_CANDLE_LIMIT = 5000

/** BTC 기준 심볼 키 (레짐 판단 + 대부분 전략에서 필요) */
const BTC_KEYS: Record<string, string> = {
  upbit: 'BTC-KRW',
  okx: 'BTC-USDT',
}

// ─── 메인 연구 루프 ────────────────────────────────────────────

/**
 * 자동 연구 파이프라인 — 크론 스케줄러에서 호출하는 진입점
 *
 * 등록된 전략 전체를 순회하며:
 *   1. 캔들 데이터 로드 (candles)
 *   2. 백테스트 실행
 *   3. research_run + metrics DB 저장
 *   4. 검증 기준 평가 → 통과 시 paper_candidate 승격
 *
 * 개별 전략 오류는 격리하여 전체 루프를 중단하지 않음.
 */
export async function runResearchLoop(): Promise<void> {
  const strategies = getAllStrategies()
  if (strategies.length === 0) {
    console.log('[연구루프] 등록된 전략 없음 — 스킵')
    return
  }

  console.log(`[연구루프] 시작 — ${strategies.length}개 전략 대상`)
  const startTime = Date.now()

  let successCount = 0
  let failCount = 0
  let promotedCount = 0

  // 쿨다운: 최근 N시간 이내 완료된 전략은 스킵 (RESEARCH_COOLDOWN_H=0 으로 비활성화 가능)
  const cooldownHours = Number(process.env.RESEARCH_COOLDOWN_H ?? 3)
  const cooldownSince = cooldownHours > 0
    ? new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()
    : null

  for (const strategy of strategies) {
    const sid = strategy.config.id
    try {
      // 중복 실행 방지 (RESEARCH_COOLDOWN_H=0 으로 비활성화)
      if (cooldownSince) {
        const strategyUuid = await getStrategyUuid(sid)
        if (strategyUuid) {
          const { count } = await supabase
            .from('research_runs')
            .select('id', { count: 'exact', head: true })
            .eq('strategy_id', strategyUuid)
            .eq('status', 'completed')
            .gte('ended_at', cooldownSince)

          if ((count ?? 0) > 0) {
            console.log(`[연구루프] ${sid} — 최근 ${cooldownHours}시간 이내 완료됨, 스킵`)
            continue
          }
        }
      }

      console.log(`[연구루프] ${sid} 백테스트 시작...`)

      // 1. 캔들 로드
      const allCandles = await loadCandlesForStrategy(strategy)
      const btcKey = BTC_KEYS[strategy.config.exchange] ?? 'BTC-KRW'
      const btcCandles = allCandles.get('BTC')

      if (!btcCandles || btcCandles.length < 201) {
        console.warn(`[연구루프] ${sid} — BTC 캔들 부족 (${btcCandles?.length ?? 0}개), 스킵`)
        continue
      }

      // 2. DB에 research_run 생성 (상태: running)
      const runId = await createResearchRun(strategy)
      if (!runId) {
        console.error(`[연구루프] ${sid} — research_run 생성 실패`)
        failCount++
        continue
      }

      // 3. 백테스트 실행
      const result = runBacktest(strategy, allCandles)

      // 4. 상태 → completed, metrics 저장
      await updateResearchRunCompleted(runId, result)
      await saveResearchRunMetrics(runId, result)

      console.log(
        `[연구루프] ${sid} 완료 | ` +
        `수익=${result.totalReturn}% | Sharpe=${result.sharpeRatio} | ` +
        `MDD=${result.maxDrawdown}% | 승률=${result.winRate}% | ` +
        `거래=${result.totalTrades}건`
      )

      // 5. 검증 기준 평가
      const promoted = await evaluateAndPromote(runId, strategy, result)
      if (promoted) promotedCount++

      successCount++
    } catch (err) {
      failCount++
      console.error(
        `[연구루프] ${sid} 오류:`,
        err instanceof Error ? err.message : err
      )

      // 오류 시에도 다음 전략으로 계속 진행
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(
    `[연구루프] 완료 — 성공=${successCount}, 실패=${failCount}, ` +
    `승격=${promotedCount}, 소요=${elapsed}s`
  )
}

// ─── 캔들 로드 ─────────────────────────────────────────────────

/**
 * 전략에 필요한 캔들 데이터를 CandleMap으로 구성
 *
 * BTC 캔들은 항상 로드 (레짐 판단용).
 * 전략 심볼 목록이 params에 있으면 해당 심볼도 로드.
 */
async function loadCandlesForStrategy(strategy: Strategy): Promise<CandleMap> {
  const { exchange, timeframe } = strategy.config
  const candleLimit = CANDLE_LIMITS[timeframe] ?? DEFAULT_CANDLE_LIMIT
  const candleMap: CandleMap = new Map()

  // BTC 캔들은 항상 로드 (레짐 판단 + 대부분 전략에서 필요)
  const btcKey = BTC_KEYS[exchange] ?? 'BTC-KRW'
  const btcCandles = await loadCandles(exchange, btcKey, timeframe, candleLimit)
  candleMap.set('BTC', btcCandles)

  // 1. 전략 파라미터에 심볼 목록이 있으면 사용
  const symbols = strategy.config.params.symbols
  if (Array.isArray(symbols) && symbols.length > 0) {
    for (const sym of symbols as unknown as string[]) {
      if (sym === btcKey) continue
      const candles = await loadCandles(exchange, sym, timeframe, candleLimit)
      const base = sym.split('-')[0]
      candleMap.set(base, candles)
    }
    return candleMap
  }

  // 2. 알트 전략 (direction: long, 거래소: upbit)이면 DB에 있는 알트 심볼 자동 로드
  if (strategy.config.assetClass === 'crypto_spot' && exchange === 'upbit') {
    const { data: altKeys } = await supabase
      .from('candles')
      .select('asset_key')
      .eq('exchange', 'upbit')
      .eq('timeframe', timeframe)
      .neq('asset_key', btcKey)

    // 중복 제거
    const uniqueKeys = [...new Set((altKeys ?? []).map((r) => r.asset_key as string))]
    for (const key of uniqueKeys) {
      const candles = await loadCandles(exchange, key, timeframe, candleLimit)
      if (candles.length < 20) continue // 너무 적으면 스킵
      const base = key.split('-')[0]
      candleMap.set(base, candles)
    }
  }

  return candleMap
}

// ─── DB 연산 ───────────────────────────────────────────────────

/**
 * research_runs 레코드 생성
 * @returns 생성된 run의 UUID, 실패 시 null
 */
async function createResearchRun(strategy: Strategy): Promise<string | null> {
  // strategies 테이블에서 전략 UUID 조회
  const strategyUuid = await getStrategyUuid(strategy.config.id)
  if (!strategyUuid) {
    console.error(`[연구루프] 전략 ${strategy.config.id}의 DB UUID를 찾을 수 없음`)
    return null
  }

  const { data, error } = await supabase
    .from('research_runs')
    .insert({
      strategy_id: strategyUuid,
      market_scope: BTC_KEYS[strategy.config.exchange] ?? 'BTC-KRW',
      parameter_set: strategy.config.params,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[연구루프] research_run 생성 오류:', error.message)
    return null
  }

  return data.id
}

/**
 * research_run 상태를 completed로 업데이트
 */
async function updateResearchRunCompleted(
  runId: string,
  result: BacktestResult
): Promise<void> {
  // period_start/end 컬럼이 DB에 있으면 저장, 없으면 무시
  const update: Record<string, unknown> = {
    status: 'completed',
    ended_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('research_runs')
    .update(update)
    .eq('id', runId)

  if (error) {
    console.error('[연구루프] research_run 업데이트 오류:', error.message)
  }
}

/**
 * research_run_metrics에 백테스트 결과 저장
 */
async function saveResearchRunMetrics(
  runId: string,
  result: BacktestResult
): Promise<void> {
  // profit_factor 계산: 총 이익 / 총 손실
  const grossProfit = result.trades
    .filter((t) => t.pnlPct > 0)
    .reduce((sum, t) => sum + t.pnlPct, 0)
  const grossLoss = Math.abs(
    result.trades
      .filter((t) => t.pnlPct < 0)
      .reduce((sum, t) => sum + t.pnlPct, 0)
  )
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0

  // 총 수수료 비율
  const totalFees = result.trades.reduce((sum, t) => sum + t.fees, 0)
  const costRatio = result.totalReturn !== 0
    ? totalFees / Math.abs(result.totalReturn)
    : 0

  const { error } = await supabase
    .from('research_run_metrics')
    .insert({
      research_run_id: runId,
      total_return: result.totalReturn,
      max_drawdown: result.maxDrawdown,
      win_rate: result.winRate,
      sharpe: result.sharpeRatio,
      profit_factor: Math.round(profitFactor * 100) / 100,
      trade_count: result.totalTrades,
      avg_hold_hours: result.avgHoldHours,
      cost_ratio: Math.round(costRatio * 10000) / 100,
      equity_curve: result.equityCurve,
      trades: result.trades.map((t) => ({
        ...t,
        entryTime: t.entryTime.toISOString(),
        exitTime: t.exitTime.toISOString(),
      })),
    })

  if (error) {
    console.error('[연구루프] metrics 저장 오류:', error.message)
  }
}

// ─── 검증 및 승격 ──────────────────────────────────────────────

/**
 * VALIDATION_THRESHOLDS 기준으로 백테스트 결과를 평가하고
 * 통과 시 전략 상태를 paper_candidate로 승격
 *
 * 기준:
 *   - Sharpe > 0.8
 *   - MDD < 15%
 *   - 승률 > 40%
 *   - 거래 수 > 20
 *
 * @returns 승격 여부
 */
async function evaluateAndPromote(
  runId: string,
  strategy: Strategy,
  result: BacktestResult
): Promise<boolean> {
  const thresholds = VALIDATION_THRESHOLDS.researchToPaper

  // 결과값은 퍼센트 단위 (예: 15.5 = 15.5%)
  const sharpePass = result.sharpeRatio >= thresholds.minSharpe
  const mddPass = result.maxDrawdown <= thresholds.maxMDD * 100     // 0.15 → 15%
  const winRatePass = result.winRate >= thresholds.minWinRate * 100  // 0.4 → 40%
  const tradesPass = result.totalTrades >= thresholds.minTrades

  const allPass = sharpePass && mddPass && winRatePass && tradesPass

  // research_run의 promotion_status 업데이트
  const promotionStatus = allPass ? 'promoted_to_paper' : 'below_threshold'
  await supabase
    .from('research_runs')
    .update({ promotion_status: promotionStatus })
    .eq('id', runId)

  if (!allPass) {
    const reasons: string[] = []
    if (!sharpePass) reasons.push(`Sharpe ${result.sharpeRatio} < ${thresholds.minSharpe}`)
    if (!mddPass) reasons.push(`MDD ${result.maxDrawdown}% > ${thresholds.maxMDD * 100}%`)
    if (!winRatePass) reasons.push(`승률 ${result.winRate}% < ${thresholds.minWinRate * 100}%`)
    if (!tradesPass) reasons.push(`거래 ${result.totalTrades} < ${thresholds.minTrades}`)
    console.log(`[연구루프] ${strategy.config.id} 미달: ${reasons.join(', ')}`)
    return false
  }

  // 전략 상태 승격: paper_candidate
  const strategyUuid = await getStrategyUuid(strategy.config.id)
  if (!strategyUuid) return false

  // 현재 상태 조회 (이미 paper 이상이면 재승격 불필요)
  const { data: currentStrategy } = await supabase
    .from('strategies')
    .select('status')
    .eq('id', strategyUuid)
    .single()

  const currentStatus = currentStrategy?.status as StrategyStatus | undefined
  const promotableStatuses: StrategyStatus[] = [
    'research_only',
    'backtest_running',
    'backtest_completed',
    'validated_candidate',
  ]

  if (currentStatus && !promotableStatuses.includes(currentStatus)) {
    console.log(
      `[연구루프] ${strategy.config.id} 이미 ${currentStatus} 상태 — 재승격 불필요`
    )
    return false
  }

  // 전략 상태 업데이트
  const { error: updateError } = await supabase
    .from('strategies')
    .update({
      status: 'paper_candidate',
      updated_at: new Date().toISOString(),
    })
    .eq('id', strategyUuid)

  if (updateError) {
    console.error('[연구루프] 전략 상태 업데이트 오류:', updateError.message)
    return false
  }

  // 승격 이력 저장
  const { error: promoError } = await supabase
    .from('research_promotions')
    .insert({
      research_run_id: runId,
      from_status: currentStatus ?? 'research_only',
      to_status: 'paper_candidate',
      reason:
        `Sharpe=${result.sharpeRatio}, MDD=${result.maxDrawdown}%, ` +
        `승률=${result.winRate}%, 거래=${result.totalTrades}건`,
    })

  if (promoError) {
    console.error('[연구루프] 승격 이력 저장 오류:', promoError.message)
  }

  console.log(
    `[연구루프] ${strategy.config.id} 승격! → paper_candidate | ` +
    `Sharpe=${result.sharpeRatio}, MDD=${result.maxDrawdown}%, ` +
    `승률=${result.winRate}%, 거래=${result.totalTrades}건`
  )

  return true
}

// ─── 유틸리티 ──────────────────────────────────────────────────

/** 전략 string ID → DB UUID 변환 (캐시) */
const strategyUuidCache = new Map<string, string>()

async function getStrategyUuid(strategyId: string): Promise<string | null> {
  // 캐시 확인
  const cached = strategyUuidCache.get(strategyId)
  if (cached) return cached

  const { data, error } = await supabase
    .from('strategies')
    .select('id')
    .eq('strategy_id', strategyId)
    .single()

  if (error || !data) {
    console.error(`[연구루프] 전략 UUID 조회 실패 (${strategyId}):`, error?.message)
    return null
  }

  strategyUuidCache.set(strategyId, data.id)
  return data.id
}
