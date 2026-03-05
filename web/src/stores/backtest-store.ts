import { create } from 'zustand'
import type { BacktestResult } from '@/types/trading'

interface BacktestState {
  results: BacktestResult[]
  isRunning: boolean
  progress: number

  setResults: (results: BacktestResult[]) => void
  addResult: (result: BacktestResult) => void
  setRunning: (running: boolean) => void
  setProgress: (progress: number) => void
}

export const useBacktestStore = create<BacktestState>((set) => ({
  results: [],
  isRunning: false,
  progress: 0,

  setResults: (results) => set({ results }),
  addResult: (result) => set((state) => ({
    results: [result, ...state.results],
  })),
  setRunning: (running) => set({ isRunning: running }),
  setProgress: (progress) => set({ progress }),
}))
