import { describe, it, expect, vi } from 'vitest'
import type { Candle, CandleMap } from '../src/core/types.js'

// Supabase mock
vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  },
}))

import { generateGrid, getExplorerStrategyIds } from '../src/research/param-explorer.js'
import {
  createISOOSPlan,
  createWalkForwardPlan,
  calculateExpectedValue,
} from '../src/research/validation-engine.js'

/** 테스트용 캔들 생성 */
function generateCandles(count: number, basePrice: number, trend: number = 0, volatility: number = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const price = basePrice + trend * i + (Math.sin(i / 3) * volatility)
    return {
      openTime: new Date(Date.now() - (count - i) * 3600000),
      open: price - volatility * 0.3,
      high: price + volatility,
      low: price - volatility,
      close: price,
      volume: 1000 + Math.random() * 500,
    }
  })
}

// ─── param-explorer 테스트 ────────────────────────────────────

describe('param-explorer', () => {
  it('6개 전략 모두 스펙이 등록되어 있다', () => {
    const ids = getExplorerStrategyIds()
    expect(ids).toContain('btc_ema_crossover')
    expect(ids).toContain('btc_macd_momentum')
    expect(ids).toContain('btc_bollinger_reversion')
    expect(ids).toContain('btc_donchian_breakout')
    expect(ids).toContain('alt_mean_reversion')
    expect(ids).toContain('alt_detection')
    expect(ids.length).toBe(6)
  })

  it('btc_ema_crossover 그리드에서 fastEma < slowEma 제약이 적용된다', () => {
    const grid = generateGrid('btc_ema_crossover')
    expect(grid.length).toBeGreaterThan(0)
    expect(grid.length).toBeLessThanOrEqual(100)

    for (const params of grid) {
      expect(params.fastEma).toBeLessThan(params.slowEma)
    }
  })

  it('alt_detection 그리드에서 takeProfitPct1 < takeProfitPct2 제약이 적용된다', () => {
    const grid = generateGrid('alt_detection')
    for (const params of grid) {
      expect(params.takeProfitPct1).toBeLessThan(params.takeProfitPct2)
    }
  })

  it('알 수 없는 전략은 빈 배열을 반환한다', () => {
    const grid = generateGrid('nonexistent')
    expect(grid).toEqual([])
  })

  it('btc_macd_momentum 그리드에서 macdFast < macdSlow 제약이 적용된다', () => {
    const grid = generateGrid('btc_macd_momentum')
    for (const params of grid) {
      expect(params.macdFast).toBeLessThan(params.macdSlow)
    }
  })

  it('모든 전략의 그리드가 100개 이하이다', () => {
    for (const id of getExplorerStrategyIds()) {
      const grid = generateGrid(id)
      expect(grid.length).toBeLessThanOrEqual(100)
      expect(grid.length).toBeGreaterThan(0)
    }
  })
})

// ─── validation-engine 테스트 ─────────────────────────────────

describe('validation-engine', () => {
  describe('createISOOSPlan', () => {
    it('70/30 비율로 IS/OOS를 분할한다', () => {
      const plan = createISOOSPlan(1200, 200)
      expect(plan.segments).toHaveLength(2)

      const [is, oos] = plan.segments
      expect(is.name).toBe('IS')
      expect(is.role).toBe('in_sample')
      expect(is.startIndex).toBe(200)

      expect(oos.name).toBe('OOS')
      expect(oos.role).toBe('out_of_sample')
      expect(oos.endIndex).toBe(1200)

      // IS 길이는 전체 평가 구간의 약 70%
      const evalLength = 1200 - 200
      const isLength = is.endIndex - is.startIndex
      expect(isLength).toBe(Math.floor(evalLength * 0.7))
    })
  })

  describe('createWalkForwardPlan', () => {
    it('3-fold로 WF OOS 구간을 생성한다', () => {
      const plan = createWalkForwardPlan(1200, 3, 200)
      const oosSegments = plan.segments.filter((s) => s.role === 'walk_forward')

      expect(oosSegments.length).toBe(3)

      // OOS 구간이 전체 평가 구간을 커버하는지
      expect(oosSegments[0].startIndex).toBe(200)
      expect(oosSegments[oosSegments.length - 1].endIndex).toBe(1200)
    })
  })

  describe('calculateExpectedValue', () => {
    it('거래가 없으면 EV = 0', () => {
      const result = {
        strategyId: 'test',
        params: {},
        timeframe: '1h' as const,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalReturn: 0,
        cagr: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        totalTrades: 0,
        avgHoldHours: 0,
        trades: [],
        equityCurve: [],
      }
      expect(calculateExpectedValue(result)).toBe(0)
    })

    it('수익 거래만 있으면 EV > 0', () => {
      const result = {
        strategyId: 'test',
        params: {},
        timeframe: '1h' as const,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalReturn: 10,
        cagr: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 100,
        totalTrades: 3,
        avgHoldHours: 0,
        trades: [
          { symbol: 'BTC-USDT', direction: 'buy' as const, entryPrice: 100, exitPrice: 105, entryTime: new Date(), exitTime: new Date(), pnlPct: 5, reason: 'tp', feePct: 0.1 },
          { symbol: 'BTC-USDT', direction: 'buy' as const, entryPrice: 100, exitPrice: 103, entryTime: new Date(), exitTime: new Date(), pnlPct: 3, reason: 'tp', feePct: 0.1 },
          { symbol: 'BTC-USDT', direction: 'buy' as const, entryPrice: 100, exitPrice: 102, entryTime: new Date(), exitTime: new Date(), pnlPct: 2, reason: 'tp', feePct: 0.1 },
        ],
        equityCurve: [],
      }
      expect(calculateExpectedValue(result)).toBeGreaterThan(0)
    })

    it('손실 거래만 있으면 EV < 0', () => {
      const result = {
        strategyId: 'test',
        params: {},
        timeframe: '1h' as const,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalReturn: -10,
        cagr: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        totalTrades: 2,
        avgHoldHours: 0,
        trades: [
          { symbol: 'BTC-USDT', direction: 'buy' as const, entryPrice: 100, exitPrice: 95, entryTime: new Date(), exitTime: new Date(), pnlPct: -5, reason: 'sl', feePct: 0.1 },
          { symbol: 'BTC-USDT', direction: 'buy' as const, entryPrice: 100, exitPrice: 97, entryTime: new Date(), exitTime: new Date(), pnlPct: -3, reason: 'sl', feePct: 0.1 },
        ],
        equityCurve: [],
      }
      expect(calculateExpectedValue(result)).toBeLessThan(0)
    })

    it('feePct가 EV에 반영된다', () => {
      const makeResult = (feePct: number) => ({
        strategyId: 'test',
        params: {},
        timeframe: '1h' as const,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalReturn: 5,
        cagr: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 100,
        totalTrades: 1,
        avgHoldHours: 0,
        trades: [
          { symbol: 'BTC-USDT', direction: 'buy' as const, entryPrice: 100, exitPrice: 105, entryTime: new Date(), exitTime: new Date(), pnlPct: 5, reason: 'tp', feePct },
        ],
        equityCurve: [],
      })

      const evLowFee = calculateExpectedValue(makeResult(0.1))
      const evHighFee = calculateExpectedValue(makeResult(2.0))

      // 높은 수수료 → 낮은 EV
      expect(evLowFee).toBeGreaterThan(evHighFee)
    })
  })
})
