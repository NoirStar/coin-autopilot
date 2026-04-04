import { create } from 'zustand'
import type { ResearchSummary, ResearchRun } from '@/types/orchestration'
import type { OperatorHomeResponse } from '@/services/api'

interface ResearchState {
  summary: ResearchSummary
  isLoading: boolean

  setSummary: (summary: ResearchSummary) => void
  updateFromOperatorHome: (data: OperatorHomeResponse) => void
  setLoading: (loading: boolean) => void
}

const emptySummary: ResearchSummary = {
  running: 0,
  queued: 0,
  completed: 0,
  topCandidates: [],
}

export const useResearchStore = create<ResearchState>((set) => ({
  summary: emptySummary,
  isLoading: true,

  setSummary: (summary) => set({ summary }),

  updateFromOperatorHome: (data) => {
    const topCandidates: ResearchRun[] = data.research.topCandidates.map((c) => ({
      id: c.id,
      strategy: c.strategyName,
      asset: '', // 서버에서 추가 정보 필요
      status: c.status as ResearchRun['status'],
      winRate: c.metrics?.win_rate as number ?? null,
      totalReturn: c.metrics?.total_return as number ?? null,
      maxDrawdown: c.metrics?.max_drawdown as number ?? null,
      sharpeRatio: c.metrics?.sharpe as number ?? null,
      completedAt: c.completedAt,
      startedAt: c.startedAt,
    }))

    set({
      summary: {
        running: data.research.running,
        queued: data.research.queued,
        completed: data.research.completed,
        topCandidates,
      },
      isLoading: false,
    })
  },

  setLoading: (loading) => set({ isLoading: loading }),
}))
