import { create } from 'zustand'
import type { ResearchSummary } from '@/types/orchestration'
import { mockResearchSummary } from '@/mocks/dashboard-data'

interface ResearchState {
  summary: ResearchSummary
  isLoading: boolean

  setSummary: (summary: ResearchSummary) => void
  setLoading: (loading: boolean) => void
}

export const useResearchStore = create<ResearchState>((set) => ({
  summary: mockResearchSummary,
  isLoading: false,

  setSummary: (summary) => set({ summary }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
