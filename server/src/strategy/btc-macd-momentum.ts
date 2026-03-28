import { calcMACD, calcRSI, calcADX, calcATRPercent, calcEMA } from '../indicator/indicator-engine.js'
import type {
  Strategy,
  StrategyConfig,
  StrategySignal,
  ExitSignal,
  CandleMap,
  RegimeState,
} from './strategy-base.js'

const DEFAULT_PARAMS = {
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  rsiPeriod: 14,
  adxPeriod: 14,
  adxThreshold: 25,
  trendEma: 200,
  atrStopMult: 1.5,
  atrTrailMult: 2.5,
  timeLimitCandles: 24,     // 24 x 1H = 24시간
  leverage: 3,
  volumeMultiplier: 1.2,
}

/**
 * BTC MACD 모멘텀 전략 (OKX 선물용)
 *
 * MACD(12,26,9) + RSI(14) + ADX > 25 + EMA(200) 트렌드 필터
 *
 * 진입:
 *   롱: MACD 히스토그램 양수 전환 + RSI 50-70 + ADX > 25 + 가격 > EMA(200)
 *   숏: MACD 히스토그램 음수 전환 + RSI 30-50 + ADX > 25 + 가격 < EMA(200)
 *
 * 청산:
 *   손절: ATR(14) x 1.5
 *   트레일링 스탑: ATR(14) x 2.5 (peak 기반)
 *   시간 청산: 24캔들
 *   반대 크로스: MACD 히스토그램 방향 전환 시
 */
export class BtcMacdMomentumStrategy implements Strategy {
  config: StrategyConfig

  constructor(overrides?: Partial<typeof DEFAULT_PARAMS>) {
    const params = { ...DEFAULT_PARAMS, ...overrides }
    this.config = {
      id: 'btc_macd_momentum',
      name: 'BTC MACD 모멘텀',
      description: 'MACD 히스토그램 전환 + RSI 범위 + ADX 트렌드 + EMA(200) 필터. OKX 선물.',
      timeframe: '1h',
      exchange: 'okx',
      params,
    }
  }

  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[] {
    const signals: StrategySignal[] = []
    const {
      macdFast, macdSlow, macdSignal: macdSignalPeriod,
      rsiPeriod, adxPeriod, adxThreshold,
      trendEma, leverage, volumeMultiplier,
    } = this.config.params

    for (const symbol of ['BTC', 'ETH']) {
      const symbolCandles = candles.get(symbol)
      if (!symbolCandles || symbolCandles.length < trendEma + 1) continue

      const closes = symbolCandles.map((c) => c.close)
      const highs = symbolCandles.map((c) => c.high)
      const lows = symbolCandles.map((c) => c.low)
      const volumes = symbolCandles.map((c) => c.volume)

      // 지표 계산
      const macdValues = calcMACD(closes, macdFast, macdSlow, macdSignalPeriod)
      const rsiValues = calcRSI(closes, rsiPeriod)
      const adxValues = calcADX(highs, lows, closes, adxPeriod)
      const trendEmaValues = calcEMA(closes, trendEma)

      if (
        macdValues.length < 2 ||
        rsiValues.length === 0 ||
        adxValues.length === 0 ||
        trendEmaValues.length === 0
      ) continue

      const latestClose = closes[closes.length - 1]
      const latestMacd = macdValues[macdValues.length - 1]
      const prevMacd = macdValues[macdValues.length - 2]
      const latestRsi = rsiValues[rsiValues.length - 1]
      const latestAdx = adxValues[adxValues.length - 1]
      const latestTrend = trendEmaValues[trendEmaValues.length - 1]

      // ADX 필터: 트렌드가 충분히 강한지
      if (latestAdx < adxThreshold) continue

      // 볼륨 필터: 현재 거래량 > SMA(20) x volumeMultiplier
      const volumeWindow = volumes.slice(-20)
      const volumeSma20 = volumeWindow.length >= 20
        ? volumeWindow.reduce((a, b) => a + b, 0) / 20
        : 0
      const latestVolume = volumes[volumes.length - 1]
      if (volumeSma20 > 0 && latestVolume <= volumeSma20 * volumeMultiplier) continue

      // MACD 히스토그램 양수 전환 감지
      const histogramBullFlip = prevMacd.histogram <= 0 && latestMacd.histogram > 0
      // MACD 히스토그램 음수 전환 감지
      const histogramBearFlip = prevMacd.histogram >= 0 && latestMacd.histogram < 0

      // 롱: 히스토그램 양수 전환 + RSI 50-70 + 가격 > EMA(200)
      if (histogramBullFlip && latestRsi >= 50 && latestRsi <= 70 && latestClose > latestTrend) {
        signals.push({
          symbol,
          direction: 'buy',
          positionSide: 'long',
          leverage,
          reasoning: {
            type: 'macd_momentum',
            side: 'long',
            close: round(latestClose),
            macd: round(latestMacd.macd, 4),
            signal: round(latestMacd.signal, 4),
            histogram: round(latestMacd.histogram, 4),
            rsi: round(latestRsi, 1),
            adx: round(latestAdx),
            trend_ema: round(latestTrend),
          },
        })
      }

      // 숏: 히스토그램 음수 전환 + RSI 30-50 + 가격 < EMA(200)
      if (histogramBearFlip && latestRsi >= 30 && latestRsi <= 50 && latestClose < latestTrend) {
        signals.push({
          symbol,
          direction: 'sell',
          positionSide: 'short',
          leverage,
          reasoning: {
            type: 'macd_momentum',
            side: 'short',
            close: round(latestClose),
            macd: round(latestMacd.macd, 4),
            signal: round(latestMacd.signal, 4),
            histogram: round(latestMacd.histogram, 4),
            rsi: round(latestRsi, 1),
            adx: round(latestAdx),
            trend_ema: round(latestTrend),
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
    const { macdFast, macdSlow, macdSignal: macdSignalPeriod, atrStopMult, atrTrailMult, timeLimitCandles } = this.config.params

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
              side: pos.side ?? 'long',
            },
          })
          continue
        }

        // 2. 트레일링 스탑 (peak 기반)
        const pnlPct = isLong
          ? (currentPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - currentPrice) / pos.entryPrice

        if (pnlPct >= stopDistance * 2) {
          const trailDistance = (atrTrailMult * latestAtrPct) / 100
          const peak = pos.peakPrice ?? currentPrice
          const trailStop = isLong
            ? peak * (1 - trailDistance)
            : peak * (1 + trailDistance)

          const trailHit = isLong
            ? currentPrice <= trailStop && trailStop > pos.entryPrice
            : currentPrice >= trailStop && trailStop < pos.entryPrice

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

      // 3. 반대 MACD 크로스 청산
      const macdValues = calcMACD(closes, macdFast, macdSlow, macdSignalPeriod)
      if (macdValues.length >= 2) {
        const latestMacd = macdValues[macdValues.length - 1]
        const prevMacd = macdValues[macdValues.length - 2]

        // 롱 보유 중 히스토그램 음수 전환, 숏 보유 중 히스토그램 양수 전환
        const reverseCross = isLong
          ? (prevMacd.histogram >= 0 && latestMacd.histogram < 0)
          : (prevMacd.histogram <= 0 && latestMacd.histogram > 0)

        if (reverseCross) {
          exits.push({
            symbol: pos.symbol,
            reason: 'take_profit',
            reasoning: {
              type: 'reverse_macd_cross',
              macd: round(latestMacd.macd, 4),
              histogram: round(latestMacd.histogram, 4),
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
