export const EXCHANGES = {
  UPBIT: 'upbit',
  OKX: 'okx',
} as const

export const RISK_PROFILES = {
  CONSERVATIVE: 'conservative',
  MODERATE: 'moderate',
  AGGRESSIVE: 'aggressive',
} as const

export const STRATEGY_TYPES = {
  REGIME_MEAN_REVERSION: 'regime_mean_reversion',
  DOMINANCE_ROTATION: 'dominance_rotation',
  VOLATILITY_TIMING: 'volatility_timing',
  FUNDING_ARBITRAGE: 'funding_arbitrage',
} as const

export const REGIME_STATES = {
  RISK_ON: 'risk_on',
  RISK_OFF: 'risk_off',
  NEUTRAL: 'neutral',
} as const

export const TRADE_MODES = {
  LIVE: 'live',
  PAPER: 'paper',
  BACKTEST: 'backtest',
} as const
