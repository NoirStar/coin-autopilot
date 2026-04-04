import { describe, it, expect, beforeEach } from 'vitest'
import { useApprovalStore } from '@/stores/approval-store'
import type { OperatorHomeResponse } from '@/services/api'

const makeResponse = (queue?: Partial<OperatorHomeResponse['queue']>): OperatorHomeResponse => ({
  system: { server: 'connected', database: 'connected', lastCollectedAt: '' },
  hero: { totalEquity: 0, todayPnl: { realized: 0, unrealized: 0, total: 0 }, liveCount: 0, paperCount: 0, pendingApprovals: 0, riskLevel: 'normal', edgeScore: null },
  slots: [],
  regime: null,
  queue: {
    pendingDecisions: [],
    unresolvedRisks: [],
    ...queue,
  },
  positions: { live: [], paper: [] },
  market: { regime: null, btcPrice: null, rsi14: null, atrPct: null, volatility: 'low', fundingRate: 0, openInterest: 0, longShortRatio: 0, kimchiPremium: 0, updatedAt: null },
  decisions: [],
  research: { running: 0, queued: 0, completed: 0, topCandidates: [] },
  circuitBreaker: { triggered: false, dailyLossPct: 0 },
})

describe('approval-store', () => {
  beforeEach(() => {
    useApprovalStore.setState({ queueItems: [], isLoading: true })
  })

  it('pending decisions이 approval QueueItem으로 매핑된다', () => {
    const data = makeResponse({
      pendingDecisions: [
        { id: 'd1', slotId: 'slot-1', type: 'strategy_assign', fromStrategy: null, toStrategy: 'btc_ema', regime: 'risk_on', reason: '신규 배치', createdAt: '2026-04-04T10:00:00Z' },
      ],
    })

    useApprovalStore.getState().updateFromOperatorHome(data)

    const items = useApprovalStore.getState().queueItems
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('approval')
  })

  it('unresolved risks가 risk QueueItem으로 매핑된다', () => {
    const data = makeResponse({
      unresolvedRisks: [
        { id: 'r1', eventType: 'daily_loss_limit', severity: 'high', details: { message: 'MDD 경고' }, createdAt: '2026-04-04T10:00:00Z' },
      ],
    })

    useApprovalStore.getState().updateFromOperatorHome(data)

    const items = useApprovalStore.getState().queueItems
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('risk')
    if (items[0].kind === 'risk') {
      expect(items[0].data.level).toBe('warning') // high → warning
    }
  })

  it('approveItem은 해당 approval만 제거한다', () => {
    useApprovalStore.setState({
      queueItems: [
        { kind: 'approval', data: { id: 'a1', type: 'strategy_swap', status: 'pending', title: '', description: '', asset: '', strategy: '', createdAt: '', expiresAt: '', metadata: {} } },
        { kind: 'approval', data: { id: 'a2', type: 'strategy_swap', status: 'pending', title: '', description: '', asset: '', strategy: '', createdAt: '', expiresAt: '', metadata: {} } },
      ],
    })

    useApprovalStore.getState().approveItem('a1')

    const items = useApprovalStore.getState().queueItems
    expect(items).toHaveLength(1)
    expect(items[0].kind === 'approval' && items[0].data.id).toBe('a2')
  })

  it('dismissItem은 해당 risk만 제거한다', () => {
    useApprovalStore.setState({
      queueItems: [
        { kind: 'risk', data: { id: 'r1', level: 'caution', title: '', description: '', metric: '', currentValue: 0, threshold: 0, createdAt: '' } },
        { kind: 'approval', data: { id: 'a1', type: 'strategy_swap', status: 'pending', title: '', description: '', asset: '', strategy: '', createdAt: '', expiresAt: '', metadata: {} } },
      ],
    })

    useApprovalStore.getState().dismissItem('r1')

    const items = useApprovalStore.getState().queueItems
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('approval')
  })
})
