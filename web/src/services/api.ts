import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
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
  scanDetection: () => request('/api/detection/scan'),
  getDetectionScore: (symbol: string) => request(`/api/detection/score/${symbol}`),

  // Settings
  getSettings: () => request('/api/settings'),
  getAgentStatus: () => request('/api/settings/agent-status'),
  updateRiskProfile: (data: unknown) => request('/api/settings/risk-profile', { method: 'PUT', body: JSON.stringify(data) }),
  updateAlerts: (data: unknown) => request('/api/settings/alerts', { method: 'PUT', body: JSON.stringify(data) }),
}
