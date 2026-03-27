import { calcEMA, calcRSI, calcATRPercent } from '../indicator/indicator-engine.js'
import type { Candle, RegimeState } from './strategy-base.js'

export interface RegimeDetail {
  regime: RegimeState
  btcClose: number
  ema200: number
  rsi14: number
  atrPct: number
  timestamp: Date
}

/**
 * BTC 레짐 판단
 *
 * Risk-On 조건 (모두 충족):
 *   ① BTC Close > EMA(200)
 *   ② BTC RSI(14) ∈ [52, 70]
 *   ③ BTC ATR%(14) ≤ 4.5%
 *
 * Risk-Off 조건 (하나라도 충족):
 *   ① BTC Close < EMA(200)
 *   ② BTC ATR%(14) ≥ 6.5%
 *   ③ BTC RSI(14) ≤ 45
 *
 * 경계값: EMA와 가격이 같으면 이전 레짐 유지
 */
export function evaluateRegime(
  btcCandles: Candle[],
  previousRegime: RegimeState = 'risk_off'
): RegimeDetail {
  const closes = btcCandles.map((c) => c.close)
  const highs = btcCandles.map((c) => c.high)
  const lows = btcCandles.map((c) => c.low)

  const emaValues = calcEMA(closes, 200)
  const rsiValues = calcRSI(closes, 14)
  const atrPctValues = calcATRPercent(highs, lows, closes, 14)

  // 데이터가 부족하면 이전 레짐 유지
  if (emaValues.length === 0 || rsiValues.length === 0 || atrPctValues.length === 0) {
    const lastCandle = btcCandles[btcCandles.length - 1]
    return {
      regime: previousRegime,
      btcClose: lastCandle?.close ?? 0,
      ema200: 0,
      rsi14: 0,
      atrPct: 0,
      timestamp: lastCandle?.openTime ?? new Date(),
    }
  }

  const latestClose = closes[closes.length - 1]
  const latestEma = emaValues[emaValues.length - 1]
  const latestRsi = rsiValues[rsiValues.length - 1]
  const latestAtrPct = atrPctValues[atrPctValues.length - 1]
  const latestTime = btcCandles[btcCandles.length - 1].openTime

  const detail: RegimeDetail = {
    regime: previousRegime,
    btcClose: latestClose,
    ema200: latestEma,
    rsi14: latestRsi,
    atrPct: latestAtrPct,
    timestamp: latestTime,
  }

  // 경계값: 가격과 EMA가 같으면 이전 레짐 유지
  if (latestClose === latestEma) {
    return detail
  }

  // Risk-Off 체크 (하나라도 충족)
  if (latestClose < latestEma || latestAtrPct >= 6.5 || latestRsi <= 45) {
    detail.regime = 'risk_off'
    return detail
  }

  // Risk-On 체크 (모두 충족)
  if (latestClose > latestEma && latestRsi >= 52 && latestRsi <= 70 && latestAtrPct <= 4.5) {
    detail.regime = 'risk_on'
    return detail
  }

  // 어느 쪽도 아니면 이전 레짐 유지 (중립 구간)
  return detail
}
