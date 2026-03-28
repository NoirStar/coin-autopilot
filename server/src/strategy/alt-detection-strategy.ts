import { computeDetectionScore } from '../detector/composite-scorer.js'
import { calcATRPercent } from '../indicator/indicator-engine.js'
import type {
  Strategy,
  StrategyConfig,
  StrategySignal,
  ExitSignal,
  CandleMap,
  RegimeState,
} from './strategy-base.js'

const DEFAULT_PARAMS = {
  scoreThreshold: 0.6,
  maxPositions: 3,
  takeProfitPct1: 5,      // 1차 익절 +5%
  takeProfitPct2: 10,     // 2차 익절 +10%
  stopLossPct: 3,         // 손절 -3%
  timeLimitCandles: 24,   // 24 x 1H = 24시간
}

/**
 * 업비트 알트코인 탐지 매매 전략
 *
 * composite-scorer의 5개 지표 합산 스코어로 진입 판단.
 * Strategy 인터페이스를 구현하여 백테스트 엔진과 호환.
 *
 * 진입: 스코어 > 0.6 + BTC 급락 아닌 상태
 * 청산: +5%/+10% 단계 익절, -3% 손절, 24시간 시간청산
 */
export class AltDetectionStrategy implements Strategy {
  config: StrategyConfig

  constructor(overrides?: Partial<typeof DEFAULT_PARAMS>) {
    const params = { ...DEFAULT_PARAMS, ...overrides }
    this.config = {
      id: 'alt_detection',
      name: '업비트 알트 탐지 매매',
      description: '거래량/호가/OBV/BTC보정/9시리셋 복합 스코어로 펌핑/매집 감지 후 매수',
      timeframe: '1h',
      exchange: 'upbit',
      params,
    }
  }

  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[] {
    const signals: StrategySignal[] = []
    const { scoreThreshold, maxPositions } = this.config.params

    const btcCandles = candles.get('BTC')
    if (!btcCandles || btcCandles.length < 21) return []

    const btcPrices = btcCandles.map((c) => c.close)

    // BTC 급락 필터: 최근 1시간 내 2% 이상 하락이면 진입 금지
    const btcRecent = btcPrices.slice(-2)
    if (btcRecent.length >= 2) {
      const btcChange = (btcRecent[1] - btcRecent[0]) / btcRecent[0]
      if (btcChange < -0.02) return []
    }

    // 현재 시각 (KST)
    const now = new Date()
    const kstOffset = 9 * 60 * 60 * 1000
    const kstNow = new Date(now.getTime() + kstOffset)

    for (const [symbol, altCandles] of candles) {
      if (symbol === 'BTC') continue
      if (signals.length >= maxPositions) break
      if (altCandles.length < 21) continue

      const currentPrice = altCandles[altCandles.length - 1].close

      // 9시 시가 추정: 당일 KST 09:00 이후 첫 캔들
      // 간이: 현재 캔들 중 09:00에 가장 가까운 것
      const openPriceAt9 = altCandles.length > 9
        ? altCandles[altCandles.length - 9].open  // 대략 9시간 전 시가
        : altCandles[0].open

      const result = computeDetectionScore({
        symbol,
        candles: altCandles,
        btcPrices: btcPrices.slice(-altCandles.length),
        currentPrice,
        openPriceAt9,
        currentTimeKST: kstNow,
      })

      if (result.detected && result.score >= scoreThreshold) {
        signals.push({
          symbol,
          direction: 'buy',
          reasoning: {
            type: 'alt_detection',
            score: result.score,
            ...result.reasoning,
            signals: result.signals,
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
    const { takeProfitPct1, takeProfitPct2, stopLossPct, timeLimitCandles } = this.config.params

    for (const pos of openPositions) {
      const altCandles = candles.get(pos.symbol)
      if (!altCandles || altCandles.length === 0) continue

      const currentPrice = altCandles[altCandles.length - 1].close
      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100

      // 1. 손절: -3%
      if (pnlPct <= -stopLossPct) {
        exits.push({
          symbol: pos.symbol,
          reason: 'stop_loss',
          reasoning: {
            entry_price: pos.entryPrice,
            current_price: currentPrice,
            pnl_pct: Math.round(pnlPct * 100) / 100,
            stop_loss_pct: stopLossPct,
          },
        })
        continue
      }

      // 2. 2단계 익절: +10% 전량 청산
      if (pnlPct >= takeProfitPct2) {
        exits.push({
          symbol: pos.symbol,
          reason: 'take_profit',
          reasoning: {
            entry_price: pos.entryPrice,
            current_price: currentPrice,
            pnl_pct: Math.round(pnlPct * 100) / 100,
            target_pct: takeProfitPct2,
            stage: 2,
          },
        })
        continue
      }

      // 3. 1단계 익절: +5% → 50% 부분 청산
      if (pnlPct >= takeProfitPct1) {
        exits.push({
          symbol: pos.symbol,
          reason: 'take_profit',
          partialExitRatio: 0.5,
          reasoning: {
            entry_price: pos.entryPrice,
            current_price: currentPrice,
            pnl_pct: Math.round(pnlPct * 100) / 100,
            target_pct: takeProfitPct1,
            stage: 1,
          },
        })
        continue
      }

      // 4. 시간 청산: 24시간 (24캔들)
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
