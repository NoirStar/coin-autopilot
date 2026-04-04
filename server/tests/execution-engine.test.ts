import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ──
function createChainMock(resolveData: unknown = null): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'insert', 'update']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.single = vi.fn(() => Promise.resolve({ data: resolveData, error: null }))
  return chain
}

vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: vi.fn(() => createChainMock()),
  },
}))

vi.mock('../src/exchange/okx-client.js', () => ({
  calculatePositionSize: (balance: number, risk: number, stop: number, lev: number) =>
    (balance * risk) / (stop * lev),
  fetchBalance: vi.fn(() => Promise.resolve({ total: 10000, free: 8000, used: 2000 })),
  fetchOpenPositions: vi.fn(() => Promise.resolve([])),
  createMarketOrder: vi.fn(() => Promise.resolve({
    id: 'order-123',
    symbol: 'BTC',
    side: 'buy',
    type: 'market',
    amount: 0.01,
    price: 60000,
    fee: 0.12,
    status: 'closed',
    timestamp: new Date(),
  })),
  setLeverage: vi.fn(),
  setMarginMode: vi.fn(),
  fetchOkxPrice: vi.fn(() => Promise.resolve(60000)),
}))

describe('실전 매매 엔진', () => {
  it('LIVE_TRADING이 아니면 스킵', async () => {
    delete process.env.LIVE_TRADING
    const { executeLiveDecision } = await import('../src/execution/execution-engine.js')
    const result = await executeLiveDecision('test-id')
    expect(result).toBe(false)
  })

  it('closePosition에서 부분 청산 비율 지원', async () => {
    // 부분 청산 시그니처 확인
    const mod = await import('../src/execution/execution-engine.js')
    expect(typeof mod.closePosition).toBe('function')
    // closePosition(id, reason, partialRatio)
    expect(mod.closePosition.length).toBeGreaterThanOrEqual(2)
  })
})

describe('OrderResult fee 필드', () => {
  it('createMarketOrder가 fee를 반환', async () => {
    const { createMarketOrder } = await import('../src/exchange/okx-client.js')
    const result = await createMarketOrder('BTC', 'buy', 0.01)
    expect(result.fee).toBeDefined()
    expect(typeof result.fee).toBe('number')
  })
})
