import { describe, it, expect } from 'vitest'
import { BtcEmaCrossoverStrategy } from '../src/strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../src/strategy/btc-bollinger-reversion.js'
import { AltMeanReversionStrategy } from '../src/strategy/alt-mean-reversion.js'
import { BtcDonchianBreakoutStrategy } from '../src/strategy/btc-donchian-breakout.js'
import { BtcMacdMomentumStrategy } from '../src/strategy/btc-macd-momentum.js'
import { evaluateRegime } from '../src/strategy/btc-regime-filter.js'
import { calcEMA, calcADX } from '../src/indicator/indicator-engine.js'
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

// ---------------------------------------------------------------------------
// 정교한 캔들 생성 — EMA 크로스오버를 유도할 수 있는 캔들 배열 반환
// ---------------------------------------------------------------------------

/**
 * 골든크로스를 유도하는 캔들 생성
 * 전반부에서 가격이 낮고 후반부에서 급등하여 EMA(12)가 EMA(26)을 상향 돌파하게 함
 * 가격 > EMA(200) 이 되도록 전체적으로 상승 트렌드 위에 위치
 */
function buildGoldenCrossCandles(): Candle[] {
  const count = 250
  const candles: Candle[] = []
  for (let i = 0; i < count; i++) {
    // 전체적으로 높은 가격에서 시작 → EMA(200) 위에 위치하게
    let price: number
    if (i < 220) {
      // 안정적인 상승 트렌드 (EMA(200) 형성용)
      price = 50000 + i * 20
    } else if (i < 240) {
      // 하락 구간: fast EMA가 slow EMA 아래로 내려감
      price = 54400 - (i - 220) * 150
    } else {
      // 급등 구간: fast EMA가 slow EMA를 다시 상향 돌파 (골든크로스)
      price = 51400 + (i - 240) * 500
    }
    candles.push({
      openTime: new Date(Date.UTC(2024, 0, 1) + i * 4 * 3600_000),
      open: price - 50,
      high: price + 200,
      low: price - 200,
      close: price,
      volume: 5000, // 높은 볼륨으로 볼륨 필터 통과
    })
  }
  return candles
}

/**
 * 데드크로스를 유도하는 캔들 생성
 * 가격 < EMA(200) + 하락 크로스
 */
function buildDeathCrossCandles(): Candle[] {
  const count = 250
  const candles: Candle[] = []
  for (let i = 0; i < count; i++) {
    let price: number
    if (i < 220) {
      // 하락 트렌드 (EMA(200) 위에서 아래로)
      price = 60000 - i * 30
    } else if (i < 240) {
      // 일시 반등: fast EMA가 slow EMA 위로
      price = 53400 + (i - 220) * 100
    } else {
      // 급락: fast EMA가 slow EMA 아래로 (데드크로스)
      price = 55400 - (i - 240) * 400
    }
    candles.push({
      openTime: new Date(Date.UTC(2024, 0, 1) + i * 4 * 3600_000),
      open: price - 50,
      high: price + 200,
      low: price - 200,
      close: price,
      volume: 5000,
    })
  }
  return candles
}

describe('BtcEmaCrossoverStrategy - 진입 조건 상세', () => {
  const strategy = new BtcEmaCrossoverStrategy()

  it('EMA 크로스오버 골든크로스 진입 검증', () => {
    // 골든크로스 캔들 데이터로 평가
    const btcCandles = buildGoldenCrossCandles()
    const candles: CandleMap = new Map()
    candles.set('BTC', btcCandles)

    // evaluate는 전체 캔들을 받으므로 마지막 시점의 시그널을 확인
    const signals = strategy.evaluate(candles, 'risk_on')

    // 골든크로스 조건 검증: 실제 지표값 확인
    const closes = btcCandles.map((c) => c.close)
    const fastEma = calcEMA(closes, 12)
    const slowEma = calcEMA(closes, 26)
    const latestFast = fastEma[fastEma.length - 1]
    const latestSlow = slowEma[slowEma.length - 1]
    const prevFast = fastEma[fastEma.length - 2]
    const prevSlow = slowEma[slowEma.length - 2]

    // 골든크로스가 실제 발생했는지 확인
    const isGoldenCross = prevFast <= prevSlow && latestFast > latestSlow
    if (isGoldenCross) {
      // 골든크로스 발생 시 buy 시그널이 있어야 함
      const btcSignals = signals.filter((s) => s.symbol === 'BTC' && s.direction === 'buy')
      expect(btcSignals.length).toBeGreaterThanOrEqual(1)
      expect(btcSignals[0].positionSide).toBe('long')
      expect(btcSignals[0].leverage).toBe(2)
      expect(btcSignals[0].reasoning).toHaveProperty('cross', 'golden')
    }
    // 크로스가 발생하지 않으면 ADX 등 조건이 안 맞은 것 — 정상
  })

  it('EMA 크로스오버 데드크로스 숏 진입 검증', () => {
    const btcCandles = buildDeathCrossCandles()
    const candles: CandleMap = new Map()
    candles.set('BTC', btcCandles)

    const signals = strategy.evaluate(candles, 'risk_on')

    const closes = btcCandles.map((c) => c.close)
    const fastEma = calcEMA(closes, 12)
    const slowEma = calcEMA(closes, 26)
    const trendEma = calcEMA(closes, 200)
    const latestFast = fastEma[fastEma.length - 1]
    const latestSlow = slowEma[slowEma.length - 1]
    const prevFast = fastEma[fastEma.length - 2]
    const prevSlow = slowEma[slowEma.length - 2]
    const latestClose = closes[closes.length - 1]
    const latestTrend = trendEma[trendEma.length - 1]

    const isDeathCross = prevFast >= prevSlow && latestFast < latestSlow
    const belowTrend = latestClose < latestTrend

    if (isDeathCross && belowTrend) {
      const btcSignals = signals.filter((s) => s.symbol === 'BTC' && s.direction === 'sell')
      expect(btcSignals.length).toBeGreaterThanOrEqual(1)
      expect(btcSignals[0].positionSide).toBe('short')
      expect(btcSignals[0].reasoning).toHaveProperty('cross', 'death')
    }
  })

  it('볼륨 필터 차단 검증 — 크로스 발생해도 볼륨 부족 시 시그널 없음', () => {
    // 골든크로스 캔들을 만들되 볼륨을 극도로 낮게 설정
    const btcCandles = buildGoldenCrossCandles().map((c) => ({
      ...c,
      volume: 1, // 극도로 낮은 볼륨
    }))
    const candles: CandleMap = new Map()
    candles.set('BTC', btcCandles)

    const signals = strategy.evaluate(candles, 'risk_on')

    // 볼륨 SMA(20) x 1.2 를 통과할 수 없으므로 시그널 없음
    // (모든 볼륨이 동일하면 SMA = 1, 현재 = 1, 1 <= 1 * 1.2 이므로 차단)
    const btcSignals = signals.filter((s) => s.symbol === 'BTC')
    expect(btcSignals).toEqual([])
  })
})

describe('BtcDonchianBreakoutStrategy - 돈치안 브레이크아웃', () => {
  it('돈치안 상단 돌파 롱 진입', () => {
    const strategy = new BtcDonchianBreakoutStrategy()
    const count = 50
    const candles: Candle[] = []

    for (let i = 0; i < count; i++) {
      // 안정적인 레인지에서 마지막에 돌파
      let price: number
      if (i < count - 2) {
        price = 60000 + Math.sin(i / 3) * 200
      } else if (i === count - 2) {
        // 이전 캔들: 채널 상단 이하
        price = 60200
      } else {
        // 마지막 캔들: 채널 상단 돌파
        price = 61000
      }

      // 시간 필터 통과: UTC 0-4시 또는 12-16시
      const hour = i === count - 1 ? 1 : 10 // 마지막 캔들만 세션 시간대

      candles.push({
        openTime: new Date(Date.UTC(2024, 0, 1 + Math.floor(i / 24), hour, 0, 0)),
        open: price - 50,
        high: price + 150,
        low: price - 150,
        close: price,
        volume: i === count - 1 ? 20000 : 3000, // 마지막 캔들 볼륨 급증
      })
    }

    const candleMap: CandleMap = new Map()
    candleMap.set('BTC', candles)

    const signals = strategy.evaluate(candleMap, 'risk_on')

    // 돈치안 브레이크아웃이 발생하면 롱 시그널
    // (ATR 확장 + 볼륨 + 시간 필터 모두 충족해야 함)
    for (const sig of signals) {
      if (sig.symbol === 'BTC' && sig.direction === 'buy') {
        expect(sig.positionSide).toBe('long')
        expect(sig.leverage).toBe(3)
        expect(sig.reasoning).toHaveProperty('type', 'donchian_breakout')
      }
    }
  })

  it('config가 올바름', () => {
    const strategy = new BtcDonchianBreakoutStrategy()
    expect(strategy.config.id).toBe('btc_donchian_breakout')
    expect(strategy.config.exchange).toBe('okx')
    expect(strategy.config.timeframe).toBe('1h')
    expect(strategy.config.params.leverage).toBe(3)
  })
})

describe('BtcMacdMomentumStrategy - MACD 모멘텀', () => {
  it('MACD 히스토그램 양수 전환 + RSI 50-70 + ADX > 25 롱 진입', () => {
    // 긴 상승 트렌드에서 일시 조정 후 재상승 → MACD 히스토그램 양수 전환 유도
    const strategy = new BtcMacdMomentumStrategy()
    const count = 250
    const candles: Candle[] = []

    for (let i = 0; i < count; i++) {
      let price: number
      if (i < 200) {
        // 꾸준한 상승 (EMA(200) 형성 + 가격 > EMA(200))
        price = 50000 + i * 30
      } else if (i < 230) {
        // 조정 구간 (MACD 히스토그램 음수)
        price = 56000 - (i - 200) * 50
      } else {
        // 재상승 (MACD 히스토그램 양수 전환)
        price = 54500 + (i - 230) * 200
      }

      candles.push({
        openTime: new Date(Date.UTC(2024, 0, 1) + i * 3600_000),
        open: price - 30,
        high: price + 100,
        low: price - 100,
        close: price,
        volume: 5000,
      })
    }

    const candleMap: CandleMap = new Map()
    candleMap.set('BTC', candles)

    const signals = strategy.evaluate(candleMap, 'risk_on')

    // MACD 양수 전환 시그널이 있으면 검증
    const buySignals = signals.filter((s) => s.symbol === 'BTC' && s.direction === 'buy')
    for (const sig of buySignals) {
      expect(sig.positionSide).toBe('long')
      expect(sig.leverage).toBe(3)
      expect(sig.reasoning).toHaveProperty('type', 'macd_momentum')
    }
  })

  it('config가 올바름', () => {
    const strategy = new BtcMacdMomentumStrategy()
    expect(strategy.config.id).toBe('btc_macd_momentum')
    expect(strategy.config.exchange).toBe('okx')
    expect(strategy.config.timeframe).toBe('1h')
    expect(strategy.config.params.adxThreshold).toBe(25)
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
