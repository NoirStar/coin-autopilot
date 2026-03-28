import { create } from 'zustand'
import type { PaperSession } from '@/types/trading'

interface PaperTradingState {
  sessions: PaperSession[]
  setSessions: (sessions: PaperSession[]) => void
  addSession: (session: PaperSession) => void
  updateSession: (id: string, update: Partial<PaperSession>) => void
}

export const usePaperTradingStore = create<PaperTradingState>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, session],
  })),
  updateSession: (id, update) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === id ? { ...s, ...update } : s
    ),
  })),
}))
