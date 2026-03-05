// ============================================================
// Trading Types
// ============================================================

export type Exchange = 'upbit' | 'okx'
export type Side = 'buy' | 'sell'
export type PositionSide = 'long' | 'short'
export type OrderType = 'market' | 'limit' | 'stop'
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'
export type RegimeState = 'risk_on' | 'risk_off' | 'neutral'
export type TradeMode = 'live' | 'paper' | 'backtest'
export type TradeReason = 'entry_signal' | 'stop_loss' | 'take_profit' | 'time_exit' | 'regime_stop'

export interface Position {
  id: string
  strategyId: string
  sessionId?: string
  exchange: Exchange
  symbol: string
  side: PositionSide
  qty: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  stopPrice: number
  leverage: number
  marginMode: 'isolated' | 'cross'
  openedAt: string
}

export interface Trade {
  id: string
  strategyId: string
  sessionId?: string
  exchange: Exchange
  symbol: string
  side: Side
  type: OrderType
  qty: number
  price: number
  fee: number
  pnl?: number
  pnlPct?: number
  reason: TradeReason
  executedAt: string
}

export interface EquitySnapshot {
  totalEquityKrw: number
  totalEquityUsd: number
  upbitBalanceKrw: number
  okxBalanceUsd: number
  btcPriceKrw: number
  btcPriceUsd: number
  snapshotAt: string
}

export interface Strategy {
  id: string
  name: string
  type: string
  params: Record<string, unknown>
  riskProfile: RiskProfile
  isActive: boolean
  mode: TradeMode
  exchange: Exchange
}

export interface BacktestResult {
  id: string
  strategyId: string
  params: Record<string, unknown>
  periodStart: string
  periodEnd: string
  totalReturn: number
  cagr: number
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  maxDrawdown: number
  winRate: number
  avgRR: number
  totalTrades: number
  avgHoldHours: number
  equityCurve: Array<{ t: string; equity: number }>
}

export interface PaperSession {
  id: string
  strategyId: string
  name: string
  initialCapital: number
  currentEquity: number
  status: 'running' | 'paused' | 'completed'
  startedAt: string
  endedAt?: string
  performance?: {
    totalReturn: number
    sharpeRatio: number
    maxDrawdown: number
    winRate: number
    totalTrades: number
  }
}

export interface AgentStatus {
  agentId: string
  state: 'idle' | 'running' | 'paused' | 'error'
  uptimeSeconds: number
  activePositions: number
  activeStrategies: number
  wsConnections: Record<string, boolean>
}

export interface RegimeInfo {
  state: RegimeState
  btcPrice: number
  btcEma200: number
  btcRsi14: number
  btcAtrPct: number
  timestamp: string
}
