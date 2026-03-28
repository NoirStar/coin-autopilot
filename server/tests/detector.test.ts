import { describe, it, expect } from 'vitest'
import { detectVolumeAnomaly } from '../src/detector/volume-zscore.js'
import { detectBtcAdjustedPump } from '../src/detector/btc-adjusted-pump.js'
import { detectOrderbookImbalance, detectBuyWall } from '../src/detector/orderbook-imbalance.js'
import { detectOBVDivergence } from '../src/detector/obv-divergence.js'
import { detectMorningResetMomentum, isNearMorningReset } from '../src/detector/morning-reset.js'

describe('detectVolumeAnomaly', () => {
  it('정상 거래량은 감지 안 됨', () => {
    const volumes = Array.from({ length: 25 }, () => 1000 + Math.random() * 100)
    const result = detectVolumeAnomaly(volumes)
    expect(result.detected).toBe(false)
  })

  it('거래량 급증 감지', () => {
    // 안정된 거래량 후 극단적 급증
    const volumes = Array.from({ length: 24 }, () => 1000)
    volumes.push(15000) // 15배 급증 — std가 0이면 안 되니까 약간의 노이즈 추가
    // std=0이면 z-score 계산 불가. 약간 변동 추가.
    volumes[5] = 1010
    volumes[10] = 990
    volumes[15] = 1020
    const result = detectVolumeAnomaly(volumes)
    expect(result.detected).toBe(true)
    expect(result.zScore).toBeGreaterThan(2.5)
  })

  it('데이터 부족 시 미감지', () => {
    const result = detectVolumeAnomaly([100, 200])
    expect(result.detected).toBe(false)
  })
})

describe('detectBtcAdjustedPump', () => {
  it('BTC와 동반 상승은 미감지', () => {
    const altPrices = Array.from({ length: 15 }, (_, i) => 100 + i * 0.5)
    const btcPrices = Array.from({ length: 15 }, (_, i) => 50000 + i * 250)
    const result = detectBtcAdjustedPump(altPrices, btcPrices)
    expect(result.detected).toBe(false)
  })

  it('알트만 독립 급등하면 감지', () => {
    const altPrices = Array.from({ length: 15 }, (_, i) => 100)
    altPrices[altPrices.length - 1] = 105 // 알트 5% 상승
    const btcPrices = Array.from({ length: 15 }, () => 50000) // BTC 횡보
    const result = detectBtcAdjustedPump(altPrices, btcPrices)
    expect(result.detected).toBe(true)
    expect(result.adjustedChangePct).toBeGreaterThanOrEqual(2)
  })
})

describe('detectOrderbookImbalance', () => {
  it('균형 잡힌 호가 미감지', () => {
    const orderbook = {
      bids: Array.from({ length: 10 }, (_, i) => ({ price: 100 - i, size: 10 })),
      asks: Array.from({ length: 10 }, (_, i) => ({ price: 101 + i, size: 10 })),
    }
    const result = detectOrderbookImbalance(orderbook)
    expect(result.detected).toBe(false)
    expect(result.bidAskRatio).toBeCloseTo(1.0, 1)
  })

  it('매수 우세 감지', () => {
    const orderbook = {
      bids: Array.from({ length: 10 }, (_, i) => ({ price: 100 - i, size: 30 })),
      asks: Array.from({ length: 10 }, (_, i) => ({ price: 101 + i, size: 10 })),
    }
    const result = detectOrderbookImbalance(orderbook)
    expect(result.detected).toBe(true)
    expect(result.bidAskRatio).toBeGreaterThan(2)
  })
})

describe('detectBuyWall', () => {
  it('매수벽 감지', () => {
    const orderbook = {
      bids: [
        { price: 100, size: 500 }, // 전체의 50% 이상
        ...Array.from({ length: 9 }, (_, i) => ({ price: 99 - i, size: 50 })),
      ],
      asks: Array.from({ length: 10 }, (_, i) => ({ price: 101 + i, size: 50 })),
    }
    const result = detectBuyWall(orderbook)
    expect(result?.detected).toBe(true)
    expect(result?.wallPrice).toBe(100)
  })
})

describe('detectOBVDivergence', () => {
  it('가격 하락 + 거래량 상승 → 불리시 다이버전스', () => {
    // 가격 꾸준히 하락, 하락일에도 거래량 계속 증가
    // OBV는 상승일 +volume, 하락일 -volume이므로
    // 가격 하락 + OBV 상승 = 하락일보다 상승일 거래량이 커야 함
    const candles = Array.from({ length: 25 }, (_, i) => {
      // 전체적으로 하락 추세이지만, 짝수 캔들은 약간 상승 (큰 거래량)
      const isUp = i % 2 === 0
      const basePrice = 100 - i * 0.5
      return {
        openTime: new Date(Date.now() - (25 - i) * 3600000),
        open: basePrice,
        high: basePrice + 1,
        low: basePrice - 1,
        close: isUp ? basePrice + 0.3 : basePrice - 0.8, // 하락폭 > 상승폭 → 가격 하락 추세
        volume: isUp ? 3000 + i * 200 : 500, // 상승일 거래량 훨씬 큼 → OBV 상승
      }
    })
    const result = detectOBVDivergence(candles)
    expect(result.divergenceType).toBe('bullish')
    expect(result.detected).toBe(true)
  })

  it('정상 추세 미감지', () => {
    const candles = Array.from({ length: 25 }, (_, i) => ({
      openTime: new Date(Date.now() - (25 - i) * 3600000),
      open: 100 + i * 0.5,
      high: 101 + i * 0.5,
      low: 99 + i * 0.5,
      close: 100 + i * 0.5,
      volume: 1000 + i * 50,
    }))
    const result = detectOBVDivergence(candles)
    expect(result.divergenceType).not.toBe('bullish')
  })
})

describe('detectMorningResetMomentum', () => {
  it('9시 직후 상승 감지', () => {
    const kst = new Date()
    kst.setHours(9, 10, 0, 0) // 09:10 KST
    const result = detectMorningResetMomentum(101.5, 100, kst, 1.0)
    expect(result.detected).toBe(true)
    expect(result.changePct).toBeGreaterThan(1)
  })

  it('9시 범위 밖이면 미감지', () => {
    const kst = new Date()
    kst.setHours(14, 0, 0, 0) // 14:00 KST
    const result = detectMorningResetMomentum(105, 100, kst, 1.0)
    expect(result.detected).toBe(false)
  })
})
