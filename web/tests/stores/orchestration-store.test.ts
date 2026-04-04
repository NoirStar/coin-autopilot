import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOrchestrationStore } from '@/stores/orchestration-store'
import type { OperatorHomeResponse } from '@/services/api'

// api mock
vi.mock('@/services/api', () => ({
  api: {
    getOperatorHome: vi.fn(),
  },
}))

const { api } = await import('@/services/api')

const makeResponse = (overrides?: Partial<OperatorHomeResponse>): OperatorHomeResponse => ({
  system: { server: 'connected', database: 'connected', lastCollectedAt: '2026-04-04T10:00:00Z' },
  hero: {
    totalEquity: 10000,
    todayPnl: { realized: 100, unrealized: 50, total: 150 },
    liveCount: 2,
    paperCount: 1,
    pendingApprovals: 0,
    riskLevel: 'normal',
    edgeScore: 72,
  },
  slots: [
    {
      slotId: 'slot-1',
      assetKey: 'BTC-USDT',
      slotType: 'primary',
      strategyId: 'btc_ema',
      allocationPct: 50,
      regime: 'risk_on',
      status: 'active',
      cooldownUntil: null,
    },
  ],
  regime: { regime: 'risk_on', btc_price: 48000, ema200: 45000, rsi14: 55, atr_pct: 2.1, recorded_at: '2026-04-04T10:00:00Z' },
  queue: { pendingDecisions: [], unresolvedRisks: [] },
  positions: { live: [], paper: [] },
  market: { regime: 'risk_on', btcPrice: 48000, rsi14: 55, atrPct: 2.1, volatility: 'medium', fundingRate: 0.01, openInterest: 28000000000, longShortRatio: 1.1, kimchiPremium: 1.5, updatedAt: '2026-04-04T10:00:00Z' },
  decisions: [
    {
      id: 'dec-1',
      slotId: 'slot-1',
      type: 'assign',
      status: 'executed',
      fromStrategy: null,
      toStrategy: 'btc_ema',
      regime: 'risk_on',
      reason: 'regime filter passed',
      createdAt: '2026-04-04T09:00:00Z',
      executedAt: '2026-04-04T09:01:00Z',
    },
  ],
  research: { running: 1, queued: 2, completed: 10, topCandidates: [] },
  circuitBreaker: { triggered: false, dailyLossPct: -0.5 },
  ...overrides,
})

describe('orchestration-store', () => {
  beforeEach(() => {
    // store 초기화
    useOrchestrationStore.setState({
      systemStatus: {
        server: 'disconnected',
        database: 'disconnected',
        exchanges: {},
        lastCollectedAt: '',
        currentTime: '',
      },
      heroSummary: {
        edgeScore: 0,
        liveCount: 0,
        paperCount: 0,
        totalEquity: 0,
        todayPnl: 0,
        todayPnlPct: 0,
        pendingApprovals: 0,
        riskLevel: 'normal',
      },
      assetSlots: [],
      decisions: [],
      positions: [],
      isLoading: true,
      error: null,
      lastFetchedAt: null,
    })
    vi.clearAllMocks()
  })

  it('fetchOperatorHome 성공 시 모든 상태가 업데이트된다', async () => {
    const mockData = makeResponse()
    vi.mocked(api.getOperatorHome).mockResolvedValue(mockData)

    const result = await useOrchestrationStore.getState().fetchOperatorHome()

    expect(result).not.toBeNull()
    const state = useOrchestrationStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.systemStatus.server).toBe('connected')
    expect(state.heroSummary.totalEquity).toBe(10000)
    expect(state.heroSummary.edgeScore).toBe(72)
    expect(state.heroSummary.todayPnl).toBe(150)
    expect(state.assetSlots).toHaveLength(1)
    expect(state.assetSlots[0].asset).toBe('BTC-USDT')
    expect(state.decisions).toHaveLength(1)
    expect(state.decisions[0].action).toBe('ENTRY') // assign → ENTRY 매핑
  })

  it('fetchOperatorHome 실패 시 error 상태가 설정된다', async () => {
    vi.mocked(api.getOperatorHome).mockRejectedValue(new Error('Network Error'))

    const result = await useOrchestrationStore.getState().fetchOperatorHome()

    expect(result).toBeNull()
    const state = useOrchestrationStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBe('Network Error')
  })

  it('edgeScore null이면 0으로 매핑된다', async () => {
    const mockData = makeResponse({ hero: { ...makeResponse().hero, edgeScore: null } })
    vi.mocked(api.getOperatorHome).mockResolvedValue(mockData)

    await useOrchestrationStore.getState().fetchOperatorHome()

    expect(useOrchestrationStore.getState().heroSummary.edgeScore).toBe(0)
  })

  it('빈 slots 응답은 빈 배열로 매핑된다', async () => {
    const mockData = makeResponse({ slots: [] })
    vi.mocked(api.getOperatorHome).mockResolvedValue(mockData)

    await useOrchestrationStore.getState().fetchOperatorHome()

    expect(useOrchestrationStore.getState().assetSlots).toHaveLength(0)
  })

  it('positions가 live+paper 합쳐진다', async () => {
    const mockData = makeResponse({
      positions: {
        live: [{ id: 'l1', asset_key: 'BTC', side: 'long', entry_price: 48000, current_qty: 0.1, unrealized_pnl: 50, entry_time: '2026-04-04T09:00:00Z' }],
        paper: [{ id: 'p1', asset_key: 'ETH', side: 'short', entry_price: 3000, current_qty: 1, unrealized_pnl: -10, entry_time: '2026-04-04T08:00:00Z' }],
      },
    })
    vi.mocked(api.getOperatorHome).mockResolvedValue(mockData)

    await useOrchestrationStore.getState().fetchOperatorHome()

    const positions = useOrchestrationStore.getState().positions
    expect(positions).toHaveLength(2)
    expect(positions[0].tradeMode).toBe('live')
    expect(positions[1].tradeMode).toBe('paper')
  })

  it('market volatility가 atrPct 기반으로 계산된다', async () => {
    const mockData = makeResponse({ market: { regime: 'risk_on', btcPrice: 48000, rsi14: 55, atrPct: 4.0, volatility: 'high', fundingRate: 0, openInterest: 0, longShortRatio: 0, kimchiPremium: 0, updatedAt: '' } })
    vi.mocked(api.getOperatorHome).mockResolvedValue(mockData)

    await useOrchestrationStore.getState().fetchOperatorHome()

    expect(useOrchestrationStore.getState().market.crypto.volatility).toBe('high')
  })

  it('decision type assign→ENTRY, switch→SWAP, retire→EXIT 매핑', async () => {
    const mockData = makeResponse({
      decisions: [
        { id: '1', slotId: 's1', type: 'assign', status: 'executed', fromStrategy: null, toStrategy: 'a', regime: 'risk_on', reason: '', createdAt: '', executedAt: null },
        { id: '2', slotId: 's1', type: 'switch', status: 'executed', fromStrategy: 'a', toStrategy: 'b', regime: 'risk_on', reason: '', createdAt: '', executedAt: null },
        { id: '3', slotId: 's1', type: 'retire', status: 'executed', fromStrategy: 'a', toStrategy: null, regime: 'risk_off', reason: '', createdAt: '', executedAt: null },
      ],
    })
    vi.mocked(api.getOperatorHome).mockResolvedValue(mockData)

    await useOrchestrationStore.getState().fetchOperatorHome()

    const actions = useOrchestrationStore.getState().decisions.map((d) => d.action)
    expect(actions).toEqual(['ENTRY', 'SWAP', 'EXIT'])
  })

  it('addDecision은 최대 50개까지만 유지한다', () => {
    const store = useOrchestrationStore.getState()

    for (let i = 0; i < 60; i++) {
      store.addDecision({
        id: `dec-${i}`,
        timestamp: '',
        asset: 'BTC',
        strategy: 'test',
        action: 'HOLD',
        confidence: 0,
        factors: {},
        rationale: '',
      })
    }

    expect(useOrchestrationStore.getState().decisions).toHaveLength(50)
  })
})
