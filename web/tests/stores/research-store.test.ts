import { describe, it, expect, beforeEach } from 'vitest'
import { useResearchStore } from '@/stores/research-store'
import type { OperatorHomeResponse } from '@/services/api'

const makeResponse = (research?: Partial<OperatorHomeResponse['research']>): OperatorHomeResponse => ({
  system: { server: 'connected', database: 'connected', lastCollectedAt: '' },
  hero: { totalEquity: 0, todayPnl: { realized: 0, unrealized: 0, total: 0 }, liveCount: 0, paperCount: 0, pendingApprovals: 0, riskLevel: 'normal', edgeScore: null },
  slots: [],
  regime: null,
  queue: { pendingDecisions: [], unresolvedRisks: [] },
  positions: { live: [], paper: [] },
  market: { regime: null, btcPrice: null, rsi14: null, atrPct: null, volatility: 'low', fundingRate: 0, openInterest: 0, longShortRatio: 0, kimchiPremium: 0, updatedAt: null },
  decisions: [],
  research: {
    running: 2,
    queued: 3,
    completed: 15,
    topCandidates: [
      {
        id: 'run-1',
        strategyName: 'BTC EMA Crossover',
        status: 'completed',
        startedAt: '2026-04-04T08:00:00Z',
        completedAt: '2026-04-04T09:00:00Z',
        metrics: { win_rate: 65, total_return: 12.5, max_drawdown: -5.2, sharpe: 1.3 },
      },
    ],
    ...research,
  },
  circuitBreaker: { triggered: false, dailyLossPct: 0 },
})

describe('research-store', () => {
  beforeEach(() => {
    useResearchStore.setState({
      summary: { running: 0, queued: 0, completed: 0, topCandidates: [] },
      isLoading: true,
    })
  })

  it('updateFromOperatorHome이 연구 요약을 올바르게 매핑한다', () => {
    const data = makeResponse()

    useResearchStore.getState().updateFromOperatorHome(data)

    const summary = useResearchStore.getState().summary
    expect(summary.running).toBe(2)
    expect(summary.queued).toBe(3)
    expect(summary.completed).toBe(15)
    expect(summary.topCandidates).toHaveLength(1)
    expect(summary.topCandidates[0].strategy).toBe('BTC EMA Crossover')
    expect(summary.topCandidates[0].winRate).toBe(65)
  })

  it('빈 topCandidates도 정상 처리된다', () => {
    const data = makeResponse({ topCandidates: [] })

    useResearchStore.getState().updateFromOperatorHome(data)

    expect(useResearchStore.getState().summary.topCandidates).toHaveLength(0)
    expect(useResearchStore.getState().isLoading).toBe(false)
  })

  it('metrics가 null인 후보도 정상 매핑된다', () => {
    const data = makeResponse({
      topCandidates: [
        { id: 'run-2', strategyName: 'Test', status: 'completed', startedAt: '', completedAt: null, metrics: null },
      ],
    })

    useResearchStore.getState().updateFromOperatorHome(data)

    const candidate = useResearchStore.getState().summary.topCandidates[0]
    expect(candidate.winRate).toBeNull()
    expect(candidate.sharpeRatio).toBeNull()
  })
})
