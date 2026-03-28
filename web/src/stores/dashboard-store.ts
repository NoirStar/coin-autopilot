import { create } from 'zustand'
import type { AgentStatus, EquitySnapshot, Position, RegimeInfo } from '@/types/trading'

interface DashboardState {
  agentStatus: AgentStatus | null
  regime: RegimeInfo | null
  equity: EquitySnapshot | null
  positions: Position[]
  btcPrice: number
  isConnected: boolean

  setAgentStatus: (status: AgentStatus) => void
  setRegime: (regime: RegimeInfo) => void
  setEquity: (equity: EquitySnapshot) => void
  setPositions: (positions: Position[]) => void
  setBtcPrice: (price: number) => void
  setConnected: (connected: boolean) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  agentStatus: null,
  regime: null,
  equity: null,
  positions: [],
  btcPrice: 0,
  isConnected: false,

  setAgentStatus: (status) => set({ agentStatus: status }),
  setRegime: (regime) => set({ regime }),
  setEquity: (equity) => set({ equity }),
  setPositions: (positions) => set({ positions }),
  setBtcPrice: (price) => set({ btcPrice: price }),
  setConnected: (connected) => set({ isConnected: connected }),
}))
