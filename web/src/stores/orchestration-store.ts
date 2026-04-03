import { create } from 'zustand'
import type {
  SystemStatus,
  HeroSummary,
  AssetSlot,
  Decision,
} from '@/types/orchestration'
import {
  mockSystemStatus,
  mockHeroSummary,
  mockAssetSlots,
  mockDecisions,
} from '@/mocks/dashboard-data'

interface OrchestrationState {
  // 상태
  systemStatus: SystemStatus
  heroSummary: HeroSummary
  assetSlots: AssetSlot[]
  decisions: Decision[]
  isLoading: boolean

  // 액션
  setSystemStatus: (status: SystemStatus) => void
  setHeroSummary: (summary: HeroSummary) => void
  setAssetSlots: (slots: AssetSlot[]) => void
  addDecision: (decision: Decision) => void
  setLoading: (loading: boolean) => void
}

export const useOrchestrationStore = create<OrchestrationState>((set) => ({
  // 초기값: mock 데이터 (API 연결 전까지)
  systemStatus: mockSystemStatus,
  heroSummary: mockHeroSummary,
  assetSlots: mockAssetSlots,
  decisions: mockDecisions,
  isLoading: false,

  setSystemStatus: (status) => set({ systemStatus: status }),
  setHeroSummary: (summary) => set({ heroSummary: summary }),
  setAssetSlots: (slots) => set({ assetSlots: slots }),
  addDecision: (decision) =>
    set((state) => ({
      decisions: [decision, ...state.decisions].slice(0, 50),
    })),
  setLoading: (loading) => set({ isLoading: loading }),
}))
