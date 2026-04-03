import { supabase } from '../lib/supabase'

/** API URL: localStorage 우선 → 환경변수 → localhost 폴백 */
export function getApiBase(): string {
  return localStorage.getItem('coin-autopilot-api-url') || import.meta.env.VITE_API_URL || 'http://localhost:3001'
}
export const API_BASE = getApiBase()

export interface DetectionResultItem {
  symbol: string
  koreanName: string
  score: number
  rsi14: number
  atrPct: number
  changePct: number
  price: number
  signals: {
    volumeZScore: { active: boolean; value: number; weight: number; partialScore?: number }
    btcAdjustedPump: { active: boolean; value: number; weight: number; partialScore?: number }
    orderbookImbalance: { active: boolean; value: number; weight: number; partialScore?: number }
    obvDivergence: { active: boolean; value: string; weight: number; partialScore?: number }
    dailyMomentum?: { active: boolean; value: number; weight: number; partialScore?: number }
    rsiOversold?: { active: boolean; value: number; weight: number; partialScore?: number }
    morningReset?: { active: boolean; value: number; weight: number }
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
  const res = await fetch(`${getApiBase()}${path}`, {
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
  // Portfolio
  getBalance: () => request('/api/portfolio/balance'),
  getPositions: () => request('/api/portfolio/positions'),
  getTrades: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request(`/api/portfolio/trades${qs}`)
  },

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
  saveApiKeys: (data: { exchange: string; accessKey: string; secretKey: string; passphrase?: string }) =>
    request('/api/settings/api-keys', { method: 'PUT', body: JSON.stringify(data) }),
  deleteApiKeys: (exchange: string) =>
    request(`/api/settings/api-keys/${exchange}`, { method: 'DELETE' }),

  // Research (연구 루프)
  getResearchRuns: () => request('/api/v2/research/runs'),
  getResearchCandidates: () => request('/api/v2/research/candidates'),

  // 범용 request (새 페이지에서 직접 경로 지정)
  request: <T>(path: string, options?: RequestInit) => request<T>(path, options),
}
