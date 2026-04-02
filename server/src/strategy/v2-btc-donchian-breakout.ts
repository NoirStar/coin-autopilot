import { calcDonchianChannel, calcATRPercent } from '../indicator/indicator-engine.js'
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
  donchianPeriod: 20,
  atrPeriod: 14,
  atrStopMult: 2.0,
  atrTrailMult: 3.0,
  volumeMultiplier: 2.0,
  timeLimitCandles: 20,     // 20 x 1H = 20시간
  leverage: 2,
}

/**
 * BTC 돈치안 브레이크아웃 전략 (OKX 선물용) — V2
 *
 * 돈치안 채널 20기간 (1H 타임프레임)
 *
 * 진입:
 *   롱: 가격이 상단 돌파 + 볼륨 > SMA(20) x 2.0 + ATR 확장 중
 *   숏: 가격이 하단 돌파 + 볼륨 > SMA(20) x 2.0 + ATR 확장 중
 *   시간 필터: UTC 00:00-04:00, 12:00-16:00 (세션 시작 시점)
 *
 * 청산:
 *   손절: ATR(14) x 2.0
 *   트레일링 스탑: ATR(14) x 3.0 (peak 기반)
 *   시간 청산: 20캔들
 *   반대 돌파: 반대 채널 돌파 시
 */
class BtcDonchianBreakoutV2 implements Strategy {
  config: StrategyConfig

  constructor(overrides?: Partial<typeof DEFAULT_PARAMS>) {
    const params = { ...DEFAULT_PARAMS, ...overrides }
    this.config = {
      id: 'btc_donchian_breakout',
      name: 'BTC 돈치안 브레이크아웃',
      description: '돈치안 채널 20기간 돌파 + 볼륨 확인 + ATR 확장. OKX 선물 롱/숏.',
      timeframe: '1h',
      exchange: 'okx',
      assetClass: 'crypto_futures',
      direction: 'both',
      params,
    }
  }

  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[] {
    const signals: StrategySignal[] = []
    const { donchianPeriod, atrPeriod, volumeMultiplier, leverage } = this.config.params

    for (const symbol of ['BTC', 'ETH']) {
      const symbolCandles = candles.get(symbol)
      if (!symbolCandles || symbolCandles.length < donchianPeriod + 2) continue

      const closes = symbolCandles.map((c) => c.close)
      const highs = symbolCandles.map((c) => c.high)
      const lows = symbolCandles.map((c) => c.low)
      const volumes = symbolCandles.map((c) => c.volume)

      // 돈치안 채널 계산
      const dcValues = calcDonchianChannel(highs, lows, donchianPeriod)
      if (dcValues.length < 2) continue

      // ATR 계산 (확장 확인용)
      const atrPctValues = calcATRPercent(highs, lows, closes, atrPeriod)
      if (atrPctValues.length < 2) continue

      const latestClose = closes[closes.length - 1]
      const prevClose = closes[closes.length - 2]
      // 이전 캔들의 돈치안 채널 (현재 캔들 돌파 판단 기준)
      const prevDc = dcValues[dcValues.length - 2]
      const latestAtrPct = atrPctValues[atrPctValues.length - 1]
      const prevAtrPct = atrPctValues[atrPctValues.length - 2]

      // NaN 방어: 지표 값이 유효하지 않으면 스킵
      if ([latestClose, prevClose, prevDc.upper, prevDc.lower, latestAtrPct, prevAtrPct].some(v => !Number.isFinite(v))) continue

      // ATR 확장 중: 현재 ATR > 이전 ATR
      const atrExpanding = latestAtrPct > prevAtrPct

      if (!atrExpanding) continue

      // 볼륨 필터: 현재 거래량 > SMA(20) x volumeMultiplier
      const volumeWindow = volumes.slice(-20)
      const volumeSma20 = volumeWindow.length >= 20
        ? volumeWindow.reduce((a, b) => a + b, 0) / 20
        : 0
      const latestVolume = volumes[volumes.length - 1]
      if (volumeSma20 > 0 && latestVolume <= volumeSma20 * volumeMultiplier) continue

      // 시간 필터: UTC 00:00-04:00, 12:00-16:00
      const latestCandle = symbolCandles[symbolCandles.length - 1]
      const candleHour = latestCandle.openTime.getUTCHours()
      const inSession = (candleHour >= 0 && candleHour < 4) || (candleHour >= 12 && candleHour < 16)
      if (!inSession) continue

      // 롱: 가격이 이전 돈치안 상단 돌파
      const breakoutUp = prevClose <= prevDc.upper && latestClose > prevDc.upper
      if (breakoutUp) {
        signals.push({
          symbol,
          direction: 'buy',
          positionSide: 'long',
          leverage,
          reasoning: {
            type: 'donchian_breakout',
            side: 'long',
            close: round(latestClose),
            dc_upper: round(prevDc.upper),
            dc_lower: round(prevDc.lower),
            atr_pct: round(latestAtrPct),
            volume_ratio: volumeSma20 > 0 ? round(latestVolume / volumeSma20) : 0,
          },
        })
      }

      // 숏: 가격이 이전 돈치안 하단 돌파
      const breakoutDown = prevClose >= prevDc.lower && latestClose < prevDc.lower
      if (breakoutDown) {
        signals.push({
          symbol,
          direction: 'sell',
          positionSide: 'short',
          leverage,
          reasoning: {
            type: 'donchian_breakout',
            side: 'short',
            close: round(latestClose),
            dc_upper: round(prevDc.upper),
            dc_lower: round(prevDc.lower),
            atr_pct: round(latestAtrPct),
            volume_ratio: volumeSma20 > 0 ? round(latestVolume / volumeSma20) : 0,
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
    const { donchianPeriod, atrStopMult, atrTrailMult, timeLimitCandles } = this.config.params

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
            const peak = pos.peakPrice ?? currentPrice
            const trailStop = isLong
              ? peak * (1 - trailDistance)
              : peak * (1 + trailDistance)

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

      // 3. 반대 돌파 청산
      const dcValues = calcDonchianChannel(highs, lows, donchianPeriod)
      if (dcValues.length >= 2) {
        const prevDc = dcValues[dcValues.length - 2]
        const prevClose = closes[closes.length - 2]

        // 롱 보유 중 하단 돌파 → 청산, 숏 보유 중 상단 돌파 → 청산
        const reverseBreakout = isLong
          ? (prevClose >= prevDc.lower && currentPrice < prevDc.lower)
          : (prevClose <= prevDc.upper && currentPrice > prevDc.upper)

        if (reverseBreakout) {
          exits.push({
            symbol: pos.symbol,
            reason: 'take_profit',
            reasoning: {
              type: 'reverse_breakout',
              current_price: currentPrice,
              dc_upper: round(prevDc.upper),
              dc_lower: round(prevDc.lower),
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
registerStrategy(new BtcDonchianBreakoutV2())

export { BtcDonchianBreakoutV2 }
