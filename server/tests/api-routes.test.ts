import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase mock
const mockFrom = vi.fn()
vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

// 오케스트레이터/리스크 mock
vi.mock('../src/orchestrator/orchestrator.js', () => ({
  getSlotStatus: vi.fn(() => Promise.resolve([
    { slotId: 'slot-1', assetKey: 'BTC-USDT', slotType: 'primary', strategyId: 'btc_ema', allocationPct: 50, regime: 'risk_on', status: 'active', cooldownUntil: null },
  ])),
  calculateEdgeScore: vi.fn(() => Promise.resolve(72)),
}))

vi.mock('../src/risk/risk-manager.js', () => ({
  getCircuitBreakerStatus: vi.fn(() => Promise.resolve({ triggered: false, currentLossPct: -0.5, limitPct: -5 })),
}))

// auth mock (POST용)
vi.mock('../src/core/auth.js', () => ({
  authMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}))

// AI mock (SDK 로드 방지)
vi.mock('../src/research/ai-reviewer.js', () => ({
  executeReview: vi.fn(() => Promise.resolve({ reviewId: '', status: 'skipped' })),
}))
vi.mock('../src/services/ai-client.js', () => ({
  isAiEnabled: vi.fn(() => false),
  getAiProvider: vi.fn(() => null),
}))

/** Supabase 체인 빌더 헬퍼 */
function chainBuilder(data: unknown = [], count: number | null = null) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'gte', 'lte', 'in', 'is', 'order', 'limit', 'single', 'update', 'insert']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  // terminal: Promise resolve
  chain.then = (resolve: (v: unknown) => void) => resolve({ data, error: null, count })
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  // 기본 Supabase from mock: 빈 데이터 반환
  mockFrom.mockImplementation(() => chainBuilder())
})

// dynamic import로 캐시 초기화 문제 회피
async function getApp() {
  // 캐시 초기화를 위해 매번 fresh import
  vi.resetModules()

  // re-mock after resetModules
  vi.doMock('../src/services/database.js', () => ({
    supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  }))
  vi.doMock('../src/orchestrator/orchestrator.js', () => ({
    getSlotStatus: vi.fn(() => Promise.resolve([])),
    calculateEdgeScore: vi.fn(() => Promise.resolve(null)),
  }))
  vi.doMock('../src/risk/risk-manager.js', () => ({
    getCircuitBreakerStatus: vi.fn(() => Promise.resolve({ triggered: false, currentLossPct: 0, limitPct: -5 })),
  }))
  vi.doMock('../src/core/auth.js', () => ({
    authMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
  }))
  vi.doMock('../src/data/market-summary.js', () => ({
    getMarketSummary: vi.fn(() => Promise.resolve({
      volatility: 'medium', fundingRate: 0.01, openInterest: 28000000000,
      longShortRatio: 1.1, kimchiPremium: 1.5, updatedAt: new Date().toISOString(),
    })),
  }))
  vi.doMock('../src/research/ai-reviewer.js', () => ({
    executeReview: vi.fn(() => Promise.resolve({ reviewId: '', status: 'skipped', summary: null, analysis: null, modelId: null, inputTokens: 0, outputTokens: 0, latencyMs: 0 })),
  }))
  vi.doMock('../src/services/ai-client.js', () => ({
    isAiEnabled: vi.fn(() => false),
    getAiProvider: vi.fn(() => null),
  }))

  const { default: apiRoutes } = await import('../src/routes/api.js')
  const { Hono } = await import('hono')
  const app = new Hono()
  app.route('/api/dash', apiRoutes)
  return app
}

describe('GET /api/dash/operator/home', () => {
  it('200 응답과 필수 필드를 반환한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/operator/home')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('system')
    expect(body).toHaveProperty('hero')
    expect(body).toHaveProperty('slots')
    expect(body).toHaveProperty('queue')
    expect(body).toHaveProperty('positions')
    expect(body).toHaveProperty('market')
    expect(body).toHaveProperty('decisions')
    expect(body).toHaveProperty('research')
  })

  it('hero에 riskLevel이 있다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/operator/home')
    const body = await res.json()

    expect(body.hero.riskLevel).toBeDefined()
    expect(['normal', 'caution', 'warning', 'critical']).toContain(body.hero.riskLevel)
  })

  it('빈 DB에서도 정상 응답한다', async () => {
    mockFrom.mockImplementation(() => chainBuilder(null))

    const app = await getApp()
    const res = await app.request('/api/dash/operator/home')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hero.live.totalEquity).toBe(0)
    expect(body.hero.paper.totalEquity).toBe(0)
    expect(body.decisions).toEqual([])
  })
})

describe('GET /api/dash/slots', () => {
  it('슬롯 목록을 반환한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/slots')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('data')
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('GET /api/dash/decisions', () => {
  it('판단 로그를 반환한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/decisions')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('data')
  })

  it('limit 파라미터를 지원한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/decisions?limit=5')

    expect(res.status).toBe(200)
  })
})

describe('GET /api/dash/positions', () => {
  it('포지션 목록을 paper/live로 분리 반환한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/positions')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('paper')
    expect(body).toHaveProperty('live')
  })
})

describe('GET /api/dash/risk/status', () => {
  it('리스크 상태를 반환한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/risk/status')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('circuitBreaker')
  })
})

describe('GET /api/dash/research/runs', () => {
  it('연구 실행 이력을 반환한다', async () => {
    const app = await getApp()
    const res = await app.request('/api/dash/research/runs')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('data')
  })
})
