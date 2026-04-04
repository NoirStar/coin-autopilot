/**
 * V2 실전 매매 엔진 — Phase 7
 *
 * 오케스트레이터 판단(decision)을 실제 OKX 거래소 주문으로 변환한다.
 * 거래소가 진실의 원천(source of truth)이며, 내부 DB는 거래소 상태를 따른다.
 *
 * 안전장치:
 * - LIVE_TRADING=true 환경변수가 없으면 실행하지 않음
 * - 주문 실패 시 최대 2회 재시도 (지수 백오프: 1초, 3초)
 * - 페이퍼 → 실전 승격 기준 검증 (14일+, Sharpe>0.6, 괴리<30%)
 * - 모든 주문은 격리(isolated) 마진, 청산은 reduce-only
 */

import { supabase } from '../services/database.js'
import {
  fetchOpenPositions,
  fetchBalance,
  createMarketOrder,
  setLeverage,
  setMarginMode,
  calculatePositionSize,
  fetchOkxPrice,
  type OkxPosition,
  type OrderResult,
} from '../exchange/okx-client.js'
import {
  VALIDATION_THRESHOLDS,
  type DecisionType,
  type DecisionStatus,
  type PositionSide,
  type OrderSide,
} from '../core/types.js'

// ─── 상수 ─────────────────────────────────────────────────────

/** 재시도 설정 */
const MAX_RETRIES = 2
const RETRY_DELAYS_MS = [1000, 3000] // 지수 백오프: 1초, 3초

/** 페이퍼 → 실전 승격 기준 */
const PAPER_TO_LIVE = VALIDATION_THRESHOLDS.paperToLive

/** 기본 레버리지 */
const DEFAULT_LEVERAGE = 2

/** 기본 마진 모드 */
const DEFAULT_MARGIN_MODE: 'isolated' | 'cross' = 'isolated'

/** 단일 포지션 최대 리스크 (계좌 대비 %) */
const MAX_POSITION_RISK_PCT = 0.01 // 1%

/** 기본 손절 비율 */
const DEFAULT_STOP_LOSS_PCT = 0.03 // 3%

// ─── 실전 매매 활성화 체크 ────────────────────────────────────

/** 실전 매매 허용 여부 확인 */
function isLiveTradingEnabled(): boolean {
  return process.env.LIVE_TRADING === 'true'
}

/** 실전 매매 비활성 시 경고 로그 */
function guardLiveTrading(caller: string): boolean {
  if (!isLiveTradingEnabled()) {
    console.log(`[V2실전] ${caller}: LIVE_TRADING=true가 아님, 스킵`)
    return false
  }
  return true
}

// ─── 재시도 유틸 ──────────────────────────────────────────────

/** 지수 백오프 재시도 래퍼 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt]
        console.warn(`[V2실전] ${label}: 시도 ${attempt + 1} 실패, ${delay}ms 후 재시도`, err)
        await sleep(delay)
      }
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── 판단 실행 ────────────────────────────────────────────────

/**
 * 오케스트레이터 판단을 실전 주문으로 실행
 *
 * 흐름:
 *   1. 판단 조회 및 상태 검증
 *   2. 판단 유형에 따라 주문 생성
 *   3. live_orders, live_fills, live_positions 기록
 *   4. 판단 상태 업데이트 (EXECUTING → EXECUTED/FAILED)
 */
export async function executeLiveDecision(decisionId: string): Promise<boolean> {
  if (!guardLiveTrading('executeLiveDecision')) return false

  console.log(`[V2실전] 판단 ${decisionId} 실행 시작`)

  // 판단 조회
  const { data: decision, error: fetchErr } = await supabase
    .from('orchestrator_decisions')
    .select('*')
    .eq('id', decisionId)
    .single()

  if (fetchErr || !decision) {
    console.error(`[V2실전] 판단 ${decisionId} 조회 실패:`, fetchErr?.message)
    return false
  }

  // pending 상태만 실행 가능
  if (decision.status !== 'pending') {
    console.warn(`[V2실전] 판단 ${decisionId} 상태가 pending이 아님: ${decision.status}`)
    return false
  }

  // PENDING → EXECUTING
  await updateDecisionStatus(decisionId, 'executing')

  try {
    const decisionType = decision.decision_type as DecisionType

    switch (decisionType) {
      case 'strategy_assign':
        await handleLiveAssign(decision)
        break
      case 'strategy_switch':
        await handleLiveSwitch(decision)
        break
      case 'strategy_retire':
        await handleLiveRetire(decision)
        break
      case 'go_flat':
        await closeAllPositions('go_flat')
        break
      case 'rebalance':
        // 리밸런스는 기존 포지션 크기 조정 — Phase 7에서는 로깅만
        console.log(`[V2실전] 리밸런스 판단 — 현재 버전에서는 로깅만 수행`)
        break
      default:
        console.warn(`[V2실전] 알 수 없는 판단 유형: ${decisionType}`)
    }

    // EXECUTING → EXECUTED
    await updateDecisionStatus(decisionId, 'executed')
    console.log(`[V2실전] 판단 ${decisionId} 실행 완료 (${decisionType})`)
    return true
  } catch (err) {
    // EXECUTING → FAILED
    await updateDecisionStatus(decisionId, 'failed')
    console.error(`[V2실전] 판단 ${decisionId} 실행 실패:`, err)
    return false
  }
}

// ─── 포지션 조정(Reconcile) ───────────────────────────────────

/**
 * 포지션 조정 — 거래소가 진실의 원천
 *
 * OKX 실제 포지션과 live_positions를 비교하여
 * 불일치가 있으면 DB를 거래소 기준으로 수정한다.
 * 불일치 발생 시 position_divergence 리스크 이벤트를 기록한다.
 */
export async function reconcilePositions(): Promise<void> {
  if (!guardLiveTrading('reconcilePositions')) return

  console.log('[V2실전] 포지션 조정 시작')

  // 1. 거래소 현재 포지션 조회
  let exchangePositions: OkxPosition[]
  try {
    exchangePositions = await fetchOpenPositions()
  } catch (err) {
    console.error('[V2실전] 거래소 포지션 조회 실패:', err)
    return
  }

  // 2. DB 오픈 포지션 조회
  const { data: dbPositions, error: dbErr } = await supabase
    .from('live_positions')
    .select('*')
    .eq('status', 'open')

  if (dbErr) {
    console.error('[V2실전] DB 포지션 조회 실패:', dbErr.message)
    return
  }

  const dbPositionList = dbPositions ?? []

  // 3. 거래소 포지션을 asset_key로 매핑
  const exchangeMap = new Map<string, OkxPosition>()
  for (const pos of exchangePositions) {
    // OKX 심볼을 내부 asset_key로 변환 (예: BTC → BTC-USDT-SWAP)
    const assetKey = `${pos.symbol}-USDT-SWAP`
    exchangeMap.set(assetKey, pos)
  }

  // 4. DB에 있는데 거래소에 없는 포지션 → 이미 청산된 것, DB 업데이트
  for (const dbPos of dbPositionList) {
    const exchangePos = exchangeMap.get(dbPos.asset_key as string)

    if (!exchangePos) {
      // 거래소에 없음 → DB 포지션을 closed로 전환
      console.warn(`[V2실전] 불일치 감지: ${dbPos.asset_key} DB에 open이지만 거래소에 없음`)

      await supabase
        .from('live_positions')
        .update({
          status: 'closed',
          exit_time: new Date().toISOString(),
          exit_reason: 'reconcile_missing',
          current_qty: 0,
        })
        .eq('id', dbPos.id)

      await createRiskEvent('position_divergence', 'warning', {
        assetKey: dbPos.asset_key,
        type: 'db_has_exchange_missing',
        message: `DB에 오픈 포지션이 있으나 거래소에서 찾을 수 없음`,
      })

      continue
    }

    // 수량 불일치 확인 (5% 이상 차이)
    const dbQty = Number(dbPos.current_qty)
    const exQty = exchangePos.size
    const qtyDivergence = Math.abs(dbQty - exQty) / Math.max(dbQty, exQty, 0.0001)

    if (qtyDivergence > 0.05) {
      console.warn(
        `[V2실전] 수량 불일치: ${dbPos.asset_key} DB=${dbQty} 거래소=${exQty}`,
      )

      // 거래소 기준으로 DB 업데이트
      await supabase
        .from('live_positions')
        .update({
          current_qty: exQty,
          unrealized_pnl: exchangePos.unrealizedPnl,
        })
        .eq('id', dbPos.id)

      await createRiskEvent('position_divergence', 'warning', {
        assetKey: dbPos.asset_key,
        type: 'quantity_mismatch',
        dbQty,
        exchangeQty: exQty,
        divergencePct: (qtyDivergence * 100).toFixed(2),
      })
    } else {
      // 미실현 손익만 갱신
      // 숏 포지션: 최저가가 peak (최대 수익 지점), 롱 포지션: 최고가가 peak
      const dbPeak = Number(dbPos.peak_price ?? 0)
      const isShort = dbPos.side === 'short'
      const newPeak = isShort
        ? (dbPeak === 0 ? exchangePos.markPrice : Math.min(dbPeak, exchangePos.markPrice))
        : Math.max(dbPeak, exchangePos.markPrice)

      await supabase
        .from('live_positions')
        .update({
          unrealized_pnl: exchangePos.unrealizedPnl,
          peak_price: newPeak,
        })
        .eq('id', dbPos.id)
    }

    // 확인 완료 — Map에서 제거
    exchangeMap.delete(dbPos.asset_key as string)
  }

  // 5. 거래소에 있는데 DB에 없는 포지션 → DB에 추가
  for (const [assetKey, pos] of exchangeMap) {
    console.warn(`[V2실전] 불일치 감지: ${assetKey} 거래소에 있으나 DB에 없음`)

    await supabase.from('live_positions').insert({
      asset_key: assetKey,
      exchange: 'okx',
      side: pos.side,
      entry_price: pos.entryPrice,
      current_qty: pos.size,
      peak_price: pos.markPrice,
      unrealized_pnl: pos.unrealizedPnl,
      leverage: pos.leverage,
      margin_mode: pos.marginMode,
      status: 'open',
    })

    await createRiskEvent('position_divergence', 'warning', {
      assetKey,
      type: 'exchange_has_db_missing',
      message: `거래소에 포지션이 있으나 DB에 기록이 없음 — 자동 등록`,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
    })
  }

  console.log('[V2실전] 포지션 조정 완료')
}

// ─── 개별 포지션 청산 ─────────────────────────────────────────

/**
 * 특정 포지션 청산
 *
 * live_positions.id를 받아서:
 *   1. DB에서 포지션 정보 조회
 *   2. OKX에 시장가 청산 주문
 *   3. DB 상태 업데이트
 */
export async function closePosition(
  positionId: string,
  reason: string,
  partialRatio: number = 1.0,
): Promise<boolean> {
  if (!guardLiveTrading('closePosition')) return false

  console.log(`[V2실전] 포지션 ${positionId} 청산 시작 (사유: ${reason}, 비율: ${partialRatio})`)

  // DB에서 포지션 조회
  const { data: position, error: posErr } = await supabase
    .from('live_positions')
    .select('*')
    .eq('id', positionId)
    .eq('status', 'open')
    .single()

  if (posErr || !position) {
    console.error(`[V2실전] 포지션 ${positionId} 조회 실패:`, posErr?.message)
    return false
  }

  const assetKey = position.asset_key as string
  const side = position.side as PositionSide
  const totalQty = Number(position.current_qty)
  const closeQty = totalQty * partialRatio

  // 심볼 추출 (예: BTC-USDT-SWAP → BTC)
  const symbol = assetKey.split('-')[0]
  const closeSide: OrderSide = side === 'long' ? 'sell' : 'buy'

  try {
    // 시장가 청산 (reduce-only)
    const result = await withRetry(
      () => createMarketOrder(symbol, closeSide, closeQty, true),
      `${symbol} 청산`,
    )

    const exitPrice = result.price ?? await fetchOkxPrice(symbol)

    // live_orders에 주문 기록
    const orderId = await saveLiveOrder({
      decisionId: null,
      assetKey,
      exchange: 'okx',
      side: closeSide,
      positionSide: side,
      orderType: 'market',
      requestedQty: closeQty,
      requestedPrice: null,
      exchangeOrderId: result.id,
      status: 'filled',
    })

    // live_fills에 체결 기록
    if (orderId) {
      await saveLiveFill(orderId, closeQty, exitPrice, result.fee ?? 0, result.id)
    }

    // live_positions 상태 업데이트
    const entryPrice = Number(position.entry_price)
    const pnlMultiplier = side === 'long' ? 1 : -1
    const realizedPnl = (exitPrice - entryPrice) * closeQty * pnlMultiplier

    if (partialRatio >= 1.0) {
      // 전량 청산
      await supabase
        .from('live_positions')
        .update({
          status: 'closed',
          exit_time: new Date().toISOString(),
          exit_reason: reason,
          current_qty: 0,
          realized_pnl: Number(position.realized_pnl ?? 0) + realizedPnl,
          unrealized_pnl: 0,
        })
        .eq('id', positionId)
    } else {
      // 부분 청산: 수량 감소, realized_pnl 누적
      await supabase
        .from('live_positions')
        .update({
          current_qty: totalQty - closeQty,
          realized_pnl: Number(position.realized_pnl ?? 0) + realizedPnl,
        })
        .eq('id', positionId)
    }

    console.log(`[V2실전] 포지션 ${positionId} 청산 완료: ${symbol} ${side} ${partialRatio < 1 ? `${(partialRatio * 100).toFixed(0)}%` : '전량'} → 수익 $${realizedPnl.toFixed(2)}`)
    return true
  } catch (err) {
    console.error(`[V2실전] 포지션 ${positionId} 청산 실패 (재시도 소진):`, err)
    return false
  }
}

// ─── 전체 포지션 청산 (긴급) ──────────────────────────────────

/**
 * 모든 오픈 포지션 긴급 청산
 *
 * go_flat 또는 circuit_breaker 시 호출.
 * 모든 live_positions(status='open')를 순회하며 청산한다.
 */
export async function closeAllPositions(reason: string): Promise<void> {
  if (!guardLiveTrading('closeAllPositions')) return

  console.log(`[V2실전] 전체 포지션 청산 시작 (사유: ${reason})`)

  const { data: openPositions, error } = await supabase
    .from('live_positions')
    .select('id, asset_key')
    .eq('status', 'open')

  if (error || !openPositions) {
    console.error('[V2실전] 오픈 포지션 조회 실패:', error?.message)
    return
  }

  if (openPositions.length === 0) {
    console.log('[V2실전] 오픈 포지션 없음, 청산 불필요')
    return
  }

  console.log(`[V2실전] 오픈 포지션 ${openPositions.length}개 청산 시작`)

  let successCount = 0
  let failCount = 0

  for (const pos of openPositions) {
    const success = await closePosition(pos.id, reason)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log(`[V2실전] 전체 청산 완료: 성공=${successCount}, 실패=${failCount}`)

  // 실패한 포지션이 있으면 리스크 이벤트 기록
  if (failCount > 0) {
    await createRiskEvent('circuit_breaker', 'critical', {
      reason,
      message: `전체 청산 중 ${failCount}개 포지션 청산 실패`,
      successCount,
      failCount,
    })
  }
}

// ─── 페이퍼 → 실전 승격 검증 ─────────────────────────────────

/**
 * 페이퍼 → 실전 승격 가능 여부 검증
 *
 * 기준:
 * - 최소 14일 페이퍼 실행
 * - Sharpe > 0.6
 * - 백테스트 대비 괴리율 < 30%
 */
export async function checkPaperToLivePromotion(strategyDbId: string): Promise<{
  eligible: boolean
  reason: string
  metrics: {
    runningDays: number
    sharpe: number | null
    divergence: number | null
  }
}> {
  // 페이퍼 세션 조회 (해당 전략의 가장 최근 완료 세션)
  const { data: session, error: sessErr } = await supabase
    .from('paper_sessions')
    .select('*')
    .eq('strategy_id', strategyDbId)
    .in('status', ['running', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (sessErr || !session) {
    return {
      eligible: false,
      reason: '페이퍼 세션을 찾을 수 없음',
      metrics: { runningDays: 0, sharpe: null, divergence: null },
    }
  }

  // 실행 일수 계산
  const startDate = new Date(session.started_at as string)
  const runningDays = Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000))

  if (runningDays < PAPER_TO_LIVE.minDays) {
    return {
      eligible: false,
      reason: `페이퍼 실행 기간 부족: ${runningDays}일 < ${PAPER_TO_LIVE.minDays}일`,
      metrics: { runningDays, sharpe: null, divergence: null },
    }
  }

  // 페이퍼 성과 — 에퀴티 스냅샷 기반 Sharpe 추정
  const { data: snapshots } = await supabase
    .from('equity_snapshots')
    .select('total_equity, recorded_at')
    .eq('source', 'paper')
    .order('recorded_at', { ascending: true })

  if (!snapshots || snapshots.length < 2) {
    return {
      eligible: false,
      reason: '에퀴티 스냅샷 데이터 부족',
      metrics: { runningDays, sharpe: null, divergence: null },
    }
  }

  // 일일 수익률 계산 → Sharpe 추정
  const dailyReturns: number[] = []
  for (let i = 1; i < snapshots.length; i++) {
    const prev = Number(snapshots[i - 1].total_equity)
    const curr = Number(snapshots[i].total_equity)
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev)
    }
  }

  const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length
  const stdReturn = Math.sqrt(variance)
  const annualizedSharpe = stdReturn > 0
    ? (meanReturn / stdReturn) * Math.sqrt(365)
    : 0

  if (annualizedSharpe < PAPER_TO_LIVE.minSharpe) {
    return {
      eligible: false,
      reason: `Sharpe 부족: ${annualizedSharpe.toFixed(3)} < ${PAPER_TO_LIVE.minSharpe}`,
      metrics: { runningDays, sharpe: annualizedSharpe, divergence: null },
    }
  }

  // 백테스트 대비 괴리율 계산
  const { data: backtestMetrics } = await supabase
    .from('research_run_metrics')
    .select('total_return')
    .eq('research_run_id', (
      await supabase
        .from('research_runs')
        .select('id')
        .eq('strategy_id', strategyDbId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
    ).data?.id ?? '')
    .single()

  const backtestReturn = Number(backtestMetrics?.total_return ?? 0)
  const initialCapital = Number(session.initial_capital)
  const currentEquity = Number(session.current_equity)
  const paperReturn = initialCapital > 0 ? (currentEquity - initialCapital) / initialCapital : 0

  const divergence = backtestReturn !== 0
    ? Math.abs(paperReturn - backtestReturn) / Math.abs(backtestReturn)
    : 0

  if (divergence > PAPER_TO_LIVE.maxDivergence) {
    return {
      eligible: false,
      reason: `백테스트 괴리율 초과: ${(divergence * 100).toFixed(1)}% > ${(PAPER_TO_LIVE.maxDivergence * 100).toFixed(0)}%`,
      metrics: { runningDays, sharpe: annualizedSharpe, divergence },
    }
  }

  return {
    eligible: true,
    reason: `승격 가능: ${runningDays}일 실행, Sharpe=${annualizedSharpe.toFixed(3)}, 괴리율=${(divergence * 100).toFixed(1)}%`,
    metrics: { runningDays, sharpe: annualizedSharpe, divergence },
  }
}

// ─── 판단 유형별 핸들러 ───────────────────────────────────────

/** 새 전략 배치 → 해당 전략의 포지션 진입 */
async function handleLiveAssign(decision: Record<string, unknown>): Promise<void> {
  const strategyDbId = decision.to_strategy_id as string
  if (!strategyDbId) {
    console.warn('[V2실전] assign 판단에 to_strategy_id가 없음')
    return
  }

  // 전략 정보 조회
  const { data: strategy } = await supabase
    .from('strategies')
    .select('strategy_id, exchange, direction, default_params')
    .eq('id', strategyDbId)
    .single()

  if (!strategy) {
    console.error(`[V2실전] 전략 ${strategyDbId} 정보 조회 실패`)
    return
  }

  console.log(`[V2실전] 전략 배치: ${strategy.strategy_id} (${strategy.direction})`)

  // 슬롯의 자본 배분 비율 조회
  const slotId = decision.slot_id as string | null
  let allocationPct = 100

  if (slotId) {
    const { data: slot } = await supabase
      .from('orchestrator_slots')
      .select('allocation_pct')
      .eq('id', slotId)
      .single()

    if (slot) {
      allocationPct = Number(slot.allocation_pct)
    }
  }

  // 계좌 잔고 조회 → 포지션 크기 계산
  const balance = await fetchBalance()
  const allocatedCapital = balance.total * (allocationPct / 100)
  const params = (strategy.default_params ?? {}) as Record<string, number>
  const leverage = params.leverage ?? DEFAULT_LEVERAGE

  // BTC 기본 진입 (Phase 7 초기는 BTC 단일 자산)
  const symbol = 'BTC'
  const assetKey = `${symbol}-USDT-SWAP`

  try {
    await setLeverage(symbol, leverage)
    await setMarginMode(symbol, DEFAULT_MARGIN_MODE)

    const price = await fetchOkxPrice(symbol)
    const positionUsd = calculatePositionSize(
      allocatedCapital,
      MAX_POSITION_RISK_PCT,
      DEFAULT_STOP_LOSS_PCT,
      leverage,
    )
    const amount = positionUsd / price

    if (amount <= 0 || positionUsd < 10) {
      console.log(`[V2실전] ${symbol} 포지션 크기 너무 작음 ($${positionUsd.toFixed(2)}), 스킵`)
      return
    }

    const side: OrderSide = strategy.direction === 'short' ? 'sell' : 'buy'
    const positionSide: PositionSide = strategy.direction === 'short' ? 'short' : 'long'

    const result = await withRetry(
      () => createMarketOrder(symbol, side, amount),
      `${symbol} 진입`,
    )

    const entryPrice = result.price ?? price

    // live_orders 기록
    const orderId = await saveLiveOrder({
      decisionId: decision.id as string,
      assetKey,
      exchange: 'okx',
      side,
      positionSide,
      orderType: 'market',
      requestedQty: amount,
      requestedPrice: null,
      exchangeOrderId: result.id,
      status: 'filled',
    })

    // live_fills 기록
    if (orderId) {
      await saveLiveFill(orderId, amount, entryPrice, result.fee ?? 0, result.id)
    }

    // live_positions 기록 (strategy_id로 소유 전략 추적)
    await supabase.from('live_positions').insert({
      asset_key: assetKey,
      exchange: 'okx',
      side: positionSide,
      entry_price: entryPrice,
      current_qty: amount,
      peak_price: entryPrice,
      leverage,
      margin_mode: DEFAULT_MARGIN_MODE,
      strategy_id: strategyDbId,
      status: 'open',
    })

    console.log(`[V2실전] ${symbol} ${positionSide} 진입 완료: $${entryPrice} x ${amount.toFixed(6)}`)
  } catch (err) {
    console.error(`[V2실전] ${symbol} 진입 실패:`, err)
    throw err
  }
}

/** 전략 교체 → 기존 포지션 청산 + 새 전략 포지션 진입 */
async function handleLiveSwitch(decision: Record<string, unknown>): Promise<void> {
  const fromStrategyId = decision.from_strategy_id as string | null
  const toStrategyId = decision.to_strategy_id as string | null

  console.log(`[V2실전] 전략 교체: ${fromStrategyId} → ${toStrategyId}`)

  // 기존 전략의 오픈 포지션만 청산 (strategy_id 기준)
  if (fromStrategyId) {
    const { data: openPositions } = await supabase
      .from('live_positions')
      .select('id')
      .eq('status', 'open')
      .eq('strategy_id', fromStrategyId)

    if (openPositions) {
      for (const pos of openPositions) {
        await closePosition(pos.id, 'strategy_switch')
      }
    }
  }

  // 새 전략 배치
  if (toStrategyId) {
    await handleLiveAssign({
      ...decision,
      to_strategy_id: toStrategyId,
    })
  }
}

/** 전략 퇴역 → 해당 전략의 오픈 포지션만 청산 */
async function handleLiveRetire(decision: Record<string, unknown>): Promise<void> {
  const strategyId = decision.from_strategy_id as string | null
  console.log(`[V2실전] 전략 퇴역: ${strategyId}`)

  if (!strategyId) return

  // 해당 전략의 오픈 포지션만 청산
  const { data: openPositions } = await supabase
    .from('live_positions')
    .select('id')
    .eq('status', 'open')
    .eq('strategy_id', strategyId)

  if (openPositions) {
    for (const pos of openPositions) {
      await closePosition(pos.id, 'strategy_retire')
    }
  }
}

// ─── DB 기록 헬퍼 ─────────────────────────────────────────────

/** 판단 상태 업데이트 */
async function updateDecisionStatus(
  decisionId: string,
  status: DecisionStatus,
): Promise<void> {
  const updateData: Record<string, unknown> = { status }
  if (status === 'executed' || status === 'failed') {
    updateData.executed_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('orchestrator_decisions')
    .update(updateData)
    .eq('id', decisionId)

  if (error) {
    console.error(`[V2실전] 판단 상태 업데이트 실패 (${decisionId} → ${status}):`, error.message)
  }
}

/** live_orders에 주문 저장 → 생성된 id 반환 */
async function saveLiveOrder(params: {
  decisionId: string | null
  assetKey: string
  exchange: string
  side: OrderSide
  positionSide: PositionSide
  orderType: string
  requestedQty: number
  requestedPrice: number | null
  exchangeOrderId: string
  status: string
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('live_orders')
    .insert({
      decision_id: params.decisionId,
      asset_key: params.assetKey,
      exchange: params.exchange,
      side: params.side,
      position_side: params.positionSide,
      order_type: params.orderType,
      requested_qty: params.requestedQty,
      requested_price: params.requestedPrice,
      exchange_order_id: params.exchangeOrderId,
      status: params.status,
      submitted_at: new Date().toISOString(),
      filled_at: params.status === 'filled' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[V2실전] 주문 저장 실패:', error.message)
    return null
  }

  return data?.id ?? null
}

/** live_fills에 체결 저장 */
async function saveLiveFill(
  orderId: string,
  fillQty: number,
  fillPrice: number,
  fillFee: number,
  exchangeFillId: string,
): Promise<void> {
  const { error } = await supabase
    .from('live_fills')
    .insert({
      order_id: orderId,
      fill_qty: fillQty,
      fill_price: fillPrice,
      fill_fee: fillFee,
      exchange_fill_id: exchangeFillId,
    })

  if (error) {
    console.error('[V2실전] 체결 저장 실패:', error.message)
  }
}

/** risk_events에 리스크 이벤트 기록 */
async function createRiskEvent(
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('risk_events')
    .insert({
      event_type: eventType,
      severity,
      details,
    })

  if (error) {
    console.error('[V2실전] 리스크 이벤트 저장 실패:', error.message)
  }
}
