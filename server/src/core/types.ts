/**
 * V2 핵심 타입과 상태 enum
 * PRD 12_SCHEMA_AND_API_CONTRACT 기준
 *
 * 모든 엔티티 이름과 상태값의 단일 소스
 * 이후 개발에서 여기 정의된 이름을 흔들지 않는다
 */

// ─── 타임프레임 / 거래소 ────────────────────────────────

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
export type Exchange = 'upbit' | 'okx'
export type AssetClass = 'crypto_spot' | 'crypto_futures' | 'kr_stock'
export type MarketType = 'spot' | 'linear_swap' | 'inverse_swap'

// ─── 심볼 키 규칙 ──────────────────────────────────────
// 내부 공통 심볼 키: "{BASE}-{QUOTE}" (현물) 또는 "{BASE}-{QUOTE}-SWAP" (선물)
// 예: "BTC-KRW", "BTC-USDT", "BTC-USDT-SWAP"

// ─── 방향 ───────────────────────────────────────────────

export type SignalDirection = 'buy' | 'sell'
export type PositionSide = 'long' | 'short'
export type OrderSide = 'buy' | 'sell'

// ─── BTC 레짐 ───────────────────────────────────────────
// Risk-On: BTC > EMA200 AND RSI 52~70 AND ATR% <= 4.5
// Risk-Off: BTC < EMA200 OR ATR% >= 6.5 OR RSI <= 45
// Neutral: 경계 구간 (RSI 45~52 또는 ATR% 4.5~6.5) — Risk-Off로 폴백

export type RegimeState = 'risk_on' | 'risk_off' | 'neutral'

// ─── 전략 라이프사이클 ──────────────────────────────────

export type StrategyStatus =
  | 'research_only'      // 연구 전용, 아직 백테스트 안 됨
  | 'backtest_running'   // 백테스트 실행 중
  | 'backtest_completed' // 백테스트 완료
  | 'validated_candidate'// 검증 통과 (Sharpe>0.8, MDD<15%, 승률>40%)
  | 'paper_candidate'    // 페이퍼 후보로 승격
  | 'paper_running'      // 페이퍼 실행 중
  | 'paper_verified'     // 페이퍼 검증 완료 (14일+, Sharpe>0.6)
  | 'live_candidate'     // 실전 후보
  | 'approval_pending'   // 승인 대기
  | 'live_running'       // 실전 실행 중
  | 'retired'            // 퇴역

// ─── 세션 상태 ──────────────────────────────────────────

export type SessionStatus =
  | 'draft'
  | 'approval_pending'
  | 'ready'
  | 'running'
  | 'paused'
  | 'stop_requested'
  | 'stopped'
  | 'failed'
  | 'completed'

// ─── 주문 상태 ──────────────────────────────────────────

export type OrderStatus =
  | 'pending_validation'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'queued'
  | 'submitted'
  | 'partially_filled'
  | 'filled'
  | 'cancel_requested'
  | 'cancelled'
  | 'replaced'
  | 'failed'

// ─── 오케스트레이터 판단 ────────────────────────────────

export type DecisionType =
  | 'strategy_assign'    // 새 전략 배치
  | 'strategy_switch'    // 전략 교체
  | 'strategy_retire'    // 전략 퇴역
  | 'go_flat'            // 전량 청산 (모든 전략 미달 또는 circuit breaker)
  | 'rebalance'          // 자본 재배분

export type DecisionStatus =
  | 'pending'            // 판단 생성, 승인 대기
  | 'approved'           // 승인됨, 실행 대기
  | 'rejected'           // 거부됨
  | 'executing'          // 실행 엔진이 처리 중
  | 'executed'           // 실행 완료
  | 'failed'             // 실행 실패
  | 'cancelled'          // 취소됨

// ─── 알림 ───────────────────────────────────────────────

export type NotificationPriority = 'info' | 'warning' | 'critical'
export type NotificationChannel = 'in_app' | 'telegram' | 'discord'

// ─── 연구 루프 ──────────────────────────────────────────

export type ResearchRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'

export type PromotionStatus =
  | 'not_evaluated'
  | 'below_threshold'
  | 'promoted_to_paper'
  | 'promoted_to_live'

// ─── 리스크 ─────────────────────────────────────────────

export type RiskEventType =
  | 'daily_loss_limit'   // 일일 손실 한도 도달
  | 'drawdown_limit'     // MDD 한도 도달
  | 'circuit_breaker'    // 서킷 브레이커 트리거
  | 'regime_change'      // 레짐 변경
  | 'position_divergence'// 거래소/내부 포지션 불일치

// ─── 캔들 ───────────────────────────────────────────────

export interface Candle {
  openTime: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** symbol → Candle[] 매핑 */
export type CandleMap = Map<string, Candle[]>

// ─── 전략 인터페이스 ────────────────────────────────────
// strategy-base.ts에서 가져온 검증된 인터페이스

export interface StrategyConfig {
  id: string
  name: string
  description: string
  timeframe: Timeframe
  exchange: Exchange
  assetClass: AssetClass
  direction: PositionSide | 'both'
  params: Record<string, number>
}

export interface StrategySignal {
  symbol: string
  direction: SignalDirection
  positionSide?: PositionSide
  leverage?: number
  reasoning: Record<string, unknown>
}

export interface ExitSignal {
  symbol: string
  reason: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_exit' | 'regime_stop' | 'circuit_breaker'
  partialExitRatio?: number
  reasoning: Record<string, unknown>
}

export interface OpenPosition {
  symbol: string
  entryPrice: number
  entryTime: Date
  candlesSinceEntry: number
  side?: PositionSide
  peakPrice?: number
  quantity?: number
}

/**
 * 모든 전략이 구현해야 하는 인터페이스
 *
 *   ┌──────────┐    ┌──────────────┐    ┌───────────────┐
 *   │ candles  │───▶│  evaluate()  │───▶│ StrategySignal│
 *   │ regime   │    └──────────────┘    └───────────────┘
 *   └──────────┘
 *   ┌──────────┐    ┌──────────────────┐    ┌────────────┐
 *   │ candles  │───▶│ evaluateExits() │───▶│ ExitSignal │
 *   │ regime   │    └──────────────────┘    └────────────┘
 *   │ positions│
 *   └──────────┘
 */
export interface Strategy {
  config: StrategyConfig

  /** 진입 시그널 생성 */
  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[]

  /** 청산 시그널 생성 */
  evaluateExits(
    candles: CandleMap,
    regime: RegimeState,
    openPositions: OpenPosition[]
  ): ExitSignal[]
}

// ─── 백테스트 결과 ──────────────────────────────────────

export interface BacktestTrade {
  symbol: string
  direction: SignalDirection
  entryPrice: number
  exitPrice: number
  entryTime: Date
  exitTime: Date
  pnlPct: number
  reason: string
  fees: number
}

export interface BacktestResult {
  strategyId: string
  params: Record<string, number>
  timeframe: Timeframe
  periodStart: Date
  periodEnd: Date
  totalReturn: number
  cagr: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
  totalTrades: number
  avgHoldHours: number
  trades: BacktestTrade[]
  equityCurve: Array<{ t: string; equity: number }>
}

// ─── 검증 기준 (초기 기본값, 조정 가능) ─────────────────

export const VALIDATION_THRESHOLDS = {
  /** 연구루프 → 페이퍼 승격 */
  researchToPaper: {
    minSharpe: 0.8,
    maxMDD: 0.15,       // 15%
    minWinRate: 0.4,     // 40%
    minTrades: 20,
  },
  /** 페이퍼 → 실전 승격 */
  paperToLive: {
    minDays: 14,
    minSharpe: 0.6,
    maxDivergence: 0.3,  // 30% (백테스트 vs 페이퍼 괴리)
  },
  /** 오케스트레이터 */
  orchestrator: {
    cooldownHours: 24,
    shortRiskRatio: 0.5, // 숏 전략 리스크 한도 = 롱의 50%
  },
} as const

// ─── 에퀴티 스냅샷 ──────────────────────────────────────

export interface EquitySnapshot {
  timestamp: Date
  totalEquity: number
  regime: RegimeState
  activeStrategies: string[]
  unrealizedPnl: number
  realizedPnl: number
}

// ─── 오케스트레이터 판단 로그 ───────────────────────────

export interface OrchestratorDecision {
  id: string
  slotId: string
  decisionType: DecisionType
  status: DecisionStatus
  fromStrategyId: string | null
  toStrategyId: string | null
  regime: RegimeState
  reasonSummary: string
  scoreSnapshot: Record<string, number>
  createdAt: Date
  executedAt: Date | null
}
