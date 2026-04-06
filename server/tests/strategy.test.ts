import { describe, it, expect, vi } from 'vitest'
import type { Candle, CandleMap, RegimeState } from '../src/core/types.js'

// Supabase mock (v2-registry가 database.ts를 import하므로 필요)
vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  },
}))

// 전략 파일을 import하면 registerStrategy()가 자동 호출됨
import '../src/strategy/btc-ema-crossover.js'
import '../src/strategy/btc-bollinger-reversion.js'
import '../src/strategy/btc-macd-momentum.js'
import '../src/strategy/btc-donchian-breakout.js'
import '../src/strategy/alt-mean-reversion.js'
import '../src/strategy/alt-detection.js'
import { getStrategy, getAllStrategies } from '../src/strategy/registry.js'

/** 테스트용 캔들 생성 */
function generateCandles(count: number, basePrice: number, trend: number = 0, volatility: number = 1): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const price = basePrice + trend * i + (Math.sin(i / 3) * volatility)
    return {
      openTime: new Date(Date.now() - (count - i) * 4 * 3600000),
      open: price - volatility * 0.3,
      high: price + volatility,
      low: price - volatility,
      close: price,
      volume: 1000 + Math.random() * 500,
    }
  })
}

describe('전략 레지스트리', () => {
  it('6개 전략이 모두 등록됨', () => {
    const strategies = getAllStrategies()
    expect(strategies.length).toBe(6)
  })

  it('ID로 전략 조회 가능', () => {
    const strategy = getStrategy('btc_ema_crossover')
    expect(strategy).toBeDefined()
    expect(strategy?.config.exchange).toBe('okx')
  })
})

describe('BTC EMA 크로스오버', () => {
  const strategy = getStrategy('btc_ema_crossover')!

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('btc_ema_crossover')
    expect(strategy.config.exchange).toBe('okx')
    expect(strategy.config.timeframe).toBe('4h')
    expect(strategy.config.direction).toBe('both')
  })

  it('캔들 부족 시 시그널 없음', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC-USDT', generateCandles(50, 60000))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(signals).toEqual([])
  })

  it('충분한 캔들로 evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC-USDT', generateCandles(250, 60000, 10, 500))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })

  it('시그널에 positionSide와 leverage 포함', () => {
    const candles: CandleMap = new Map()
    const btc = generateCandles(250, 50000, 50, 200)
    candles.set('BTC-USDT', btc)
    const signals = strategy.evaluate(candles, 'risk_on')
    for (const sig of signals) {
      if (sig.positionSide) {
        expect(['long', 'short']).toContain(sig.positionSide)
      }
      if (sig.leverage) {
        expect(sig.leverage).toBeGreaterThan(0)
      }
    }
  })
})

describe('BTC 볼린저 평균회귀', () => {
  const strategy = getStrategy('btc_bollinger_reversion')!

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('btc_bollinger_reversion')
    expect(strategy.config.exchange).toBe('okx')
    expect(strategy.config.direction).toBe('both')
  })

  it('evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC-USDT', generateCandles(250, 60000, 0, 2000))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })
})

describe('BTC MACD 모멘텀', () => {
  const strategy = getStrategy('btc_macd_momentum')!

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('btc_macd_momentum')
    expect(strategy.config.timeframe).toBe('1h')
  })

  it('evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC-USDT', generateCandles(250, 60000, 5, 300))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })
})

describe('BTC 돈치안 브레이크아웃', () => {
  const strategy = getStrategy('btc_donchian_breakout')!

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('btc_donchian_breakout')
    expect(strategy.config.timeframe).toBe('1h')
  })

  it('evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC-USDT', generateCandles(250, 60000, 20, 500))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })
})

describe('알트코인 평균회귀', () => {
  const strategy = getStrategy('alt_mean_reversion')!

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('alt_mean_reversion')
    expect(strategy.config.exchange).toBe('upbit')
    expect(strategy.config.direction).toBe('long')
  })

  it('evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC-KRW', generateCandles(250, 60000, 0, 500))
    candles.set('ETH-KRW', generateCandles(250, 3000, -5, 50))
    candles.set('XRP-KRW', generateCandles(250, 500, -2, 10))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })
})

describe('알트코인 탐지 매매', () => {
  const strategy = getStrategy('alt_detection')!

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('alt_detection')
    expect(strategy.config.exchange).toBe('upbit')
    expect(strategy.config.direction).toBe('long')
  })

  it('BTC 급락 시 시그널 없음', () => {
    const candles: CandleMap = new Map()
    // BTC -3% 급락
    const btcCandles = generateCandles(25, 60000, 0, 100)
    btcCandles[btcCandles.length - 1].close = 58000
    candles.set('BTC-KRW', btcCandles)
    candles.set('SOL-KRW', generateCandles(25, 100, 5, 5))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(signals).toEqual([])
  })
})

describe('evaluateExits', () => {
  it('시간 초과 포지션 청산', () => {
    const strategy = getStrategy('btc_ema_crossover')!
    const candles: CandleMap = new Map()
    candles.set('BTC-USDT', generateCandles(250, 60000, 0, 100))

    const exits = strategy.evaluateExits(candles, 'risk_on', [{
      symbol: 'BTC-USDT',
      entryPrice: 60000,
      entryTime: new Date(Date.now() - 200 * 3600000),
      candlesSinceEntry: 35, // > 30 캔들 제한
      side: 'long',
      peakPrice: 60100,
    }])

    expect(exits.some(e => e.reason === 'time_exit')).toBe(true)
  })
})
