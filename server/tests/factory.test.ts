import { describe, it, expect, vi } from 'vitest'

// Supabase mock (전략 파일이 database.ts를 transitively import할 수 있음)
vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    rpc: vi.fn(),
  },
}))

import {
  createStrategyInstance,
  getFactoryStrategyIds,
} from '../src/strategy/factory.js'

/**
 * strategy/factory.ts 단위 테스트
 *
 * 핵심 검증 포인트:
 * 1. paramOverrides가 실제로 인스턴스에 반영된다 (폐루프의 핵심)
 * 2. 여러 번 호출해도 독립 인스턴스가 반환된다 (싱글턴 레이스 방지)
 * 3. 오버라이드 일부 키만 제공해도 나머지는 DEFAULT_PARAMS와 병합
 */
describe('strategy/factory', () => {
  describe('getFactoryStrategyIds', () => {
    it('등록된 전략 6개가 모두 반환된다', () => {
      const ids = getFactoryStrategyIds()
      expect(ids).toContain('btc_ema_crossover')
      expect(ids).toContain('btc_donchian_breakout')
      expect(ids).toContain('btc_bollinger_reversion')
      expect(ids).toContain('btc_macd_momentum')
      expect(ids).toContain('alt_mean_reversion')
      expect(ids).toContain('alt_detection')
      expect(ids.length).toBe(6)
    })
  })

  describe('createStrategyInstance', () => {
    it('알 수 없는 strategyId는 null을 반환한다', () => {
      const result = createStrategyInstance('nonexistent_strategy')
      expect(result).toBeNull()
    })

    it('paramOverrides 없이 호출하면 DEFAULT_PARAMS 인스턴스를 반환한다', () => {
      const strategy = createStrategyInstance('btc_ema_crossover')
      expect(strategy).not.toBeNull()
      expect(strategy!.config.id).toBe('btc_ema_crossover')
      // btc_ema_crossover의 DEFAULT_PARAMS
      expect(strategy!.config.params.fastEma).toBe(12)
      expect(strategy!.config.params.slowEma).toBe(26)
    })

    it('paramOverrides가 인스턴스에 반영된다 (폐루프 핵심)', () => {
      const strategy = createStrategyInstance('btc_ema_crossover', {
        fastEma: 8,
        slowEma: 34,
      })
      expect(strategy).not.toBeNull()
      expect(strategy!.config.params.fastEma).toBe(8)
      expect(strategy!.config.params.slowEma).toBe(34)
    })

    it('일부 키만 오버라이드하면 나머지는 DEFAULT와 병합된다', () => {
      const strategy = createStrategyInstance('btc_ema_crossover', {
        fastEma: 16, // slowEma는 오버라이드 안 함
      })
      expect(strategy).not.toBeNull()
      expect(strategy!.config.params.fastEma).toBe(16)
      expect(strategy!.config.params.slowEma).toBe(26) // DEFAULT 유지
      expect(strategy!.config.params.trendEma).toBe(200) // DEFAULT 유지
    })

    it('두 번 호출하면 서로 독립된 인스턴스를 반환한다 (싱글턴 아님)', () => {
      const a = createStrategyInstance('btc_ema_crossover', { fastEma: 8 })
      const b = createStrategyInstance('btc_ema_crossover', { fastEma: 16 })
      expect(a).not.toBeNull()
      expect(b).not.toBeNull()
      expect(a).not.toBe(b) // 서로 다른 객체
      expect(a!.config.params.fastEma).toBe(8)
      expect(b!.config.params.fastEma).toBe(16)
      // 한쪽을 수정해도 다른 쪽에 영향 없음
      ;(a!.config.params as Record<string, number>).fastEma = 99
      expect(b!.config.params.fastEma).toBe(16)
    })

    it('다른 전략(btc_donchian_breakout)도 오버라이드가 동작한다', () => {
      const strategy = createStrategyInstance('btc_donchian_breakout', {
        period: 30,
      })
      expect(strategy).not.toBeNull()
      expect(strategy!.config.id).toBe('btc_donchian_breakout')
      expect(strategy!.config.params.period).toBe(30)
    })
  })
})
