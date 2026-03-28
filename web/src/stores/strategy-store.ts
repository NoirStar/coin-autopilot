import { create } from 'zustand'
import type { Strategy, RiskProfile } from '@/types/trading'

interface StrategyState {
  strategies: Strategy[]
  selectedProfile: RiskProfile

  setStrategies: (strategies: Strategy[]) => void
  setSelectedProfile: (profile: RiskProfile) => void
  toggleStrategy: (id: string) => void
}

export const useStrategyStore = create<StrategyState>((set) => ({
  strategies: [],
  selectedProfile: 'moderate',

  setStrategies: (strategies) => set({ strategies }),
  setSelectedProfile: (profile) => set({ selectedProfile: profile }),
  toggleStrategy: (id) => set((state) => ({
    strategies: state.strategies.map((s) =>
      s.id === id ? { ...s, isActive: !s.isActive } : s
    ),
  })),
}))
