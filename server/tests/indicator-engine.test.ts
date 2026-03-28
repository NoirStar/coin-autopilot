import { describe, it, expect } from 'vitest'
import { calcEMA, calcRSI, calcATRPercent, calcBollingerBands, calcADX, calcMACD, calcZScore, calcAltBtcZScore, calcDonchianChannel } from '../src/indicator/indicator-engine.js'

describe('calcEMA', () => {
  it('기본 EMA 계산', () => {
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08]
    const result = calcEMA(closes, 5)
    expect(result.length).toBeGreaterThan(0)
    expect(result[result.length - 1]).toBeCloseTo(45.5, 0)
  })

  it('데이터 부족 시 빈 배열', () => {
    expect(calcEMA([1, 2], 5)).toEqual([])
  })
})

describe('calcRSI', () => {
  it('상승 추세에서 RSI > 50', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const result = calcRSI(closes, 14)
    expect(result.length).toBeGreaterThan(0)
    expect(result[result.length - 1]).toBeGreaterThan(50)
  })

  it('하락 추세에서 RSI < 50', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i)
    const result = calcRSI(closes, 14)
    expect(result.length).toBeGreaterThan(0)
    expect(result[result.length - 1]).toBeLessThan(50)
  })

  it('데이터 부족 시 빈 배열', () => {
    expect(calcRSI([1, 2, 3], 14)).toEqual([])
  })
})

describe('calcATRPercent', () => {
  it('ATR%가 양수', () => {
    const len = 20
    const highs = Array.from({ length: len }, (_, i) => 105 + Math.sin(i) * 3)
    const lows = Array.from({ length: len }, (_, i) => 95 + Math.sin(i) * 3)
    const closes = Array.from({ length: len }, (_, i) => 100 + Math.sin(i) * 2)
    const result = calcATRPercent(highs, lows, closes, 14)
    expect(result.length).toBeGreaterThan(0)
    result.forEach((v) => expect(v).toBeGreaterThan(0))
  })
})

describe('calcBollingerBands', () => {
  it('상단 > 중간 > 하단', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5)
    const result = calcBollingerBands(closes, 20, 2)
    expect(result.length).toBeGreaterThan(0)
    const last = result[result.length - 1]
    expect(last.upper).toBeGreaterThan(last.middle)
    expect(last.middle).toBeGreaterThan(last.lower)
  })
})

describe('calcADX', () => {
  it('트렌드 존재 시 ADX > 0', () => {
    const len = 50
    const highs = Array.from({ length: len }, (_, i) => 100 + i * 0.5 + Math.random())
    const lows = Array.from({ length: len }, (_, i) => 98 + i * 0.5 - Math.random())
    const closes = Array.from({ length: len }, (_, i) => 99 + i * 0.5)
    const result = calcADX(highs, lows, closes, 14)
    expect(result.length).toBeGreaterThan(0)
    result.forEach((v) => expect(v).toBeGreaterThanOrEqual(0))
  })
})

describe('calcMACD', () => {
  it('MACD 계산', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 5) * 10)
    const result = calcMACD(closes)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('macd')
    expect(result[0]).toHaveProperty('signal')
    expect(result[0]).toHaveProperty('histogram')
  })
})

describe('calcZScore', () => {
  it('평균값의 z-score는 0 근처', () => {
    const data = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    const result = calcZScore(data, 5)
    expect(result.length).toBeGreaterThan(0)
    result.forEach((v) => expect(Math.abs(v)).toBeLessThan(0.01))
  })

  it('극단값의 z-score는 높음', () => {
    const data = [10, 10, 10, 10, 10, 10, 10, 10, 10, 50]
    const result = calcZScore(data, 9)
    expect(result[result.length - 1]).toBeGreaterThan(2)
  })
})

describe('calcDonchianChannel', () => {
  it('알려진 데이터로 upper/lower/middle 정확히 계산', () => {
    // 5기간 돈치안 채널
    const highs  = [10, 12, 11, 14, 13, 15, 12, 16, 14, 11]
    const lows   = [ 5,  6,  4,  7,  8,  9,  6, 10,  7,  5]
    const result = calcDonchianChannel(highs, lows, 5)

    // 기간=5이므로 result[0]은 인덱스 0~4, result[1]은 인덱스 1~5 ...
    // result[0]: highs[0..4] max=14, lows[0..4] min=4
    expect(result[0].upper).toBe(14)
    expect(result[0].lower).toBe(4)
    expect(result[0].middle).toBe((14 + 4) / 2) // 9

    // result[1]: highs[1..5] = [12,11,14,13,15] max=15, lows[1..5] = [6,4,7,8,9] min=4
    expect(result[1].upper).toBe(15)
    expect(result[1].lower).toBe(4)
    expect(result[1].middle).toBe((15 + 4) / 2) // 9.5

    // result[5]: highs[5..9] max=16, lows[5..9] min=5
    expect(result[5].upper).toBe(16)
    expect(result[5].lower).toBe(5)
    expect(result[5].middle).toBe((16 + 5) / 2) // 10.5

    // 결과 길이: len - period + 1 = 10 - 5 + 1 = 6
    expect(result.length).toBe(6)
  })

  it('데이터 부족 시 빈 배열', () => {
    expect(calcDonchianChannel([1, 2], [1, 2], 5)).toEqual([])
  })

  it('period=1이면 각 캔들 자체가 채널', () => {
    const highs = [10, 20, 30]
    const lows  = [ 5, 15, 25]
    const result = calcDonchianChannel(highs, lows, 1)
    expect(result.length).toBe(3)
    expect(result[0]).toEqual({ upper: 10, lower: 5, middle: 7.5 })
    expect(result[2]).toEqual({ upper: 30, lower: 25, middle: 27.5 })
  })
})
