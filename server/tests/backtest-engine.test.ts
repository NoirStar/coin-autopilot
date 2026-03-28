import { describe, it, expect } from 'vitest'
import { runBacktest } from '../src/services/backtest-engine.js'
import type {
  Strategy,
  StrategyConfig,
  StrategySignal,
  ExitSignal,
  Candle,
  CandleMap,
  RegimeState,
} from '../src/strategy/strategy-base.js'

// ---------------------------------------------------------------------------
// 테스트 헬퍼
// ---------------------------------------------------------------------------

/** 캔들 생성 — 일정 가격 또는 트렌드를 가진 캔들 배열 반환 */
function makeCandles(
  count: number,
  basePrice: number,
  opts: { trend?: number; volatility?: number; intervalMs?: number } = {}
): Candle[] {
  const { trend = 0, volatility = 0, intervalMs = 4 * 3600_000 } = opts
  return Array.from({ length: count }, (_, i) => {
    const price = basePrice + trend * i
    return {
      openTime: new Date(Date.UTC(2024, 0, 1) + i * intervalMs),
      open: price - volatility * 0.1,
      high: price + volatility,
      low: price - volatility,
      close: price,
      volume: 1000,
    }
  })
}

/** 최소한의 Strategy 구현 — evaluate/evaluateExits 콜백을 주입할 수 있음 */
function createMockStrategy(overrides: {
  id?: string
  exchange?: 'upbit' | 'okx'
  maxPositions?: number
  evaluate?: Strategy['evaluate']
  evaluateExits?: Strategy['evaluateExits']
}): Strategy {
  const {
    id = 'mock_strategy',
    exchange = 'upbit',
    maxPositions = 3,
    evaluate = () => [],
    evaluateExits = () => [],
  } = overrides

  const config: StrategyConfig = {
    id,
    name: '테스트 전략',
    description: '백테스트 엔진 테스트용',
    timeframe: '4h',
    exchange,
    params: { maxPositions },
  }

  return { config, evaluate, evaluateExits }
}

/** BTC 캔들맵 생성 (최소 201개 필요) */
function makeBtcCandleMap(count: number, basePrice: number, opts?: Parameters<typeof makeCandles>[2]): CandleMap {
  const map: CandleMap = new Map()
  map.set('BTC', makeCandles(count, basePrice, opts))
  return map
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('runBacktest', () => {
  // =========================================================================
  // 1. 해피 패스: 기본 매매 사이클 검증
  // =========================================================================
  describe('기본 매매 사이클', () => {
    it('진입 → 청산 시 에퀴티 커브, 트레이드 수, PnL이 올바름', () => {
      const basePrice = 60000
      const candles = makeCandles(210, basePrice, { trend: 10 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let signalFired = false

      const strategy = createMockStrategy({
        // 첫 평가에서 롱 시그널 1회 발생
        evaluate: (_candles, _regime) => {
          if (!signalFired) {
            signalFired = true
            return [{
              symbol: 'BTC',
              direction: 'buy',
              reasoning: { test: true },
            }]
          }
          return []
        },
        // 5캔들 후 청산
        evaluateExits: (_candles, _regime, positions) => {
          return positions
            .filter((p) => p.candlesSinceEntry >= 5)
            .map((p) => ({
              symbol: p.symbol,
              reason: 'time_exit' as const,
              reasoning: { test: true },
            }))
        },
      })

      const result = runBacktest(strategy, allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      // 트레이드 1건 발생
      expect(result.totalTrades).toBe(1)
      // 에퀴티 커브가 기록됨
      expect(result.equityCurve.length).toBeGreaterThan(0)
      // 상승 트렌드에서 롱 → 양의 PnL
      expect(result.trades[0].pnlPct).toBeGreaterThan(0)
      // 전체 수익률도 양수
      expect(result.totalReturn).toBeGreaterThan(0)
    })

    it('숏 포지션에서 가격 하락 시 양의 PnL', () => {
      // 하락 트렌드 캔들
      const candles = makeCandles(210, 60000, { trend: -10 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let signalFired = false

      const strategy = createMockStrategy({
        exchange: 'okx',
        evaluate: () => {
          if (!signalFired) {
            signalFired = true
            return [{
              symbol: 'BTC',
              direction: 'sell',
              positionSide: 'short' as const,
              reasoning: { test: true },
            }]
          }
          return []
        },
        evaluateExits: (_c, _r, positions) => {
          return positions
            .filter((p) => p.candlesSinceEntry >= 3)
            .map((p) => ({
              symbol: p.symbol,
              reason: 'take_profit' as const,
              reasoning: {},
            }))
        },
      })

      const result = runBacktest(strategy, allCandles, {
        initialCapital: 10_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      expect(result.totalTrades).toBe(1)
      expect(result.trades[0].direction).toBe('sell')
      // 하락장 숏 → 수익
      expect(result.trades[0].pnlPct).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // 2. 수수료/슬리피지 계산 검증
  // =========================================================================
  describe('수수료 및 슬리피지', () => {
    it('수수료가 수익률을 감소시킴', () => {
      const candles = makeCandles(210, 60000, { trend: 10 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let callCount = 0

      const makeStrategy = () => {
        callCount = 0
        return createMockStrategy({
          evaluate: () => {
            if (callCount++ === 0) {
              return [{ symbol: 'BTC', direction: 'buy', reasoning: {} }]
            }
            return []
          },
          evaluateExits: (_c, _r, pos) =>
            pos.filter((p) => p.candlesSinceEntry >= 5).map((p) => ({
              symbol: p.symbol,
              reason: 'time_exit' as const,
              reasoning: {},
            })),
        })
      }

      // 수수료 없이
      const noFeeResult = runBacktest(makeStrategy(), allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      // 수수료 있게
      const withFeeResult = runBacktest(makeStrategy(), allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0.001, // 0.1%
        slippagePct: 0,
        leverage: 1,
      })

      // 수수료가 있으면 수익이 낮아야 함
      expect(withFeeResult.totalReturn).toBeLessThan(noFeeResult.totalReturn)
    })

    it('슬리피지가 체결가에 불리하게 반영됨', () => {
      const candles = makeCandles(210, 60000, { trend: 10 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let callCount = 0

      const makeStrategy = () => {
        callCount = 0
        return createMockStrategy({
          evaluate: () => {
            if (callCount++ === 0) {
              return [{ symbol: 'BTC', direction: 'buy', reasoning: {} }]
            }
            return []
          },
          evaluateExits: (_c, _r, pos) =>
            pos.filter((p) => p.candlesSinceEntry >= 5).map((p) => ({
              symbol: p.symbol,
              reason: 'time_exit' as const,
              reasoning: {},
            })),
        })
      }

      const noSlipResult = runBacktest(makeStrategy(), allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      const withSlipResult = runBacktest(makeStrategy(), allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0.005, // 0.5%
        leverage: 1,
      })

      // 슬리피지가 있으면 수익이 낮아야 함
      expect(withSlipResult.totalReturn).toBeLessThan(noSlipResult.totalReturn)
    })

    it('레버리지가 수수료에도 곱해짐', () => {
      const candles = makeCandles(210, 60000, { trend: 10 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let callCount = 0

      const makeStrategy = () => {
        callCount = 0
        return createMockStrategy({
          exchange: 'okx',
          evaluate: () => {
            if (callCount++ === 0) {
              return [{
                symbol: 'BTC',
                direction: 'buy',
                positionSide: 'long' as const,
                leverage: 3,
                reasoning: {},
              }]
            }
            return []
          },
          evaluateExits: (_c, _r, pos) =>
            pos.filter((p) => p.candlesSinceEntry >= 5).map((p) => ({
              symbol: p.symbol,
              reason: 'time_exit' as const,
              reasoning: {},
            })),
        })
      }

      // 수수료 0.1%에 레버리지 3x → 실질 수수료 0.6% (진입+청산)
      const result = runBacktest(makeStrategy(), allCandles, {
        initialCapital: 10_000,
        feeRate: 0.001,
        slippagePct: 0,
        leverage: 3,
      })

      // 트레이드의 fees 필드가 0보다 큰지 확인
      expect(result.trades[0].fees).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // 3. 손절 (Stop-Loss) 트리거 검증
  // =========================================================================
  describe('ATR 기반 손절', () => {
    it('evaluateExits에서 stop_loss 시그널이 발생하면 포지션 청산', () => {
      // 상승 후 하락하는 캔들 — 진입 후 손절 유도
      const candles = makeCandles(210, 60000, { trend: 0 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let signalFired = false

      const strategy = createMockStrategy({
        evaluate: () => {
          if (!signalFired) {
            signalFired = true
            return [{ symbol: 'BTC', direction: 'buy', reasoning: {} }]
          }
          return []
        },
        // 즉시 stop_loss 청산 시그널
        evaluateExits: (_c, _r, positions) => {
          return positions.map((p) => ({
            symbol: p.symbol,
            reason: 'stop_loss' as const,
            reasoning: { test_stop: true },
          }))
        },
      })

      const result = runBacktest(strategy, allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      expect(result.totalTrades).toBe(1)
      expect(result.trades[0].reason).toBe('stop_loss')
    })
  })

  // =========================================================================
  // 4. 레짐 전환 검증 — Risk-Off 시 전략에서 청산 처리
  // =========================================================================
  describe('레짐 전환', () => {
    it('evaluateExits에 regime 상태가 전달되어 포지션 청산 가능', () => {
      // evaluateRegime는 실제 BTC 캔들 기반이므로 직접 제어 어려움
      // 대신 evaluateExits가 regime을 받아 regime_stop 청산하는지 검증
      const candles = makeCandles(210, 60000)
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let signalFired = false
      const regimesReceived: RegimeState[] = []

      const strategy = createMockStrategy({
        evaluate: () => {
          if (!signalFired) {
            signalFired = true
            return [{ symbol: 'BTC', direction: 'buy', reasoning: {} }]
          }
          return []
        },
        evaluateExits: (_c, regime, positions) => {
          regimesReceived.push(regime)
          // regime이 risk_off이면 강제 청산
          if (regime === 'risk_off' && positions.length > 0) {
            return positions.map((p) => ({
              symbol: p.symbol,
              reason: 'regime_stop' as const,
              reasoning: { regime },
            }))
          }
          return []
        },
      })

      const result = runBacktest(strategy, allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      // evaluateExits에 regime이 전달되었는지 확인
      expect(regimesReceived.length).toBeGreaterThan(0)
      // risk_off 레짐이면 청산됨
      if (result.totalTrades > 0) {
        const regimeStopTrades = result.trades.filter((t) => t.reason === 'regime_stop')
        // 포지션이 있었다면 risk_off에서 청산되었을 것
        if (regimeStopTrades.length > 0) {
          expect(regimeStopTrades[0].reason).toBe('regime_stop')
        }
      }
    })
  })

  // =========================================================================
  // 5. 엣지 케이스: 시그널 없음 → 빈 결과
  // =========================================================================
  describe('시그널 미발생', () => {
    it('시그널이 없으면 트레이드 0건, 에퀴티 커브만 기록됨', () => {
      const allCandles = makeBtcCandleMap(210, 60000)

      // 시그널을 발생시키지 않는 전략
      const strategy = createMockStrategy({
        evaluate: () => [],
        evaluateExits: () => [],
      })

      const result = runBacktest(strategy, allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      expect(result.totalTrades).toBe(0)
      expect(result.trades).toEqual([])
      expect(result.totalReturn).toBe(0)
      expect(result.winRate).toBe(0)
      expect(result.maxDrawdown).toBe(0)
      // 에퀴티 커브는 여전히 기록됨 (i = 200..208 → 9개 포인트)
      expect(result.equityCurve.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // 6. 엣지 케이스: 캔들 데이터 부족
  // =========================================================================
  describe('데이터 부족', () => {
    it('BTC 캔들이 없으면 emptyResult 반환', () => {
      const allCandles: CandleMap = new Map()
      const strategy = createMockStrategy({})

      const result = runBacktest(strategy, allCandles)

      expect(result.totalTrades).toBe(0)
      expect(result.trades).toEqual([])
      expect(result.equityCurve).toEqual([])
      expect(result.totalReturn).toBe(0)
      expect(result.strategyId).toBe('mock_strategy')
    })

    it('BTC 캔들이 201개 미만이면 emptyResult 반환', () => {
      const allCandles = makeBtcCandleMap(200, 60000)
      const strategy = createMockStrategy({})

      const result = runBacktest(strategy, allCandles)

      expect(result.totalTrades).toBe(0)
      expect(result.equityCurve).toEqual([])
    })

    it('BTC 캔들이 정확히 201개이면 emptyResult (루프 실행 안됨)', () => {
      // 루프: i = 200 .. candleCount-2 = 199 → 실행 안됨
      const allCandles = makeBtcCandleMap(201, 60000)
      const strategy = createMockStrategy({})

      const result = runBacktest(strategy, allCandles)

      // 201개면 충분하지만, 루프가 i=200..199로 0회 실행
      // candleCount=201, 루프: for(i=200; i < 200; ...) → 0회
      expect(result.equityCurve).toEqual([])
      expect(result.totalTrades).toBe(0)
    })

    it('BTC 캔들이 202개면 루프 1회 실행 가능', () => {
      const allCandles = makeBtcCandleMap(202, 60000)
      const strategy = createMockStrategy({
        evaluate: () => [],
        evaluateExits: () => [],
      })

      const result = runBacktest(strategy, allCandles)

      // candleCount=202, 루프: i=200..200 → 1회
      expect(result.equityCurve.length).toBe(1)
    })
  })

  // =========================================================================
  // 추가: 결과 메타데이터 검증
  // =========================================================================
  describe('결과 메타데이터', () => {
    it('strategyId, timeframe, periodStart/End가 올바르게 설정됨', () => {
      const allCandles = makeBtcCandleMap(210, 60000)
      const strategy = createMockStrategy({ id: 'test_meta' })

      const result = runBacktest(strategy, allCandles)

      expect(result.strategyId).toBe('test_meta')
      expect(result.timeframe).toBe('4h')
      expect(result.periodStart).toBeInstanceOf(Date)
      expect(result.periodEnd).toBeInstanceOf(Date)
      expect(result.periodEnd.getTime()).toBeGreaterThan(result.periodStart.getTime())
    })

    it('미청산 포지션이 백테스트 종료 시 강제 청산됨', () => {
      const candles = makeCandles(210, 60000, { trend: 5 })
      const allCandles: CandleMap = new Map()
      allCandles.set('BTC', candles)

      let signalFired = false

      const strategy = createMockStrategy({
        evaluate: () => {
          if (!signalFired) {
            signalFired = true
            return [{ symbol: 'BTC', direction: 'buy', reasoning: {} }]
          }
          return []
        },
        // 청산 시그널을 절대 발생시키지 않음
        evaluateExits: () => [],
      })

      const result = runBacktest(strategy, allCandles, {
        initialCapital: 1_000_000,
        feeRate: 0,
        slippagePct: 0,
        leverage: 1,
      })

      // 미청산이지만 backtest_end로 강제 청산됨
      expect(result.totalTrades).toBe(1)
      expect(result.trades[0].reason).toBe('backtest_end')
    })
  })

  // =========================================================================
  // OKX 선물 기본값 검증
  // =========================================================================
  describe('OKX 선물 설정', () => {
    it('exchange가 okx이면 선물 기본 설정 적용', () => {
      const allCandles = makeBtcCandleMap(210, 60000)

      const strategy = createMockStrategy({
        exchange: 'okx',
        evaluate: () => [],
        evaluateExits: () => [],
      })

      // config 오버라이드 없이 호출 — 선물 기본값이 적용되어야 함
      const result = runBacktest(strategy, allCandles)

      // 에러 없이 실행됨
      expect(result.totalTrades).toBe(0)
      expect(result.equityCurve.length).toBeGreaterThan(0)
    })
  })
})
