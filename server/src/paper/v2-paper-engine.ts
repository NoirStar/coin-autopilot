import { supabase } from '../services/database.js'
import { calculatePnlPct } from '../services/pnl-calculator.js'
import { getStrategy, safeEvaluate, safeEvaluateExits } from '../strategy/v2-registry.js'
import { detectRegime } from '../data/v2-regime-detector.js'
import { loadCandles, fetchUpbitKrwSymbols } from '../data/v2-candle-collector.js'
import type {
  CandleMap,
  Candle,
  RegimeState,
  Timeframe,
  PositionSide,
  SessionStatus,
  OpenPosition,
} from '../core/types.js'

/**
 * V2 가상매매 엔진
 *
 * 크론(4H)에서 호출되어:
 * 1. 활성 세션(running) 조회
 * 2. 각 세션의 전략으로 시그널 평가 (safeEvaluate / safeEvaluateExits)
 * 3. 가상 주문 → 체결 → 포지션 흐름으로 진입/청산
 * 4. 세션 성과 + 에퀴티 스냅샷 저장
 */

// ─── 슬리피지 모델 ───────────────────────────────────────────
/** 거래소별 슬리피지 기본값 (불리한 방향으로 적용) */
const SLIPPAGE: Record<string, number> = {
  upbit: 0.001,   // 0.1% — 업비트 현물
  okx: 0.0005,    // 0.05% — OKX 선물
}

// ─── DB 행 타입 ──────────────────────────────────────────────

interface PaperSessionRow {
  id: string
  strategy_id: string
  status: SessionStatus
  initial_capital: number
  current_equity: number
  current_drawdown: number
  v2_strategies?: { strategy_id: string; exchange: string; timeframe: string }
}

interface PaperPositionRow {
  id: string
  session_id: string
  asset_key: string
  side: PositionSide
  entry_price: number
  current_qty: number
  peak_price: number | null
  unrealized_pnl: number
  realized_pnl: number
  entry_time: string
  status: string
}

// ─── 세션 관리 ───────────────────────────────────────────────

/**
 * 새 가상매매 세션 생성
 * @param strategyId v2_strategies.id (uuid)
 * @param initialCapital 초기 자본 (기본 10,000 USDT)
 */
export async function createSession(
  strategyId: string,
  initialCapital: number = 10_000,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('v2_paper_sessions')
    .insert({
      strategy_id: strategyId,
      status: 'running' satisfies SessionStatus,
      initial_capital: initialCapital,
      current_equity: initialCapital,
      current_drawdown: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[V2 가상매매] 세션 생성 오류:', error.message)
    return null
  }

  console.log(`[V2 가상매매] 세션 생성 완료: ${data.id}`)
  return data.id as string
}

/**
 * 세션 일시정지
 */
export async function pauseSession(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('v2_paper_sessions')
    .update({ status: 'paused' satisfies SessionStatus })
    .eq('id', id)
    .eq('status', 'running')

  if (error) {
    console.error(`[V2 가상매매] 세션 ${id} 일시정지 오류:`, error.message)
    return false
  }

  console.log(`[V2 가상매매] 세션 ${id} 일시정지`)
  return true
}

/**
 * 세션 재개
 */
export async function resumeSession(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('v2_paper_sessions')
    .update({ status: 'running' satisfies SessionStatus })
    .eq('id', id)
    .eq('status', 'paused')

  if (error) {
    console.error(`[V2 가상매매] 세션 ${id} 재개 오류:`, error.message)
    return false
  }

  console.log(`[V2 가상매매] 세션 ${id} 재개`)
  return true
}

/**
 * 세션 중지 (종료)
 */
export async function stopSession(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('v2_paper_sessions')
    .update({
      status: 'stopped' satisfies SessionStatus,
      ended_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['running', 'paused'] satisfies SessionStatus[])

  if (error) {
    console.error(`[V2 가상매매] 세션 ${id} 중지 오류:`, error.message)
    return false
  }

  console.log(`[V2 가상매매] 세션 ${id} 중지`)
  return true
}

// ─── 메인 사이클 ─────────────────────────────────────────────

/**
 * 가상매매 크론 실행 (4H마다 호출)
 */
export async function runPaperTradingCycle(): Promise<void> {
  console.log('[V2 가상매매] 사이클 시작')

  // 활성 세션 조회 (running 상태만)
  const { data: sessions, error: sessErr } = await supabase
    .from('v2_paper_sessions')
    .select('*, v2_strategies(strategy_id, exchange, timeframe)')
    .eq('status', 'running')

  if (sessErr || !sessions || sessions.length === 0) {
    console.log('[V2 가상매매] 활성 세션 없음')
    return
  }

  // BTC 캔들 로드 (레짐 판단용 — 업비트 BTC-KRW 4h)
  const btcCandles = await loadCandles('upbit', 'BTC-KRW', '4h', 500)
  if (btcCandles.length < 201) {
    console.log('[V2 가상매매] BTC 캔들 부족, 스킵')
    return
  }

  // V2 레짐 탐지
  const regime = detectRegime(btcCandles)
  console.log(`[V2 가상매매] BTC 레짐: ${regime}`)

  for (const session of sessions) {
    try {
      await processSession(session as PaperSessionRow, btcCandles, regime)
    } catch (err) {
      console.error(`[V2 가상매매] 세션 ${session.id} 처리 오류:`, err)
    }
  }

  console.log('[V2 가상매매] 사이클 완료')
}

// ─── 세션 처리 ───────────────────────────────────────────────

async function processSession(
  session: PaperSessionRow,
  btcCandles: Candle[],
  regime: RegimeState,
): Promise<void> {
  const sessionId = session.id
  const strategyMeta = session.v2_strategies
  const strategyId = strategyMeta?.strategy_id ?? ''

  // V2 레지스트리에서 전략 조회
  const strategy = getStrategy(strategyId)
  if (!strategy) {
    console.log(`[V2 가상매매] 세션 ${sessionId}: 미등록 전략 ${strategyId}`)
    return
  }

  const exchange = strategy.config.exchange
  const tf = (strategy.config.timeframe ?? '4h') as Timeframe

  // ── 캔들 로드 ──
  const candleMap: CandleMap = new Map()

  if (exchange === 'okx') {
    // OKX 선물: BTC + ETH
    const btcOkx = await loadCandles('okx', 'BTC-USDT', tf, 300)
    candleMap.set('BTC-USDT', btcOkx.length > 0 ? btcOkx : btcCandles)
    try {
      const ethCandles = await loadCandles('okx', 'ETH-USDT', tf, 300)
      if (ethCandles.length > 0) candleMap.set('ETH-USDT', ethCandles)
    } catch { /* ETH 캔들 실패 시 BTC만 진행 */ }
  } else {
    // 업비트 현물: BTC + 알트코인
    candleMap.set('BTC-KRW', btcCandles)
    const altAssetKeys = await fetchUpbitKrwSymbols()
    for (const assetKey of altAssetKeys) {
      try {
        const candles = await loadCandles('upbit', assetKey, tf, 300)
        if (candles.length > 0) candleMap.set(assetKey, candles)
      } catch { /* 개별 심볼 실패 무시 */ }
    }
  }

  // ── 현재 오픈 포지션 조회 ──
  const { data: openPositions } = await supabase
    .from('v2_paper_positions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'open')

  const positions = (openPositions ?? []) as PaperPositionRow[]

  // ── 청산 시그널 평가 (safeEvaluateExits) ──
  const posArray: OpenPosition[] = positions.map((p) => {
    const entryTime = new Date(p.entry_time)
    const hoursSince = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60)
    return {
      symbol: p.asset_key,
      entryPrice: p.entry_price,
      entryTime,
      candlesSinceEntry: Math.floor(hoursSince / 4), // 4H 캔들 기준
      side: p.side,
      peakPrice: p.peak_price ?? p.entry_price,
      quantity: p.current_qty,
    }
  })

  const exitSignals = safeEvaluateExits(strategyId, candleMap, regime, posArray)

  // ── 청산 처리 ──
  for (const exit of exitSignals) {
    const pos = positions.find((p) => p.asset_key === exit.symbol && p.status === 'open')
    if (!pos) continue

    // 캔들 시가 + 슬리피지로 가상 청산
    const currentCandles = candleMap.get(exit.symbol)
    const slippage = SLIPPAGE[exchange] ?? SLIPPAGE.upbit
    const rawExitPrice = currentCandles
      ? currentCandles[currentCandles.length - 1].open
      : pos.entry_price

    // 청산 시 불리한 방향: 롱 = 낮게, 숏 = 높게
    const isLong = pos.side === 'long'
    const exitPrice = isLong
      ? rawExitPrice * (1 - slippage)
      : rawExitPrice * (1 + slippage)

    const { rawPnlPct } = calculatePnlPct(pos.entry_price, exitPrice, pos.side)
    const realizedPnl = pos.current_qty * pos.entry_price * rawPnlPct
    const slippageBps = slippage * 10_000

    // 주문 생성 → 체결 생성 → 포지션 업데이트
    const exitSide = isLong ? 'sell' : 'buy'

    const { data: order } = await supabase
      .from('v2_paper_orders')
      .insert({
        session_id: sessionId,
        asset_key: exit.symbol,
        side: exitSide,
        position_side: pos.side,
        order_type: 'market',
        requested_qty: pos.current_qty,
        requested_price: rawExitPrice,
        status: 'filled',
        submitted_at: new Date().toISOString(),
        filled_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (order) {
      // 체결 기록
      await supabase
        .from('v2_paper_fills')
        .insert({
          order_id: order.id,
          fill_qty: pos.current_qty,
          fill_price: exitPrice,
          fill_fee: 0,
          slippage_bps: slippageBps,
        })
    }

    // 포지션 종료
    await supabase
      .from('v2_paper_positions')
      .update({
        status: 'closed',
        realized_pnl: Math.round(realizedPnl * 100) / 100,
        unrealized_pnl: 0,
        exit_time: new Date().toISOString(),
        exit_reason: exit.reason,
      })
      .eq('id', pos.id)

    console.log(
      `[V2 가상매매] 세션 ${sessionId}: ${exit.symbol} ${exit.reason} ` +
      `(${rawPnlPct * 100 > 0 ? '+' : ''}${(rawPnlPct * 100).toFixed(2)}%)`,
    )
  }

  // ── peakPrice 업데이트: 아직 열린 포지션의 최고/최저가 갱신 ──
  const exitedSymbols = new Set(exitSignals.map((e) => e.symbol))
  for (const pos of positions) {
    if (pos.status !== 'open' || exitedSymbols.has(pos.asset_key)) continue
    const currentCandles = candleMap.get(pos.asset_key)
    if (!currentCandles || currentCandles.length === 0) continue

    const currentPrice = currentCandles[currentCandles.length - 1].close
    const oldPeak = pos.peak_price ?? pos.entry_price
    const isLong = pos.side === 'long'
    const newPeak = isLong
      ? Math.max(oldPeak, currentPrice)
      : Math.min(oldPeak, currentPrice)

    // unrealized PnL도 갱신
    const { rawPnlPct } = calculatePnlPct(pos.entry_price, currentPrice, pos.side)
    const unrealizedPnl = pos.current_qty * pos.entry_price * rawPnlPct

    if (newPeak !== oldPeak || unrealizedPnl !== pos.unrealized_pnl) {
      await supabase
        .from('v2_paper_positions')
        .update({
          peak_price: newPeak,
          unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
        })
        .eq('id', pos.id)
    }
  }

  // ── 진입 시그널 평가 (safeEvaluate) ──
  const entrySignals = safeEvaluate(strategyId, candleMap, regime)
  const currentOpenCount = positions.filter((p) => p.status === 'open').length - exitSignals.length
  const maxPositions = strategy.config.params.maxPositions ?? 3

  for (const signal of entrySignals) {
    if (currentOpenCount >= maxPositions) break
    if (positions.some((p) => p.asset_key === signal.symbol && p.status === 'open')) continue

    const currentCandles = candleMap.get(signal.symbol)
    const rawEntryPrice = currentCandles
      ? currentCandles[currentCandles.length - 1].open
      : 0

    if (rawEntryPrice <= 0) continue

    const side: PositionSide = signal.positionSide ?? (signal.direction === 'buy' ? 'long' : 'short')

    // 진입 시 불리한 방향: 롱 = 높게, 숏 = 낮게
    const entrySlippage = SLIPPAGE[exchange] ?? SLIPPAGE.upbit
    const entryPrice = side === 'long'
      ? rawEntryPrice * (1 + entrySlippage)
      : rawEntryPrice * (1 - entrySlippage)

    // 포지션 사이징: 세션 자본의 1/maxPositions
    const sessionCapital = session.current_equity ?? session.initial_capital
    const allocation = sessionCapital / maxPositions
    const quantity = allocation / entryPrice
    const slippageBps = entrySlippage * 10_000

    // 주문 생성
    const entrySide = signal.direction === 'buy' ? 'buy' : 'sell'
    const { data: order } = await supabase
      .from('v2_paper_orders')
      .insert({
        session_id: sessionId,
        asset_key: signal.symbol,
        side: entrySide,
        position_side: side,
        order_type: 'market',
        requested_qty: quantity,
        requested_price: rawEntryPrice,
        status: 'filled',
        submitted_at: new Date().toISOString(),
        filled_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (order) {
      // 체결 기록
      await supabase
        .from('v2_paper_fills')
        .insert({
          order_id: order.id,
          fill_qty: quantity,
          fill_price: entryPrice,
          fill_fee: 0,
          slippage_bps: slippageBps,
        })
    }

    // 포지션 생성
    await supabase
      .from('v2_paper_positions')
      .insert({
        session_id: sessionId,
        asset_key: signal.symbol,
        side,
        entry_price: entryPrice,
        current_qty: quantity,
        peak_price: entryPrice,
        unrealized_pnl: 0,
        realized_pnl: 0,
        status: 'open',
        entry_time: new Date().toISOString(),
      })

    console.log(`[V2 가상매매] 세션 ${sessionId}: ${signal.symbol} ${side} 진입 @ ${entryPrice}`)
  }

  // ── 세션 성과 업데이트 + 에퀴티 스냅샷 ──
  await updateSessionPerformance(sessionId, strategyId, regime)
}

// ─── 성과 계산 ───────────────────────────────────────────────

/**
 * 세션의 현재 성과 지표를 재계산하고 에퀴티 스냅샷 저장
 */
async function updateSessionPerformance(
  sessionId: string,
  strategyId: string,
  regime: RegimeState,
): Promise<void> {
  // 종료된 포지션 조회 (실현 손익)
  const { data: closedPositions } = await supabase
    .from('v2_paper_positions')
    .select('entry_price, current_qty, realized_pnl, side')
    .eq('session_id', sessionId)
    .eq('status', 'closed')

  // 열린 포지션 조회 (미실현 손익)
  const { data: openPositions } = await supabase
    .from('v2_paper_positions')
    .select('unrealized_pnl')
    .eq('session_id', sessionId)
    .eq('status', 'open')

  const closed = closedPositions ?? []
  const totalTrades = closed.length
  const totalRealizedPnl = closed.reduce((acc, p) => acc + (p.realized_pnl ?? 0), 0)
  const totalUnrealizedPnl = (openPositions ?? []).reduce(
    (acc, p) => acc + (p.unrealized_pnl ?? 0), 0,
  )

  // 세션 초기 자본 조회
  const { data: sessionData } = await supabase
    .from('v2_paper_sessions')
    .select('initial_capital')
    .eq('id', sessionId)
    .single()

  const initialCapital = sessionData?.initial_capital ?? 10_000
  const currentEquity = initialCapital + totalRealizedPnl + totalUnrealizedPnl

  // 성과 지표 계산 (거래 이력 기반)
  let sharpe = 0
  let maxDD = 0
  let winRate = 0
  let totalReturn = 0

  if (totalTrades > 0) {
    // 개별 거래 수익률 계산
    const pnlPcts = closed.map((p) => {
      const notional = p.entry_price * p.current_qty
      return notional > 0 ? (p.realized_pnl ?? 0) / notional : 0
    })

    const wins = pnlPcts.filter((r) => r > 0).length
    winRate = (wins / totalTrades) * 100

    totalReturn = (currentEquity - initialCapital) / initialCapital

    // Sharpe (간이 계산)
    const mean = pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length
    const variance = pnlPcts.reduce((acc, r) => acc + (r - mean) ** 2, 0) / pnlPcts.length
    const std = Math.sqrt(variance)
    sharpe = std > 0 ? (mean / std) * Math.sqrt(totalTrades) : 0

    // MDD (누적 수익률 기준)
    let peak = 1
    let cumReturn = 1
    for (const r of pnlPcts) {
      cumReturn *= (1 + r)
      if (cumReturn > peak) peak = cumReturn
      const dd = (peak - cumReturn) / peak
      if (dd > maxDD) maxDD = dd
    }
  }

  // 세션 성과 업데이트
  await supabase
    .from('v2_paper_sessions')
    .update({
      current_equity: Math.round(currentEquity * 100) / 100,
      current_drawdown: Math.round(maxDD * 10_000) / 100, // 퍼센트 값
    })
    .eq('id', sessionId)

  // 에퀴티 스냅샷 저장
  await supabase
    .from('v2_equity_snapshots')
    .insert({
      source: `paper:${sessionId}`,
      total_equity: Math.round(currentEquity * 100) / 100,
      regime,
      active_strategies: [strategyId],
      unrealized_pnl: Math.round(totalUnrealizedPnl * 100) / 100,
      realized_pnl: Math.round(totalRealizedPnl * 100) / 100,
    })

  if (totalTrades > 0) {
    console.log(
      `[V2 가상매매] 세션 ${sessionId}: ` +
      `에퀴티=${currentEquity.toFixed(2)} | ` +
      `수익률=${(totalReturn * 100).toFixed(2)}% | ` +
      `승률=${winRate.toFixed(1)}% | ` +
      `Sharpe=${sharpe.toFixed(2)} | ` +
      `MDD=${(maxDD * 100).toFixed(2)}%`,
    )
  }
}
