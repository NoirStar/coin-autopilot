// 전략 플러그인 인터페이스
// 새로운 전략은 이 인터페이스를 구현하면 됨 (모멘텀, 볼륨 스파이크 등)

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d'
export type Exchange = 'upbit' | 'okx'
export type SignalDirection = 'buy' | 'sell'
export type PositionDirection = 'long' | 'short'
export type RegimeState = 'risk_on' | 'risk_off'

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

export interface StrategyConfig {
  id: string
  name: string
  description: string
  timeframe: Timeframe
  exchange: Exchange
  params: Record<string, number>
}

export interface StrategySignal {
  symbol: string
  direction: SignalDirection
  positionSide?: PositionDirection
  leverage?: number
  reasoning: Record<string, unknown>
}

export interface ExitSignal {
  symbol: string
  reason: 'stop_loss' | 'take_profit' | 'time_exit' | 'regime_stop'
  reasoning: Record<string, unknown>
}

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

/** 모든 전략이 구현해야 하는 인터페이스 */
export interface Strategy {
  config: StrategyConfig

  /** 진입 시그널 생성 */
  evaluate(candles: CandleMap, regime: RegimeState): StrategySignal[]

  /** 청산 시그널 생성 */
  evaluateExits(
    candles: CandleMap,
    regime: RegimeState,
    openPositions: Array<{ symbol: string; entryPrice: number; entryTime: Date; candlesSinceEntry: number }>
  ): ExitSignal[]
}
