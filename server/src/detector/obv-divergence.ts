/**
 * OBV (On-Balance Volume) 다이버전스 탐지
 *
 * 가격은 하락/횡보인데 OBV는 상승하면 = 숨겨진 매수 축적
 * 가격 추세와 OBV 추세의 기울기 부호가 반대이면 다이버전스
 */

import type { Candle } from '../strategy/strategy-base.js'

/** OBV 계산 */
export function calculateOBV(candles: Candle[]): number[] {
  if (candles.length === 0) return []

  const obv: number[] = [0]

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv.push(obv[i - 1] + candles[i].volume)
    } else if (candles[i].close < candles[i - 1].close) {
      obv.push(obv[i - 1] - candles[i].volume)
    } else {
      obv.push(obv[i - 1])
    }
  }

  return obv
}

/** 선형 회귀 기울기 계산 */
function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0
  return (n * sumXY - sumX * sumY) / denom
}

/**
 * OBV 다이버전스 감지
 * @param candles 캔들 데이터
 * @param period 추세선 기간 (기본 20)
 * @returns 불리시 다이버전스 감지 여부
 */
export function detectOBVDivergence(
  candles: Candle[],
  period: number = 20
): { detected: boolean; priceSlope: number; obvSlope: number; divergenceType: 'bullish' | 'bearish' | 'none' } {
  if (candles.length < period) {
    return { detected: false, priceSlope: 0, obvSlope: 0, divergenceType: 'none' }
  }

  const recentCandles = candles.slice(-period)
  const closes = recentCandles.map((c) => c.close)
  const obv = calculateOBV(recentCandles)

  const priceSlope = linearSlope(closes)
  const obvSlope = linearSlope(obv)

  // 정규화: 기울기를 평균 대비 비율로
  const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length
  const avgObv = obv.reduce((a, b) => a + b, 0) / obv.length
  const normPriceSlope = avgPrice !== 0 ? priceSlope / avgPrice : 0
  const normObvSlope = avgObv !== 0 ? obvSlope / Math.abs(avgObv || 1) : 0

  // 불리시 다이버전스: 가격 하락 + OBV 상승
  if (normPriceSlope < -0.001 && normObvSlope > 0.001) {
    return {
      detected: true,
      priceSlope: Math.round(normPriceSlope * 10000) / 10000,
      obvSlope: Math.round(normObvSlope * 10000) / 10000,
      divergenceType: 'bullish',
    }
  }

  // 베어리시 다이버전스: 가격 상승 + OBV 하락
  if (normPriceSlope > 0.001 && normObvSlope < -0.001) {
    return {
      detected: true,
      priceSlope: Math.round(normPriceSlope * 10000) / 10000,
      obvSlope: Math.round(normObvSlope * 10000) / 10000,
      divergenceType: 'bearish',
    }
  }

  return {
    detected: false,
    priceSlope: Math.round(normPriceSlope * 10000) / 10000,
    obvSlope: Math.round(normObvSlope * 10000) / 10000,
    divergenceType: 'none',
  }
}
