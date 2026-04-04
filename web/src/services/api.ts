import { supabase } from '../lib/supabase'

/** API URL: localStorage 우선 → 환경변수 → 프로덕션은 same-origin, 로컬은 localhost 폴백 */
export function getApiBase(): string {
  return localStorage.getItem('coin-autopilot-api-url')
    || import.meta.env.VITE_API_URL
    || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '')
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

/** 인증이 필요한 경로 (쓰기 작업만 — 읽기는 1인 사용 단계에서 무인증) */
const AUTH_METHODS = ['PUT', 'POST', 'DELETE']

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // AbortSignal 제거 — 탭 이동 시 진행 중인 요청이 취소되지 않도록
  const { signal: _signal, ...restOptions } = options ?? {}
  const hasBody = restOptions?.body != null
  const method = (restOptions?.method ?? 'GET').toUpperCase()
  const needsAuth = AUTH_METHODS.includes(method)

  const headers: Record<string, string> = {
    ...(restOptions?.headers as Record<string, string>),
  }
  // Content-Type은 body가 있을 때만 — GET에 붙이면 불필요한 preflight 발생
  if (hasBody) {
    headers['Content-Type'] = 'application/json'
  }
  // Authorization은 인증 경로에서만 — 공개 API에 붙이면 불필요한 preflight 발생
  if (needsAuth) {
    const authHeaders = await getAuthHeaders()
    Object.assign(headers, authHeaders)
  }
  const res = await fetch(`${getApiBase()}${path}`, {
    headers,
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

  // 트레이딩 대시보드 (HANDOFF.md §2: 집계 endpoint)
  getOperatorHome: () => request<OperatorHomeResponse>('/api/dash/operator/home'),

  // Research (연구 루프)
  getResearchRuns: () => request('/api/dash/research/runs'),
  getResearchCandidates: () => request('/api/dash/research/candidates'),

  // 판단 승인/거부
  approveDecision: (id: string) =>
    request(`/api/dash/decisions/${id}/approve`, { method: 'POST' }),
  rejectDecision: (id: string) =>
    request(`/api/dash/decisions/${id}/reject`, { method: 'POST' }),

  // 리스크 이벤트 해결
  resolveRiskEvent: (id: string) =>
    request(`/api/dash/risk/events/${id}/resolve`, { method: 'POST' }),

  // 범용 request (새 페이지에서 직접 경로 지정)
  request: <T>(path: string, options?: RequestInit) => request<T>(path, options),
}

// ── /api/operator/home 응답 타입 ──
export interface OperatorHomeResponse {
  system: {
    server: string
    database: string
    lastCollectedAt: string | null
  }
  hero: {
    totalEquity: number
    todayPnl: { realized: number; unrealized: number; total: number }
    liveCount: number
    paperCount: number
    pendingApprovals: number
    riskLevel: string
    edgeScore: number | null
  }
  slots: Array<{
    slotId: string
    assetKey: string
    slotType: string
    strategyId: string | null
    allocationPct: number
    regime: string | null
    status: string
    cooldownUntil: string | null
  }>
  regime: {
    regime: string
    btc_price: number
    ema200: number
    rsi14: number
    atr_pct: number
    recorded_at: string
  } | null
  queue: {
    pendingDecisions: Array<{
      id: string
      slotId: string
      type: string
      fromStrategy: string | null
      toStrategy: string | null
      regime: string
      reason: string
      createdAt: string
    }>
    unresolvedRisks: Array<{
      id: string
      eventType: string
      severity: string
      details: Record<string, unknown>
      createdAt: string
    }>
  }
  positions: {
    live: Array<Record<string, unknown>>
    paper: Array<Record<string, unknown>>
  }
  market: {
    regime: string | null
    btcPrice: number | null
    rsi14: number | null
    atrPct: number | null
    volatility: 'low' | 'medium' | 'high'
    fundingRate: number
    openInterest: number
    longShortRatio: number
    kimchiPremium: number
    updatedAt: string | null
  }
  decisions: Array<{
    id: string
    slotId: string
    type: string
    status: string
    fromStrategy: string | null
    toStrategy: string | null
    regime: string
    reason: string
    createdAt: string
    executedAt: string | null
  }>
  research: {
    running: number
    queued: number
    completed: number
    topCandidates: Array<{
      id: string
      strategyName: string
      status: string
      startedAt: string
      completedAt: string | null
      metrics: Record<string, unknown> | null
    }>
  }
  circuitBreaker: {
    triggered: boolean
    dailyLossPct: number
  }
}
