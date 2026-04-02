import { calcEMA, calcADX, calcATRPercent } from '../indicator/indicator-engine.js'
import { calcATRStop } from './utils/atr-stop.js'
import { registerStrategy } from './v2-registry.js'
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
  fastEma: 12,
  slowEma: 26,
  trendEma: 200,
  adxThreshold: 20,
  atrStopMult: 1.5,
  atrTrailMult: 2.0,
  riskRewardMin: 2.0,
  timeLimitCandles: 30,     // 30 x 4H = 120시간 = 5일
  leverage: 2,
  volumeMultiplier: 1.2,
}

/**
 * BTC/ETH EMA 크로스오버 전략 (OKX 선물용) — V2
 *
 * 진입:
 *   롱: Fast EMA > Slow EMA (골든크로스) + 가격 > EMA(200) + ADX > 20
 *   숏: Fast EMA < Slow EMA (데드크로스) + 가격 < EMA(200) + ADX > 20
 *
 * 청산:
 *   손절: ATR(14) x 1.5
 *   트레일링 스탑: ATR(14) x 2.0
 *   시간 청산: 30캔들 (5일)
 *   반대 크로스: 역 시그널 발생 시
 */
class BtcEmaCrossoverV2 implements Strategy {
  config: StrategyConfig

  constructor(overrides?: Partial<typeof DEFAULT_PARAMS>) {
    const params = { ...DEFAULT_PARAMS, ...overrides }
    this.config = {
      id: 'btc_ema_crossover',
      name: 'BTC EMA 크로스오버',
      description: 'EMA(12/26) 크로스 + EMA(200) 트렌드 필터 + ADX 확인. OKX 선물 롱/숏.',
      timeframe: '4h',
      exchange: 'okx',
      assetClass: 'crypto_futures',
      direction: 'both',
      params,
    }
  }

  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[] {
    const signals: StrategySignal[] = []
    const { fastEma, slowEma, trendEma, adxThreshold, leverage, volumeMultiplier } = this.config.params

    // BTC와 ETH 모두 평가
    for (const symbol of ['BTC', 'ETH']) {
      const symbolCandles = candles.get(symbol)
      if (!symbolCandles || symbolCandles.length < trendEma + 1) continue

      const closes = symbolCandles.map((c) => c.close)
      const highs = symbolCandles.map((c) => c.high)
      const lows = symbolCandles.map((c) => c.low)
      const volumes = symbolCandles.map((c) => c.volume)

      // 지표 계산
      const fastEmaValues = calcEMA(closes, fastEma)
      const slowEmaValues = calcEMA(closes, slowEma)
      const trendEmaValues = calcEMA(closes, trendEma)
      const adxValues = calcADX(highs, lows, closes, 14)

      if (
        fastEmaValues.length < 2 ||
        slowEmaValues.length < 2 ||
        trendEmaValues.length === 0 ||
        adxValues.length === 0
      ) continue

      const latestClose = closes[closes.length - 1]
      const latestFast = fastEmaValues[fastEmaValues.length - 1]
      const latestSlow = slowEmaValues[slowEmaValues.length - 1]
      const prevFast = fastEmaValues[fastEmaValues.length - 2]
      const prevSlow = slowEmaValues[slowEmaValues.length - 2]
      const latestTrend = trendEmaValues[trendEmaValues.length - 1]
      const latestAdx = adxValues[adxValues.length - 1]

      // NaN 방어: 지표 값이 유효하지 않으면 스킵
      if ([latestClose, latestFast, latestSlow, prevFast, prevSlow, latestTrend, latestAdx].some(v => !Number.isFinite(v))) continue

      // 크로스 감지 (이전 캔들에서 교차 발생)
      const goldenCross = prevFast <= prevSlow && latestFast > latestSlow
      const deathCross = prevFast >= prevSlow && latestFast < latestSlow

      // ADX 필터: 트렌드가 충분히 강한지
      if (latestAdx < adxThreshold) continue

      // 볼륨 필터: 현재 거래량 > SMA(20) x volumeMultiplier
      const volumeWindow = volumes.slice(-20)
      const volumeSma20 = volumeWindow.length >= 20
        ? volumeWindow.reduce((a, b) => a + b, 0) / 20
        : 0
      const latestVolume = volumes[volumes.length - 1]
      if (volumeSma20 > 0 && latestVolume <= volumeSma20 * volumeMultiplier) continue

      // 롱 시그널: 골든크로스 + 가격 > 200 EMA
      if (goldenCross && latestClose > latestTrend) {
        signals.push({
          symbol,
          direction: 'buy',
          positionSide: 'long',
          leverage,
          reasoning: {
            type: 'ema_crossover',
            cross: 'golden',
            fast_ema: round(latestFast),
            slow_ema: round(latestSlow),
            trend_ema: round(latestTrend),
            adx: round(latestAdx),
            close: round(latestClose),
          },
        })
      }

      // 숏 시그널: 데드크로스 + 가격 < 200 EMA
      if (deathCross && latestClose < latestTrend) {
        signals.push({
          symbol,
          direction: 'sell',
          positionSide: 'short',
          leverage,
          reasoning: {
            type: 'ema_crossover',
            cross: 'death',
            fast_ema: round(latestFast),
            slow_ema: round(latestSlow),
            trend_ema: round(latestTrend),
            adx: round(latestAdx),
            close: round(latestClose),
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
    const exits: ExitSignal[] = []
    const { fastEma, slowEma, atrStopMult, atrTrailMult, timeLimitCandles } = this.config.params

    for (const pos of openPositions) {
      const symbolCandles = candles.get(pos.symbol)
      if (!symbolCandles || symbolCandles.length === 0) continue

      const closes = symbolCandles.map((c) => c.close)
      const highs = symbolCandles.map((c) => c.high)
      const lows = symbolCandles.map((c) => c.low)
      const currentPrice = closes[closes.length - 1]

      const isLong = pos.side !== 'short'
      const side = isLong ? 'long' as const : 'short' as const

      // 1. ATR 기반 손절 — calcATRStop 유틸리티 사용
      const stopPrice = calcATRStop(symbolCandles, pos.entryPrice, side, atrStopMult)

      // ATR% 값 — 손절 및 트레일링 스탑 모두에서 사용
      const atrPctValues = calcATRPercent(highs, lows, closes, 14)
      const latestAtrPct = atrPctValues.length > 0
        ? atrPctValues[atrPctValues.length - 1]
        : 0

      if (Number.isFinite(stopPrice)) {
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
              side: pos.side ?? 'long',
            },
          })
          continue
        }

        // 2. 트레일링 스탑 (peak 기반 — 진입 후 최고/최저가 대비)
        if (atrPctValues.length > 0) {
          const stopDistance = (atrStopMult * latestAtrPct) / 100

          const pnlPct = isLong
            ? (currentPrice - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - currentPrice) / pos.entryPrice

          if (pnlPct >= stopDistance * 2) {
            const trailDistance = (atrTrailMult * latestAtrPct) / 100
            // peakPrice: 롱이면 진입 후 최고가, 숏이면 진입 후 최저가
            const peak = pos.peakPrice ?? currentPrice
            const trailStop = isLong
              ? peak * (1 - trailDistance)
              : peak * (1 + trailDistance)

            // 트레일링 스탑 발동: peak 대비 가격이 trailDistance만큼 되돌림
            const trailHit = isLong
              ? currentPrice <= trailStop
              : currentPrice >= trailStop

            if (trailHit) {
              exits.push({
                symbol: pos.symbol,
                reason: 'take_profit',
                reasoning: {
                  type: 'trailing_stop',
                  peak_price: round(peak),
                  trail_stop: round(trailStop),
                  pnl_pct: round(pnlPct * 100),
                },
              })
              continue
            }
          }
        }
      }

      // 3. 반대 크로스 청산
      const fastEmaValues = calcEMA(closes, fastEma)
      const slowEmaValues = calcEMA(closes, slowEma)

      if (fastEmaValues.length >= 2 && slowEmaValues.length >= 2) {
        const latestFast = fastEmaValues[fastEmaValues.length - 1]
        const latestSlow = slowEmaValues[slowEmaValues.length - 1]
        const prevFast = fastEmaValues[fastEmaValues.length - 2]
        const prevSlow = slowEmaValues[slowEmaValues.length - 2]

        const reverseCross = isLong
          ? (prevFast >= prevSlow && latestFast < latestSlow)  // 롱 보유 중 데드크로스
          : (prevFast <= prevSlow && latestFast > latestSlow)  // 숏 보유 중 골든크로스

        if (reverseCross) {
          exits.push({
            symbol: pos.symbol,
            reason: 'take_profit',
            reasoning: {
              type: 'reverse_cross',
              fast_ema: round(latestFast),
              slow_ema: round(latestSlow),
            },
          })
          continue
        }
      }

      // 4. 시간 청산
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

// 레지스트리에 자동 등록
registerStrategy(new BtcEmaCrossoverV2())

export { BtcEmaCrossoverV2 }
