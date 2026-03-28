import { supabase } from './database.js'
import { calculatePnlPct } from './pnl-calculator.js'
import { evaluateRegime } from '../strategy/btc-regime-filter.js'
import { BtcEmaCrossoverStrategy } from '../strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../strategy/btc-bollinger-reversion.js'
import { BtcMacdMomentumStrategy } from '../strategy/btc-macd-momentum.js'
import { BtcDonchianBreakoutStrategy } from '../strategy/btc-donchian-breakout.js'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import { loadCandles } from '../data/candle-collector.js'
import { fetchOkxCandles, fetchOkxPrice, calculatePositionSize } from '../exchange/okx-client.js'
import type { Strategy, CandleMap, RegimeState, Candle, Timeframe } from '../strategy/strategy-base.js'

/**
 * 가상매매 엔진
 *
 * 크론(4H)에서 호출되어:
 * 1. 활성 세션 조회
 * 2. 각 세션의 전략으로 시그널 평가
 * 3. 가상 포지션 진입/청산 (캔들 시가 + 슬리피지 기반)
 * 4. 세션 성과 업데이트
 */

/** 거래소별 슬리피지 기본값 (불리한 방향으로 적용) */
const SLIPPAGE: Record<string, number> = {
  upbit: 0.001,   // 0.1% — 업비트 현물
  okx: 0.0005,    // 0.05% — OKX 선물
}

interface PaperPosition {
  id: number
  symbol: string
  direction: string
  entry_price: number
  quantity: number
  opened_at: string
  session_type: string
  strategy: string
  user_id: string
  exchange: string
  status: string
}

/** 전략 ID → Strategy 인스턴스 매핑 */
function getStrategyInstance(strategyType: string): Strategy | null {
  switch (strategyType) {
    case 'btc_ema_crossover':
    case 'regime_mean_reversion_ema':
      return new BtcEmaCrossoverStrategy()
    case 'btc_bollinger_reversion':
      return new BtcBollingerReversionStrategy()
    case 'btc_macd_momentum':
      return new BtcMacdMomentumStrategy()
    case 'btc_donchian_breakout':
      return new BtcDonchianBreakoutStrategy()
    case 'alt_mean_reversion':
    case 'regime_mean_reversion':
      return new AltMeanReversionStrategy()
    default:
      return null
  }
}

/** 가상매매 크론 실행 (4H마다 호출) */
export async function runPaperTradingCycle(): Promise<void> {
  console.log('[가상매매] 사이클 시작')

  // 활성 세션 조회
  const { data: sessions, error: sessErr } = await supabase
    .from('paper_sessions')
    .select('*, strategies(type)')
    .eq('status', 'running')

  if (sessErr || !sessions || sessions.length === 0) {
    console.log('[가상매매] 활성 세션 없음')
    return
  }

  // BTC 캔들 로드 (레짐 판단용)
  const btcCandles = await loadCandles('upbit', 'BTC', '4h', 300)
  if (btcCandles.length < 201) {
    console.log('[가상매매] BTC 캔들 부족, 스킵')
    return
  }

  const regimeDetail = evaluateRegime(btcCandles)
  console.log(`[가상매매] BTC 레짐: ${regimeDetail.regime}`)

  for (const session of sessions) {
    try {
      await processSession(session, btcCandles, regimeDetail.regime)
    } catch (err) {
      console.error(`[가상매매] 세션 ${session.id} 처리 오류:`, err)
    }
  }

  console.log('[가상매매] 사이클 완료')
}

async function processSession(
  session: Record<string, unknown>,
  btcCandles: Candle[],
  regime: RegimeState
): Promise<void> {
  const sessionId = session.id as number
  const userId = session.user_id as string
  const strategyType = (session.strategy_type as string)
    ?? (session.strategies as Record<string, unknown>)?.type as string
    ?? 'btc_ema_crossover'

  const strategy = getStrategyInstance(strategyType)
  if (!strategy) {
    console.log(`[가상매매] 세션 ${sessionId}: 알 수 없는 전략 ${strategyType}`)
    return
  }

  const exchange = strategy.config.exchange
  const tf = (strategy.config.timeframe ?? '4h') as Timeframe

  // 캔들 로드
  const candleMap: CandleMap = new Map()

  if (exchange === 'okx') {
    // OKX 선물: BTC + ETH (전략 타임프레임에 맞춰 로드)
    const btcOkx = await loadCandles('okx', 'BTC', tf, 300)
    candleMap.set('BTC', btcOkx.length > 0 ? btcOkx : btcCandles)
    try {
      const ethCandles = await loadCandles('okx', 'ETH', tf, 300)
      if (ethCandles.length > 0) candleMap.set('ETH', ethCandles)
    } catch { /* ETH 캔들 실패 시 BTC만 진행 */ }
  } else {
    // 업비트 현물: BTC + 알트코인
    candleMap.set('BTC', btcCandles)
    for (const symbol of altSymbols) {
      try {
        const candles = await loadCandles('upbit', symbol, '4h', 300)
        if (candles.length > 0) candleMap.set(symbol, candles)
      } catch { /* 개별 심볼 실패 무시 */ }
    }
  }

  // 현재 오픈 포지션 조회
  const { data: openPositions } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_type', 'paper')
    .eq('status', 'open')

  const positions = (openPositions ?? []) as PaperPosition[]

  // 청산 시그널 평가
  const posArray = positions.map((p) => {
    const openedAt = new Date(p.opened_at)
    const hoursSince = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60)
    // peak 가격: DB에 저장된 값이 있으면 ���용, 없으면 진입가로 초기화
    const peakPrice = (p as unknown as Record<string, unknown>).peak_price as number | undefined
    return {
      symbol: p.symbol,
      entryPrice: p.entry_price,
      entryTime: openedAt,
      candlesSinceEntry: Math.floor(hoursSince / 4), // 4H 캔들 기준
      side: p.direction as 'long' | 'short',
      peakPrice: peakPrice ?? p.entry_price,
    }
  })

  const exitSignals = strategy.evaluateExits(candleMap, regime, posArray)

  for (const exit of exitSignals) {
    const pos = positions.find((p) => p.symbol === exit.symbol && p.status === 'open')
    if (!pos) continue

    // 캔들 시가 + 슬리피지로 가상 청산 (종가 대신 시가 사용 — 이미 확정된 정보)
    const currentCandles = candleMap.get(exit.symbol)
    const slippage = SLIPPAGE[pos.exchange] ?? SLIPPAGE.upbit
    const rawExitPrice = currentCandles
      ? currentCandles[currentCandles.length - 1].open
      : pos.entry_price
    // 청산 시 불리한 방향: 롱 = 낮게, 숏 = 높게
    const isLongExit = pos.direction === 'long'
    const exitPrice = isLongExit
      ? rawExitPrice * (1 - slippage)
      : rawExitPrice * (1 + slippage)

    const side = isLongExit ? 'long' as const : 'short' as const
    const { rawPnlPct } = calculatePnlPct(pos.entry_price, exitPrice, side)
    const pnlPct = rawPnlPct * 100

    await supabase
      .from('positions')
      .update({
        status: 'closed',
        exit_price: exitPrice,
        pnl_pct: Math.round(pnlPct * 100) / 100,
        pnl: Math.round(pos.quantity * pos.entry_price * rawPnlPct * 100) / 100,
        closed_at: new Date().toISOString(),
      })
      .eq('id', pos.id)

    console.log(`[가상매매] 세션 ${sessionId}: ${exit.symbol} ${exit.reason} (${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`)
  }

  // peakPrice 업데이트: 아직 열린 포지션의 최고/최저가 갱신
  const exitedSymbols = new Set(exitSignals.map((e) => e.symbol))
  for (const pos of positions) {
    if (pos.status !== 'open' || exitedSymbols.has(pos.symbol)) continue
    const currentCandles = candleMap.get(pos.symbol)
    if (!currentCandles || currentCandles.length === 0) continue

    const currentPrice = currentCandles[currentCandles.length - 1].close
    const oldPeak = (pos as unknown as Record<string, unknown>).peak_price as number | undefined
    const isLong = pos.direction === 'long'
    const newPeak = isLong
      ? Math.max(oldPeak ?? pos.entry_price, currentPrice)
      : Math.min(oldPeak ?? pos.entry_price, currentPrice)

    if (newPeak !== (oldPeak ?? pos.entry_price)) {
      await supabase
        .from('positions')
        .update({ peak_price: newPeak })
        .eq('id', pos.id)
    }
  }

  // 진입 시그널 평가
  const entrySignals = strategy.evaluate(candleMap, regime)
  const currentOpenCount = positions.filter((p) => p.status === 'open').length - exitSignals.length
  const maxPositions = strategy.config.params.maxPositions ?? 3

  for (const signal of entrySignals) {
    if (currentOpenCount >= maxPositions) break
    if (positions.some((p) => p.symbol === signal.symbol && p.status === 'open')) continue

    const currentCandles = candleMap.get(signal.symbol)
    const rawEntryPrice = currentCandles
      ? currentCandles[currentCandles.length - 1].open
      : 0

    if (rawEntryPrice <= 0) continue

    const side = signal.positionSide ?? (signal.direction === 'buy' ? 'long' : 'short')

    // 진입 시 불리한 방향: 롱 = 높게, 숏 = 낮게
    const entrySlippage = SLIPPAGE[exchange] ?? SLIPPAGE.upbit
    const entryPrice = side === 'long'
      ? rawEntryPrice * (1 + entrySlippage)
      : rawEntryPrice * (1 - entrySlippage)

    // 포지션 사이징: 세션 자본의 1/maxPositions
    const sessionCapital = (session.current_equity as number) ?? 10_000_000
    const allocation = sessionCapital / maxPositions
    const quantity = allocation / entryPrice

    await supabase
      .from('positions')
      .insert({
        user_id: userId,
        session_type: 'paper',
        exchange: strategy.config.exchange,
        strategy: strategy.config.id,
        symbol: signal.symbol,
        direction: side,
        entry_price: entryPrice,
        quantity,
        status: 'open',
        opened_at: new Date().toISOString(),
      })

    console.log(`[가상매매] 세션 ${sessionId}: ${signal.symbol} ${side} 진입 @ ${entryPrice}`)
  }

  // 세션 성과 업데이트
  await updateSessionPerformance(sessionId, userId)
}

/** 세션의 현재 성과 지표를 재계산 */
async function updateSessionPerformance(sessionId: number, userId: string): Promise<void> {
  // 이 세션의 모든 종료된 포지션 조회
  const { data: closedPositions } = await supabase
    .from('positions')
    .select('pnl_pct, pnl')
    .eq('user_id', userId)
    .eq('session_type', 'paper')
    .eq('status', 'closed')

  const closed = closedPositions ?? []
  const totalTrades = closed.length

  if (totalTrades === 0) return

  const wins = closed.filter((p) => (p.pnl_pct ?? 0) > 0).length
  const winRate = (wins / totalTrades) * 100

  const pnls = closed.map((p) => (p.pnl_pct ?? 0) / 100)
  const totalReturn = pnls.reduce((acc, r) => acc * (1 + r), 1) - 1

  // Sharpe (간이)
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length
  const variance = pnls.reduce((acc, r) => acc + (r - mean) ** 2, 0) / pnls.length
  const std = Math.sqrt(variance)
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(totalTrades) : 0

  // MDD (누적 수익률 기준)
  let peak = 1
  let maxDD = 0
  let cumReturn = 1
  for (const r of pnls) {
    cumReturn *= (1 + r)
    if (cumReturn > peak) peak = cumReturn
    const dd = (peak - cumReturn) / peak
    if (dd > maxDD) maxDD = dd
  }

  // 세션의 초기 자본으로 현재 에쿼티 계산
  const { data: sessionData } = await supabase
    .from('paper_sessions')
    .select('initial_capital')
    .eq('id', sessionId)
    .single()

  const initialCapital = sessionData?.initial_capital ?? 10_000_000
  const currentEquity = initialCapital * (1 + totalReturn)

  await supabase
    .from('paper_sessions')
    .update({
      current_equity: Math.round(currentEquity * 100) / 100,
      total_return: Math.round(totalReturn * 10000) / 100,
      sharpe_ratio: Math.round(sharpe * 100) / 100,
      max_drawdown: Math.round(maxDD * 10000) / 100,
      win_rate: Math.round(winRate * 10) / 10,
      total_trades: totalTrades,
    })
    .eq('id', sessionId)
}
