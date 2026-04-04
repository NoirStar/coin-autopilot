import { calcRSI, calcATRPercent, calcAltBtcZScore } from '../indicator/indicator-engine.js'
import { calcATRStop } from './utils/atr-stop.js'
import { registerStrategy } from './registry.js'
import type {
  Strategy,
  StrategyConfig,
  StrategySignal,
  ExitSignal,
  CandleMap,
  RegimeState,
  OpenPosition,
} from '../core/types.js'

const DEFAULT_PARAMS = {
  zScoreEntry: -1.0,
  zScoreExit: 0.0,
  rsiMax: 78,
  maxPositions: 5,
  atrStopMult: 2.7,
  timeLimitCandles: 8,
  zScorePeriod: 20,
}

/**
 * 알트 평균회귀 전략 (업비트 현물용) — V2
 *
 * BTC 레짐이 Risk-On일 때, BTC 대비 많이 빠진(z-score ≤ -1.0) 알트코인을 매수.
 * 평균으로 회귀(z-score ≥ 0.0)하면 청산.
 */
class AltMeanReversionV2 implements Strategy {
  config: StrategyConfig

  constructor(overrides?: Partial<typeof DEFAULT_PARAMS>) {
    const params = { ...DEFAULT_PARAMS, ...overrides }
    this.config = {
      id: 'alt_mean_reversion',
      name: 'BTC 레짐 + 알트 평균회귀',
      description: 'BTC가 안전할 때, 많이 빠진 알트코인을 매수하여 평균 회귀를 노림',
      timeframe: '4h',
      exchange: 'upbit',
      assetClass: 'crypto_spot',
      direction: 'long',
      params,
    }
  }

  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[] {
    // Risk-Off면 시그널 없음
    if (regime !== 'risk_on') return []

    const btcCandles = candles.get('BTC')
    if (!btcCandles || btcCandles.length === 0) return []

    const btcCloses = btcCandles.map((c) => c.close)
    const signals: StrategySignal[] = []
    const { zScoreEntry, rsiMax, maxPositions, zScorePeriod } = this.config.params

    for (const [symbol, altCandles] of candles) {
      if (symbol === 'BTC') continue
      if (signals.length >= maxPositions) break

      if (altCandles.length < zScorePeriod) continue

      const altCloses = altCandles.map((c) => c.close)
      const zScores = calcAltBtcZScore(altCloses, btcCloses, zScorePeriod)
      const rsiValues = calcRSI(altCloses, 14)

      if (zScores.length === 0 || rsiValues.length === 0) continue

      const latestZ = zScores[zScores.length - 1]
      const latestRsi = rsiValues[rsiValues.length - 1]

      // 진입 조건: z ≤ -1.0 AND RSI ≤ 78
      if (latestZ <= zScoreEntry && latestRsi <= rsiMax) {
        signals.push({
          symbol,
          direction: 'buy',
          reasoning: {
            z_score: Math.round(latestZ * 100) / 100,
            rsi: Math.round(latestRsi * 10) / 10,
            btc_regime: regime,
            z_threshold: zScoreEntry,
            rsi_threshold: rsiMax,
            z_check: latestZ <= zScoreEntry,
            rsi_check: latestRsi <= rsiMax,
          },
        })
      }
    }

    return signals
  }

  evaluateExits(
    candles: CandleMap,
    regime: RegimeState,
    openPositions: OpenPosition[],
  ): ExitSignal[] {
    const btcCandles = candles.get('BTC')
    if (!btcCandles) return []

    const btcCloses = btcCandles.map((c) => c.close)
    const exits: ExitSignal[] = []
    const { zScoreExit, atrStopMult, timeLimitCandles, zScorePeriod } = this.config.params

    // 레짐 스톱: Risk-Off → 전체 청산
    if (regime === 'risk_off') {
      return openPositions.map((pos) => ({
        symbol: pos.symbol,
        reason: 'regime_stop' as const,
        reasoning: { btc_regime: regime, action: '레짐 전환으로 전체 청산' },
      }))
    }

    for (const pos of openPositions) {
      const altCandles = candles.get(pos.symbol)
      if (!altCandles || altCandles.length === 0) continue

      const altCloses = altCandles.map((c) => c.close)
      const currentPrice = altCloses[altCloses.length - 1]

      // 손절: calcATRStop 유틸리티 사용 (현물 롱 전용)
      const stopPrice = calcATRStop(altCandles, pos.entryPrice, 'long', atrStopMult)

      if (Number.isFinite(stopPrice) && currentPrice <= stopPrice) {
        // ATR% 값 — reasoning용
        const highs = altCandles.map((c) => c.high)
        const lows = altCandles.map((c) => c.low)
        const atrPctValues = calcATRPercent(highs, lows, altCloses, 14)
        const latestAtrPct = atrPctValues.length > 0
          ? atrPctValues[atrPctValues.length - 1]
          : 0

        exits.push({
          symbol: pos.symbol,
          reason: 'stop_loss',
          reasoning: {
            entry_price: pos.entryPrice,
            current_price: currentPrice,
            stop_price: Math.round(stopPrice * 100) / 100,
            atr_pct: Math.round(latestAtrPct * 100) / 100,
          },
        })
        continue
      }

      // 이익 실현: z-score ≥ 0.0
      const zScores = calcAltBtcZScore(altCloses, btcCloses, zScorePeriod)
      if (zScores.length > 0) {
        const latestZ = zScores[zScores.length - 1]
        if (latestZ >= zScoreExit) {
          exits.push({
            symbol: pos.symbol,
            reason: 'take_profit',
            reasoning: {
              z_score: Math.round(latestZ * 100) / 100,
              z_threshold: zScoreExit,
            },
          })
          continue
        }
      }

      // 시간 청산: 8캔들 경과
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

// 레지스트리에 자동 등록
registerStrategy(new AltMeanReversionV2())

export { AltMeanReversionV2 }
