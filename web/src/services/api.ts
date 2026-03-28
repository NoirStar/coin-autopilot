import { supabase } from '../lib/supabase'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface DetectionResultItem {
  symbol: string
  koreanName: string
  score: number
  rsi14: number
  atrPct: number
  changePct: number
  price: number
  signals: {
    volumeZScore: { active: boolean; value: number; weight: number }
    btcAdjustedPump: { active: boolean; value: number; weight: number }
    orderbookImbalance: { active: boolean; value: number; weight: number }
    obvDivergence: { active: boolean; value: string; weight: number }
    morningReset: { active: boolean; value: number; weight: number }
  }
  reasoning: Record<string, unknown>
}

export interface DetectionCacheResponse {
  cached: boolean
  message?: string
  scannedAt?: string
  totalScanned?: number
  detected?: number
  results?: DetectionResultItem[]
  scanDurationMs?: number
}

export interface DetectionScanResult {
  scannedAt: string
  totalScanned: number
  detected: number
  results: DetectionResultItem[]
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders()
  // AbortSignal 제거 — 탭 이동 시 진행 중인 요청이 취소되지 않도록
  const { signal: _signal, ...restOptions } = options ?? {}
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...restOptions?.headers,
    },
    ...restOptions,
  })

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  // Dashboard
  getDashboardSummary: () => request('/api/dashboard/summary'),
  getEquityHistory: () => request('/api/dashboard/equity-history'),
  getBtcPrice: () => request<{ price: number; changeRate: number }>('/api/dashboard/btc-price'),

  // Portfolio
  getBalance: () => request('/api/portfolio/balance'),
  getPositions: () => request('/api/portfolio/positions'),
  getTrades: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request(`/api/portfolio/trades${qs}`)
  },

  // Strategy
  getStrategies: () => request('/api/strategy'),
  createStrategy: (data: unknown) => request('/api/strategy', { method: 'POST', body: JSON.stringify(data) }),
  updateStrategy: (id: string, data: unknown) => request(`/api/strategy/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activateStrategy: (id: string) => request(`/api/strategy/${id}/activate`, { method: 'PUT' }),
  deactivateStrategy: (id: string) => request(`/api/strategy/${id}/deactivate`, { method: 'PUT' }),

  // Backtest
  runBacktest: (data: unknown) => request('/api/backtest/run', { method: 'POST', body: JSON.stringify(data) }),
  getBacktestStatus: (jobId: string) => request(`/api/backtest/status/${jobId}`),
  getBacktestResults: () => request('/api/backtest/results'),
  getBacktestResult: (id: string) => request(`/api/backtest/results/${id}`),

  // Paper Trading
  startPaperSession: (data: unknown) => request('/api/paper-trading/session', { method: 'POST', body: JSON.stringify(data) }),
  updatePaperSession: (id: string, data: unknown) => request(`/api/paper-trading/session/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getPaperSessions: () => request('/api/paper-trading/sessions'),
  comparePaperSessions: () => request('/api/paper-trading/compare'),

  // Detection (알트코인 탐지)
  scanDetection: (strategy?: string) => request(`/api/detection/scan${strategy ? `?strategy=${strategy}` : ''}`),
  getDetectionScore: (symbol: string) => request(`/api/detection/score/${symbol}`),
  getDetectionCached: () => request<DetectionCacheResponse>('/api/detection/cached'),
  refreshDetection: () => request<DetectionScanResult>('/api/detection/refresh', { method: 'POST' }),

  // Settings
  getSettings: () => request('/api/settings'),
  getAgentStatus: () => request('/api/settings/agent-status'),
  updateRiskProfile: (data: unknown) => request('/api/settings/risk-profile', { method: 'PUT', body: JSON.stringify(data) }),
  updateAlerts: (data: unknown) => request('/api/settings/alerts', { method: 'PUT', body: JSON.stringify(data) }),
}
