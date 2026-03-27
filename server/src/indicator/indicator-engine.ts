import { EMA, RSI, ATR, BollingerBands } from 'technicalindicators'

/**
 * EMA 계산
 * @returns EMA 배열. 입력 데이터보다 짧을 수 있음 (period-1개 적음)
 */
export function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return []
  return EMA.calculate({ period, values: closes })
}

/**
 * RSI 계산
 * @returns RSI 배열 (0~100)
 */
export function calcRSI(closes: number[], period: number): number[] {
  if (closes.length < period + 1) return []
  return RSI.calculate({ period, values: closes })
}

/**
 * ATR% 계산 — ATR을 종가 대비 퍼센트로 변환
 * @returns ATR% 배열
 */
export function calcATRPercent(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number
): number[] {
  const len = Math.min(highs.length, lows.length, closes.length)
  if (len < period + 1) return []

  const atrValues = ATR.calculate({
    period,
    high: highs.slice(0, len),
    low: lows.slice(0, len),
    close: closes.slice(0, len),
  })

  // ATR을 해당 시점 종가 대비 %로 변환
  const offset = len - atrValues.length
  return atrValues.map((atr, i) => {
    const closePrice = closes[offset + i]
    if (closePrice === 0) return 0
    return (atr / closePrice) * 100
  })
}

/**
 * z-score 계산 — (현재값 - 이동평균) / 표준편차
 * @returns z-score 배열
 */
export function calcZScore(data: number[], period: number): number[] {
  if (data.length < period) return []

  const result: number[] = []
  for (let i = period - 1; i < data.length; i++) {
    const window = data.slice(i - period + 1, i + 1)
    const mean = window.reduce((a, b) => a + b, 0) / period
    const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)

    // 표준편차가 0이면 z-score = 0 (모든 값이 동일)
    if (std === 0) {
      result.push(0)
    } else {
      result.push((data[i] - mean) / std)
    }
  }
  return result
}

/**
 * 볼린저 밴드 계산
 */
export function calcBollingerBands(
  closes: number[],
  period: number,
  stdDev: number = 2
): Array<{ upper: number; middle: number; lower: number }> {
  if (closes.length < period) return []
  return BollingerBands.calculate({
    period,
    stdDev,
    values: closes,
  })
}

/**
 * BTC 대비 알트코인 비율의 z-score
 * R_i = ln(ALT_i / BTC_i)
 */
export function calcAltBtcZScore(
  altCloses: number[],
  btcCloses: number[],
  period: number
): number[] {
  const len = Math.min(altCloses.length, btcCloses.length)
  if (len < period) return []

  // ln(ALT/BTC) 비율 계산
  const ratios: number[] = []
  for (let i = 0; i < len; i++) {
    if (btcCloses[i] === 0 || altCloses[i] === 0) {
      ratios.push(0)
    } else {
      ratios.push(Math.log(altCloses[i] / btcCloses[i]))
    }
  }

  return calcZScore(ratios, period)
}
