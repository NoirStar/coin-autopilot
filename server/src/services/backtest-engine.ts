import Decimal from 'decimal.js'
import type {
  Strategy,
  Candle,
  CandleMap,
  BacktestResult,
  BacktestTrade,
  RegimeState,
} from '../strategy/strategy-base.js'
import { evaluateRegime } from '../strategy/btc-regime-filter.js'

interface BacktestConfig {
  initialCapital: number
  feeRate: number       // 업비트 0.05% = 0.0005, OKX taker 0.02% = 0.0002
  slippagePct: number   // 0.1% = 0.001
  leverage: number      // 레버리지 (1 = 현물, 2+ = 선물)
}

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000_000,
  feeRate: 0.0005,
  slippagePct: 0.001,
  leverage: 1,
}

/** OKX 선물 기본 설정 */
const FUTURES_CONFIG: Partial<BacktestConfig> = {
  initialCapital: 10_000, // $10,000 USDT
  feeRate: 0.0005,        // OKX taker 0.05% (maker -0.005%)
  slippagePct: 0.0005,    // 선물은 유동성 높아서 슬리피지 낮음
  leverage: 2,
}

/**
 * 백테스트 엔진 (롱 + 숏 + 레버리지 지원)
 *
 * 가정:
 * - 시그널 발생 → 다음 캔들 시가 ± 슬리피지에 체결
 * - 수수료: 진입/청산 각각 적용
 * - 포지션 사이징: 균등 분배 (equity / maxPositions)
 * - 레버리지: 명목가치 = 실제투입 * leverage
 * - 숏: PnL = (entryPrice - exitPrice) / entryPrice
 */
export function runBacktest(
  strategy: Strategy,
  allCandles: CandleMap,
  config: Partial<BacktestConfig> = {}
): BacktestResult {
  // 선물 전략이면 기본값 변경
  const isFutures = strategy.config.exchange === 'okx'
  const baseConfig = isFutures ? { ...DEFAULT_CONFIG, ...FUTURES_CONFIG } : DEFAULT_CONFIG
  const cfg = { ...baseConfig, ...config }

  const btcCandles = allCandles.get('BTC')
  if (!btcCandles || btcCandles.length < 201) {
    return emptyResult(strategy)
  }

  const candleCount = btcCandles.length
  let equity = new Decimal(cfg.initialCapital)
  const equityCurve: Array<{ t: string; equity: number }> = []
  const trades: BacktestTrade[] = []
  let previousRegime: RegimeState = 'risk_off'
  let peakEquity = equity
  let maxDrawdown = new Decimal(0)

  // 열린 포지션 추적
  interface OpenPosition {
    entryPrice: number
    entryTime: Date
    entryIndex: number
    allocation: Decimal
    side: 'long' | 'short'
    leverage: number
  }
  const openPositions: Map<string, OpenPosition> = new Map()

  for (let i = 200; i < candleCount - 1; i++) {
    // 레짐 판단
    const btcSlice = btcCandles.slice(0, i + 1)
    const regimeDetail = evaluateRegime(btcSlice, previousRegime)
    previousRegime = regimeDetail.regime

    // 캔들 슬라이스
    const slicedCandles: CandleMap = new Map()
    for (const [symbol, candles] of allCandles) {
      if (candles.length > i) {
        slicedCandles.set(symbol, candles.slice(0, i + 1))
      }
    }

    // 청산 평가
    const openPosArray = Array.from(openPositions.entries()).map(([symbol, pos]) => ({
      symbol,
      entryPrice: pos.entryPrice,
      entryTime: pos.entryTime,
      candlesSinceEntry: i - pos.entryIndex,
      side: pos.side,
    }))

    const exitSignals = strategy.evaluateExits(slicedCandles, regimeDetail.regime, openPosArray)

    for (const exit of exitSignals) {
      const pos = openPositions.get(exit.symbol)
      if (!pos) continue

      const symbolCandles = allCandles.get(exit.symbol)
      if (!symbolCandles || symbolCandles.length <= i + 1) continue

      // 다음 캔들 시가에 청산
      const rawExitPrice = symbolCandles[i + 1].open
      const exitPrice = pos.side === 'long'
        ? rawExitPrice * (1 - cfg.slippagePct)  // 롱 청산 = 매도, 불리하게
        : rawExitPrice * (1 + cfg.slippagePct)  // 숏 청산 = 매수, 불리하게

      // PnL 계산 (레버리지 반영)
      const rawPnlPct = pos.side === 'long'
        ? (exitPrice - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - exitPrice) / pos.entryPrice

      const leveragedPnlPct = rawPnlPct * pos.leverage
      const netPnlPct = leveragedPnlPct - cfg.feeRate * 2 * pos.leverage

      // 에쿼티 업데이트: 원금 + (원금 * 레버리지 PnL)
      equity = equity.add(pos.allocation.mul(1 + netPnlPct))

      trades.push({
        symbol: exit.symbol,
        direction: pos.side === 'long' ? 'buy' : 'sell',
        entryPrice: pos.entryPrice,
        exitPrice,
        entryTime: pos.entryTime,
        exitTime: symbolCandles[i + 1].openTime,
        pnlPct: Math.round(netPnlPct * 10000) / 100,
        reason: exit.reason,
        fees: pos.allocation.mul(cfg.feeRate * 2 * pos.leverage).toNumber(),
      })

      openPositions.delete(exit.symbol)
    }

    // 진입 평가
    const entrySignals = strategy.evaluate(slicedCandles, regimeDetail.regime)

    for (const signal of entrySignals) {
      if (openPositions.has(signal.symbol)) continue
      if (openPositions.size >= (strategy.config.params.maxPositions ?? 3)) break

      const symbolCandles = allCandles.get(signal.symbol)
      if (!symbolCandles || symbolCandles.length <= i + 1) continue

      const side = signal.positionSide ?? (signal.direction === 'buy' ? 'long' : 'short')
      const leverage = signal.leverage ?? cfg.leverage

      // 다음 캔들 시가에 진입
      const rawEntryPrice = symbolCandles[i + 1].open
      const entryPrice = side === 'long'
        ? rawEntryPrice * (1 + cfg.slippagePct)  // 롱 진입 = 매수, 불리하게
        : rawEntryPrice * (1 - cfg.slippagePct)  // 숏 진입 = 매도, 불리하게

      const maxPositions = strategy.config.params.maxPositions ?? 3
      const allocation = equity.div(maxPositions)

      openPositions.set(signal.symbol, {
        entryPrice,
        entryTime: symbolCandles[i + 1].openTime,
        entryIndex: i + 1,
        allocation,
        side,
        leverage,
      })

      equity = equity.sub(allocation)
    }

    // 에퀴티 커브 기록 (미실현 PnL 포함)
    let totalEquity = equity
    for (const [symbol, pos] of openPositions) {
      const symbolCandles = allCandles.get(symbol)
      if (symbolCandles && symbolCandles.length > i) {
        const currentPrice = symbolCandles[i].close
        const rawPnl = pos.side === 'long'
          ? (currentPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - currentPrice) / pos.entryPrice
        const leveragedPnl = rawPnl * pos.leverage
        totalEquity = totalEquity.add(pos.allocation.mul(1 + leveragedPnl))
      }
    }

    equityCurve.push({
      t: btcCandles[i].openTime.toISOString(),
      equity: totalEquity.toNumber(),
    })

    // MDD 갱신
    if (totalEquity.gt(peakEquity)) peakEquity = totalEquity
    const drawdown = peakEquity.sub(totalEquity).div(peakEquity)
    if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown
  }

  // 미청산 포지션 강제 청산
  for (const [symbol, pos] of openPositions) {
    const symbolCandles = allCandles.get(symbol)
    if (!symbolCandles) continue
    const lastCandle = symbolCandles[symbolCandles.length - 1]
    const rawPnl = pos.side === 'long'
      ? (lastCandle.close - pos.entryPrice) / pos.entryPrice
      : (pos.entryPrice - lastCandle.close) / pos.entryPrice
    const netPnl = rawPnl * pos.leverage - cfg.feeRate * 2 * pos.leverage
    equity = equity.add(pos.allocation.mul(1 + netPnl))
    trades.push({
      symbol,
      direction: pos.side === 'long' ? 'buy' : 'sell',
      entryPrice: pos.entryPrice,
      exitPrice: lastCandle.close,
      entryTime: pos.entryTime,
      exitTime: lastCandle.openTime,
      pnlPct: Math.round(netPnl * 10000) / 100,
      reason: 'backtest_end',
      fees: 0,
    })
  }

  // 성과 지표
  const finalEquity = equity.toNumber()
  const totalReturn = (finalEquity - cfg.initialCapital) / cfg.initialCapital
  const winningTrades = trades.filter((t) => t.pnlPct > 0)
  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0

  // 기간 일수
  const periodDays = periodDaysCalc(equityCurve)

  // Sharpe (연환산): mean/std * sqrt(연간 거래수)
  let sharpeRatio = 0
  if (trades.length > 1 && periodDays > 0) {
    const returns = trades.map((t) => t.pnlPct / 100)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / returns.length
    const std = Math.sqrt(variance)
    const annualizedTrades = trades.length * (365 / periodDays)
    sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(annualizedTrades) : 0
  }

  // CAGR
  const cagr = periodDays > 0 ? (Math.pow(finalEquity / cfg.initialCapital, 365 / periodDays) - 1) : 0

  // 평균 보유 시간
  const avgHoldHours = trades.length > 0
    ? trades.reduce((acc, t) => acc + (t.exitTime.getTime() - t.entryTime.getTime()) / (1000 * 60 * 60), 0) / trades.length
    : 0

  return {
    strategyId: strategy.config.id,
    params: strategy.config.params,
    timeframe: strategy.config.timeframe,
    periodStart: btcCandles[200].openTime,
    periodEnd: btcCandles[candleCount - 1].openTime,
    totalReturn: Math.round(totalReturn * 10000) / 100,
    cagr: Math.round(cagr * 10000) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown.toNumber() * 10000) / 100,
    winRate: Math.round(winRate * 10000) / 100,
    totalTrades: trades.length,
    avgHoldHours: Math.round(avgHoldHours * 10) / 10,
    trades,
    equityCurve,
  }
}

function periodDaysCalc(equityCurve: Array<{ t: string }>): number {
  if (equityCurve.length < 2) return 180
  return (new Date(equityCurve[equityCurve.length - 1].t).getTime() - new Date(equityCurve[0].t).getTime()) / (1000 * 60 * 60 * 24)
}

function emptyResult(strategy: Strategy): BacktestResult {
  return {
    strategyId: strategy.config.id,
    params: strategy.config.params,
    timeframe: strategy.config.timeframe,
    periodStart: new Date(),
    periodEnd: new Date(),
    totalReturn: 0,
    cagr: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    winRate: 0,
    totalTrades: 0,
    avgHoldHours: 0,
    trades: [],
    equityCurve: [],
  }
}
