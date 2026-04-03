import { create } from 'zustand'
import type { QueueItem } from '@/types/orchestration'
import { mockQueueItems } from '@/mocks/dashboard-data'

interface ApprovalState {
  queueItems: QueueItem[]
  isLoading: boolean

  setQueueItems: (items: QueueItem[]) => void
  approveItem: (id: string) => void
  rejectItem: (id: string) => void
  dismissItem: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  queueItems: mockQueueItems,
  isLoading: false,

  setQueueItems: (items) => set({ queueItems: items }),

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
