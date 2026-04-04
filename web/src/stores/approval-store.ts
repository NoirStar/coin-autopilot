import { create } from 'zustand'
import type { QueueItem, Approval, RiskAlert, RiskLevel } from '@/types/orchestration'
import type { OperatorHomeResponse } from '@/services/api'

interface ApprovalState {
  queueItems: QueueItem[]
  isLoading: boolean

  setQueueItems: (items: QueueItem[]) => void
  updateFromOperatorHome: (data: OperatorHomeResponse) => void
  approveItem: (id: string) => void
  rejectItem: (id: string) => void
  dismissItem: (id: string) => void
  setLoading: (loading: boolean) => void
}

function mapSeverityToRiskLevel(severity: string): RiskLevel {
  switch (severity) {
    case 'critical': return 'critical'
    case 'high': return 'warning'
    case 'medium': return 'caution'
    default: return 'normal'
  }
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  queueItems: [],
  isLoading: true,

  setQueueItems: (items) => set({ queueItems: items }),

  updateFromOperatorHome: (data) => {
    const approvals: QueueItem[] = data.queue.pendingDecisions.map((d) => ({
      kind: 'approval' as const,
      data: {
        id: d.id,
        type: 'strategy_swap' as const,
        status: 'pending' as const,
        title: `${d.type} / ${d.slotId}`,
        description: d.reason ?? '',
        asset: d.slotId,
        strategy: d.toStrategy ?? d.fromStrategy ?? '',
        createdAt: d.createdAt,
        expiresAt: new Date(new Date(d.createdAt).getTime() + 4 * 60 * 60 * 1000).toISOString(),
        metadata: { regime: d.regime, fromStrategy: d.fromStrategy, toStrategy: d.toStrategy },
      } satisfies Approval,
    }))

    const risks: QueueItem[] = data.queue.unresolvedRisks.map((r) => ({
      kind: 'risk' as const,
      data: {
        id: r.id,
        level: mapSeverityToRiskLevel(r.severity),
        title: r.eventType,
        description: typeof r.details === 'object' && r.details !== null
          ? (r.details as Record<string, unknown>).message as string ?? r.eventType
          : r.eventType,
        metric: r.eventType,
        currentValue: 0,
        threshold: 0,
        createdAt: r.createdAt,
      } satisfies RiskAlert,
    }))

    set({ queueItems: [...approvals, ...risks], isLoading: false })
  },

  approveItem: (id) =>
    set((state) => ({
      queueItems: state.queueItems.filter((item) => {
        if (item.kind === 'approval') return item.data.id !== id
        return true
      }),
    })),

  rejectItem: (id) =>
    set((state) => ({
      queueItems: state.queueItems.filter((item) => {
        if (item.kind === 'approval') return item.data.id !== id
        return true
      }),
    })),

  dismissItem: (id) =>
    set((state) => ({
      queueItems: state.queueItems.filter((item) => {
        if (item.kind === 'risk') return item.data.id !== id
        return true
      }),
    })),

  setLoading: (loading) => set({ isLoading: loading }),
}))
