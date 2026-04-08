// ============================================================
// 오케스트레이션 모델 타입 — PRD 02, 07 기준
// ============================================================

export type Exchange = 'upbit' | 'okx' | 'krx'
export type Venue = 'upbit_spot' | 'okx_swap' | 'krx_stock'
export type AssetClass = 'crypto' | 'kr_stock'
export type TradeMode = 'live' | 'paper' | 'backtest'
export type OperationMode = 'auto' | 'manual' | 'semi_auto'
export type SlotState = 'active' | 'paused' | 'pending_approval' | 'stopped'
export type PositionSide = 'long' | 'short' | 'flat'
export type ApprovalType = 'position_entry' | 'strategy_swap' | 'risk_adjustment' | 'session_promote'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'
export type RiskLevel = 'normal' | 'caution' | 'warning' | 'critical'
export type ResearchStatus = 'queued' | 'running' | 'completed' | 'failed'
export type ConnectionStatus = 'connected' | 'disconnected' | 'error'

// ── 시스템 상태 ──
export interface SystemStatus {
  server: ConnectionStatus
  database: ConnectionStatus
  exchanges: Record<string, ConnectionStatus>
  lastCollectedAt: string
  currentTime: string
}

// ── 전략 ──
export interface Strategy {
  id: string
  name: string
  shortName: string
  description: string
  type: string
  params: Record<string, unknown>
  assetClass: AssetClass
  isActive: boolean
}

// ── 자산 슬롯 (Deployment Matrix 행) ──
export interface AssetSlot {
  id: string
  asset: string
  venue: Venue
  strategy: Strategy
  operationMode: OperationMode
  tradeMode: TradeMode
  state: SlotState
  edgeScore: number | null
  rationale: string
  rationaleDetail: string
  position: SlotPosition | null
  lastDecisionAt: string
  aiInvolved: boolean
  pendingApproval: boolean
}

export interface SlotPosition {
  side: PositionSide
  entryPrice: number
  currentPrice: number
  stopLoss: number
  takeProfit: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  holdingSince: string
  confidence: number
}

// ── 히어로 요약 ──
export interface HeroAccountSummary {
  totalEquity: number
  todayPnl: number
  todayPnlPct: number
  count: number
}

export interface HeroSummary {
  edgeScore: number
  live: HeroAccountSummary & { active: boolean }
  paper: HeroAccountSummary
  pendingApprovals: number
  riskLevel: RiskLevel
}

// ── 판단 로그 (Decision Ledger) ──
export interface Decision {
  id: string
  timestamp: string
  asset: string
  strategy: string
  action: 'ENTRY' | 'EXIT' | 'HOLD' | 'SWAP' | 'STOP' | 'WAIT'
  confidence: number
  factors: Record<string, string>
  rationale: string
}

// ── 승인 요청 (Operator Queue) ──
export interface Approval {
  id: string
  type: ApprovalType
  status: ApprovalStatus
  title: string
  description: string
  asset: string
  strategy: string
  createdAt: string
  expiresAt: string
  metadata: Record<string, unknown>
}

// ── 리스크 경고 ──
export interface RiskAlert {
  id: string
  level: RiskLevel
  title: string
  description: string
  metric: string
  currentValue: number
  threshold: number
  createdAt: string
}

// ── 연구 루프 ──
export interface ResearchRun {
  id: string
  strategy: string
  asset: string
  status: ResearchStatus
  winRate: number | null
  totalReturn: number | null
  maxDrawdown: number | null
  sharpeRatio: number | null
  completedAt: string | null
  startedAt: string
}

export interface ResearchSummary {
  running: number
  queued: number
  completed: number
  topCandidates: ResearchRun[]
}

// ── AI 리뷰 알림 (대시보드용) ──
export interface AiAlert {
  id: string
  strategyName: string
  triggerReason: string
  summary: string
  confidence: number
  hasParamSuggestions: boolean
  createdAt: string
}

// ── 오퍼레이터 큐 아이템 (승인 + 리스크 통합) ──
export type QueueItem =
  | { kind: 'approval'; data: Approval }
  | { kind: 'risk'; data: RiskAlert }

// ── 포지션 목록 (Position Panel) ──
export interface ActivePosition {
  id: string
  asset: string
  venue: Venue
  strategy: string
  tradeMode: TradeMode
  side: PositionSide
  entryPrice: number
  currentPrice: number
  stopLoss: number
  takeProfit: number
  qty: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  holdingSince: string
}

// ── 시장 상황 (Market Panel) ──
export interface MarketCondition {
  crypto: {
    volatility: 'low' | 'medium' | 'high'
    fundingRate: number
    openInterest: number
    longShortRatio: number
    kimchiPremium: number
    updatedAt: string
  }
  krStock: {
    trend: 'up' | 'flat' | 'down'
    volume: number
    volumeChange: number
    updatedAt: string
  } | null
}

// ── 포트폴리오 ──
export interface PortfolioSummary {
  totalEquityKrw: number
  totalEquityUsd: number
  upbitBalanceKrw: number
  okxBalanceUsd: number
  dailyPnl: number
  dailyPnlPct: number
  cumulativeReturn: number
  maxDrawdown: number
}
