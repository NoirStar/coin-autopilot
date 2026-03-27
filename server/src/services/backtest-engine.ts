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
  feeRate: number       // 업비트 0.05% = 0.0005
  slippagePct: number   // 0.1% = 0.001
}

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000_000, // 1천만원
  feeRate: 0.0005,
  slippagePct: 0.001,
}

/**
 * 간이 백테스트 엔진
 *
 * 가정:
 * - 시그널 발생 → 다음 캔들 시가 ± 슬리피지에 체결
 * - 수수료: 매수/매도 각각 적용
 * - 포지션 사이징: 균등 분배 (equity / maxPositions)
 */
export function runBacktest(
  strategy: Strategy,
  allCandles: CandleMap,
  config: Partial<BacktestConfig> = {}
): BacktestResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
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
  const openPositions: Map<string, {
    entryPrice: number
    entryTime: Date
    entryIndex: number
    allocation: Decimal
  }> = new Map()

  // 캔들 인덱스별로 순회 (200번째부터 시작, EMA(200) 계산 가능)
  for (let i = 200; i < candleCount - 1; i++) {
    // 현재까지의 캔들로 레짐 판단
    const btcSlice = btcCandles.slice(0, i + 1)
    const regimeDetail = evaluateRegime(btcSlice, previousRegime)
    previousRegime = regimeDetail.regime

    // 현재까지의 모든 심볼 캔들
    const slicedCandles: CandleMap = new Map()
    for (const [symbol, candles] of allCandles) {
      if (candles.length > i) {
        slicedCandles.set(symbol, candles.slice(0, i + 1))
      }
    }

    // 청산 시그널 평가
    const openPosArray = Array.from(openPositions.entries()).map(([symbol, pos]) => ({
      symbol,
      entryPrice: pos.entryPrice,
      entryTime: pos.entryTime,
      candlesSinceEntry: i - pos.entryIndex,
    }))

    const exitSignals = strategy.evaluateExits(slicedCandles, regimeDetail.regime, openPosArray)

    for (const exit of exitSignals) {
      const pos = openPositions.get(exit.symbol)
      if (!pos) continue

      const altCandles = allCandles.get(exit.symbol)
      if (!altCandles || altCandles.length <= i + 1) continue

      // 다음 캔들 시가에 청산 (슬리피지 적용)
      const exitPrice = altCandles[i + 1].open * (1 - cfg.slippagePct)
      const fee = new Decimal(exitPrice).mul(cfg.feeRate)
      const pnlPct = (exitPrice - pos.entryPrice) / pos.entryPrice - cfg.feeRate * 2

      equity = equity.add(pos.allocation.mul(1 + pnlPct))

      trades.push({
        symbol: exit.symbol,
        direction: 'buy',
        entryPrice: pos.entryPrice,
        exitPrice,
        entryTime: pos.entryTime,
        exitTime: altCandles[i + 1].openTime,
        pnlPct: Math.round(pnlPct * 10000) / 100,
        reason: exit.reason,
        fees: fee.toNumber() * 2,
      })

      openPositions.delete(exit.symbol)
    }

    // 진입 시그널 평가
    const entrySignals = strategy.evaluate(slicedCandles, regimeDetail.regime)

    for (const signal of entrySignals) {
      if (openPositions.has(signal.symbol)) continue
      if (openPositions.size >= (strategy.config.params.maxPositions ?? 5)) break

      const altCandles = allCandles.get(signal.symbol)
      if (!altCandles || altCandles.length <= i + 1) continue

      // 다음 캔들 시가에 진입 (슬리피지 적용)
      const entryPrice = altCandles[i + 1].open * (1 + cfg.slippagePct)
      const maxPositions = strategy.config.params.maxPositions ?? 5
      const allocation = equity.div(maxPositions)

      openPositions.set(signal.symbol, {
        entryPrice,
        entryTime: altCandles[i + 1].openTime,
        entryIndex: i + 1,
        allocation,
      })

      equity = equity.sub(allocation)
    }

    // 에퀴티 커브 기록
    let totalEquity = equity
    for (const [symbol, pos] of openPositions) {
      const altCandles = allCandles.get(symbol)
      if (altCandles && altCandles.length > i) {
        const currentPrice = altCandles[i].close
        const unrealizedPnl = (currentPrice - pos.entryPrice) / pos.entryPrice
        totalEquity = totalEquity.add(pos.allocation.mul(1 + unrealizedPnl))
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

  // 미청산 포지션 강제 청산 (백테스트 종료)
  for (const [symbol, pos] of openPositions) {
    const altCandles = allCandles.get(symbol)
    if (!altCandles) continue
    const lastCandle = altCandles[altCandles.length - 1]
    const pnlPct = (lastCandle.close - pos.entryPrice) / pos.entryPrice - cfg.feeRate * 2
    equity = equity.add(pos.allocation.mul(1 + pnlPct))
    trades.push({
      symbol,
      direction: 'buy',
      entryPrice: pos.entryPrice,
      exitPrice: lastCandle.close,
      entryTime: pos.entryTime,
      exitTime: lastCandle.openTime,
      pnlPct: Math.round(pnlPct * 10000) / 100,
      reason: 'backtest_end',
      fees: 0,
    })
  }

  // 성과 지표 계산
  const finalEquity = equity.toNumber()
  const totalReturn = (finalEquity - cfg.initialCapital) / cfg.initialCapital
  const winningTrades = trades.filter((t) => t.pnlPct > 0)
  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0

  // Sharpe 계산 (거래 수익률의 평균/표준편차)
  let sharpeRatio = 0
  if (trades.length > 1) {
    const returns = trades.map((t) => t.pnlPct / 100)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / returns.length
    const std = Math.sqrt(variance)
    sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(365 / (strategy.config.timeframe === '4h' ? 6 : strategy.config.timeframe === '1h' ? 24 : 1)) : 0
  }

  // CAGR
  const periodDays = equityCurve.length > 0
    ? (new Date(equityCurve[equityCurve.length - 1].t).getTime() - new Date(equityCurve[0].t).getTime()) / (1000 * 60 * 60 * 24)
    : 180
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
