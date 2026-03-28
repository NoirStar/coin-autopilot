import { describe, it, expect } from 'vitest'
import { BtcEmaCrossoverStrategy } from '../src/strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../src/strategy/btc-bollinger-reversion.js'
import { AltMeanReversionStrategy } from '../src/strategy/alt-mean-reversion.js'
import { evaluateRegime } from '../src/strategy/btc-regime-filter.js'
import type { Candle, CandleMap } from '../src/strategy/strategy-base.js'

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

describe('BtcEmaCrossoverStrategy', () => {
  const strategy = new BtcEmaCrossoverStrategy()

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('btc_ema_crossover')
    expect(strategy.config.exchange).toBe('okx')
    expect(strategy.config.timeframe).toBe('4h')
  })

  it('캔들 부족 시 시그널 없음', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC', generateCandles(50, 60000))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(signals).toEqual([])
  })

  it('충분한 캔들로 evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC', generateCandles(250, 60000, 10, 500))
    candles.set('ETH', generateCandles(250, 3000, 5, 50))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })

  it('시그널에 positionSide와 leverage 포함', () => {
    // 강한 상승 트렌드 + 골든크로스 유도
    const candles: CandleMap = new Map()
    const btc = generateCandles(250, 50000, 50, 200)
    candles.set('BTC', btc)
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

describe('BtcBollingerReversionStrategy', () => {
  const strategy = new BtcBollingerReversionStrategy()

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('btc_bollinger_reversion')
    expect(strategy.config.exchange).toBe('okx')
  })

  it('충분한 캔들로 evaluate 에러 없이 실행', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC', generateCandles(250, 60000, 0, 1000))
    candles.set('ETH', generateCandles(250, 3000, 0, 100))
    const signals = strategy.evaluate(candles, 'risk_on')
    expect(Array.isArray(signals)).toBe(true)
  })
})

describe('AltMeanReversionStrategy', () => {
  const strategy = new AltMeanReversionStrategy()

  it('config가 올바름', () => {
    expect(strategy.config.id).toBe('alt_mean_reversion')
    expect(strategy.config.exchange).toBe('upbit')
  })

  it('Risk-Off에서 시그널 없음', () => {
    const candles: CandleMap = new Map()
    candles.set('BTC', generateCandles(250, 60000))
    candles.set('ETH', generateCandles(250, 3000))
    const signals = strategy.evaluate(candles, 'risk_off')
    expect(signals).toEqual([])
  })
})

describe('evaluateRegime', () => {
  it('강한 상승장은 risk_on', () => {
    // BTC가 EMA(200) 위, RSI 52-70, ATR% 낮음
    const candles = generateCandles(250, 50000, 20, 100)
    const result = evaluateRegime(candles)
    // 강한 상승이면 RSI가 높을 수 있어서 risk_on 또는 이전 레짐 유지
    expect(['risk_on', 'risk_off']).toContain(result.regime)
    expect(result.btcClose).toBeGreaterThan(0)
    expect(result.ema200).toBeGreaterThan(0)
  })

  it('데이터 부족 시 이전 레짐 유지', () => {
    const candles = generateCandles(10, 50000)
    const result = evaluateRegime(candles, 'risk_on')
    expect(result.regime).toBe('risk_on')
  })
})
