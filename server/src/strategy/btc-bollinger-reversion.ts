import { calcEMA, calcRSI, calcBollingerBands, calcATRPercent } from '../indicator/indicator-engine.js'
import type {
  Strategy,
  StrategyConfig,
  StrategySignal,
  ExitSignal,
  CandleMap,
  RegimeState,
} from './strategy-base.js'

const DEFAULT_PARAMS = {
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  trendEma: 200,
  atrStopMult: 1.0,
  timeLimitCandles: 20,     // 20 x 4H = 80시간 ≈ 3.3일
  leverage: 2,
  volumeMultiplier: 1.2,
}

/**
 * BTC/ETH 볼린저 밴드 평균회귀 전략 (OKX 선물용)
 *
 * 횡보장에서 과매수/과매도 반전을 포착.
 * EMA(200) 트렌드 방향과 일치하는 방향만 진입 (역추세 회피).
 *
 * 진입:
 *   롱: 하단 밴드 터치 + RSI < 30 + 가격 밴드 안으로 복귀 + 가격 > EMA(200)
 *   숏: 상단 밴드 터치 + RSI > 70 + 가격 밴드 안으로 복귀 + 가격 < EMA(200)
 *
 * 청산:
 *   1차: BB 중심선 도달 시 50% (이 전략에서는 전량으로 단순화)
 *   손절: 진입 밴드 바깥 ATR(14) x 1.0
 *   시간: 20캔들 (≈3일)
 */
export class BtcBollingerReversionStrategy implements Strategy {
  config: StrategyConfig

  constructor(overrides?: Partial<typeof DEFAULT_PARAMS>) {
    const params = { ...DEFAULT_PARAMS, ...overrides }
    this.config = {
      id: 'btc_bollinger_reversion',
      name: 'BTC 볼린저 평균회귀',
      description: '볼린저 밴드 상/하단 터치 + RSI 확인으로 반전 매매. OKX 선물.',
      timeframe: '4h',
      exchange: 'okx',
      params,
    }
  }

  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[] {
    const signals: StrategySignal[] = []
    const { bbPeriod, bbStdDev, rsiPeriod, rsiOversold, rsiOverbought, trendEma, leverage, volumeMultiplier } = this.config.params

    for (const symbol of ['BTC', 'ETH']) {
      const symbolCandles = candles.get(symbol)
      if (!symbolCandles || symbolCandles.length < trendEma + 1) continue

      const closes = symbolCandles.map((c) => c.close)
      const volumes = symbolCandles.map((c) => c.volume)

      // 지표 계산
      const bbValues = calcBollingerBands(closes, bbPeriod, bbStdDev)
      const rsiValues = calcRSI(closes, rsiPeriod)
      const trendEmaValues = calcEMA(closes, trendEma)

      if (bbValues.length < 2 || rsiValues.length === 0 || trendEmaValues.length === 0) continue

      const latestClose = closes[closes.length - 1]
      const prevClose = closes[closes.length - 2]
      const latestBB = bbValues[bbValues.length - 1]
      const prevBB = bbValues[bbValues.length - 2]
      const latestRsi = rsiValues[rsiValues.length - 1]
      const latestTrend = trendEmaValues[trendEmaValues.length - 1]

      // 볼린저 밴드 폭 (스퀴즈 감지 — 밴드가 너무 좁으면 진입 금지)
      const bandwidth = (latestBB.upper - latestBB.lower) / latestBB.middle
      if (bandwidth < 0.02) continue  // 극단적 스퀴즈 중에는 진입 금지

      // 볼륨 필터: 현재 거래량 > SMA(20) x volumeMultiplier
      const volumeWindow = volumes.slice(-20)
      const volumeSma20 = volumeWindow.length >= 20
        ? volumeWindow.reduce((a, b) => a + b, 0) / 20
        : 0
      const latestVolume = volumes[volumes.length - 1]
      if (volumeSma20 > 0 && latestVolume <= volumeSma20 * volumeMultiplier) continue

      // 롱: 하단 밴드 터치 후 복귀 + RSI 과매도 + 상승 트렌드
      const touchedLower = prevClose <= prevBB.lower
      const recoveredLower = latestClose > latestBB.lower

      if (touchedLower && recoveredLower && latestRsi < rsiOversold && latestClose > latestTrend) {
        signals.push({
          symbol,
          direction: 'buy',
          positionSide: 'long',
          leverage,
          reasoning: {
            type: 'bollinger_reversion',
            side: 'long',
            close: round(latestClose),
            bb_lower: round(latestBB.lower),
            bb_middle: round(latestBB.middle),
            bb_upper: round(latestBB.upper),
            rsi: round(latestRsi, 1),
            trend_ema: round(latestTrend),
            bandwidth: round(bandwidth, 4),
          },
        })
      }

      // 숏: 상단 밴드 터치 후 복귀 + RSI 과매수 + 하락 트렌드
      const touchedUpper = prevClose >= prevBB.upper
      const recoveredUpper = latestClose < latestBB.upper

      if (touchedUpper && recoveredUpper && latestRsi > rsiOverbought && latestClose < latestTrend) {
        signals.push({
          symbol,
          direction: 'sell',
          positionSide: 'short',
          leverage,
          reasoning: {
            type: 'bollinger_reversion',
            side: 'short',
            close: round(latestClose),
            bb_lower: round(latestBB.lower),
            bb_middle: round(latestBB.middle),
            bb_upper: round(latestBB.upper),
            rsi: round(latestRsi, 1),
            trend_ema: round(latestTrend),
            bandwidth: round(bandwidth, 4),
          },
        })
      }
    }

    return signals
  }

  evaluateExits(
    candles: CandleMap,
    regime: RegimeState,
    openPositions: Array<{
      symbol: string
      entryPrice: number
      entryTime: Date
      candlesSinceEntry: number
      side?: string
      peakPrice?: number
    }>
  ): ExitSignal[] {
    const exits: ExitSignal[] = []
    const { bbPeriod, bbStdDev, atrStopMult, timeLimitCandles } = this.config.params

    for (const pos of openPositions) {
      const symbolCandles = candles.get(pos.symbol)
      if (!symbolCandles || symbolCandles.length === 0) continue

      const closes = symbolCandles.map((c) => c.close)
      const highs = symbolCandles.map((c) => c.high)
      const lows = symbolCandles.map((c) => c.low)
      const currentPrice = closes[closes.length - 1]

      const isLong = pos.side !== 'short'

      // 1. ATR 기반 손절
      const atrPctValues = calcATRPercent(highs, lows, closes, 14)
      if (atrPctValues.length > 0) {
        const latestAtrPct = atrPctValues[atrPctValues.length - 1]
        const stopDistance = (atrStopMult * latestAtrPct) / 100

        const stopPrice = isLong
          ? pos.entryPrice * (1 - stopDistance)
          : pos.entryPrice * (1 + stopDistance)

        const isStopHit = isLong
          ? currentPrice <= stopPrice
          : currentPrice >= stopPrice

        if (isStopHit) {
          exits.push({
            symbol: pos.symbol,
            reason: 'stop_loss',
            reasoning: {
              entry_price: pos.entryPrice,
              current_price: currentPrice,
              stop_price: round(stopPrice),
              atr_pct: round(latestAtrPct),
            },
          })
          continue
        }
      }

      // 2. BB 중심선(SMA 20) 도달 시 익절
      const bbValues = calcBollingerBands(closes, bbPeriod, bbStdDev)
      if (bbValues.length > 0) {
        const latestBB = bbValues[bbValues.length - 1]

        const reachedMiddle = isLong
          ? currentPrice >= latestBB.middle
          : currentPrice <= latestBB.middle

        if (reachedMiddle) {
          exits.push({
            symbol: pos.symbol,
            reason: 'take_profit',
            reasoning: {
              type: 'bb_middle_reached',
              current_price: currentPrice,
              bb_middle: round(latestBB.middle),
            },
          })
          continue
        }
      }

      // 3. 시간 청산
      if (pos.candlesSinceEntry >= timeLimitCandles) {
        exits.push({
          symbol: pos.symbol,
          reason: 'time_exit',
          reasoning: {
            candles_held: pos.candlesSinceEntry,
            limit: timeLimitCandles,
          },
        })
      }
    }

    return exits
  }
}

function round(value: number, decimals: number = 2): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals
}
