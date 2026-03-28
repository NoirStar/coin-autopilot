/**
 * 공통 PnL 계산 함수
 *
 * paper-trading-engine과 execution-engine에서 중복되던 손익 계산 로직을 통합.
 * backtest-engine은 Decimal.js로 고정밀 계산하므로 별도 유지.
 */

export interface PnlResult {
  /** 원시 손익률 (레버리지/수수료 미적용) */
  rawPnlPct: number
  /** 레버리지 적용 손익률 */
  leveragedPnlPct: number
  /** 수수료 차감 후 순 손익률 */
  netPnlPct: number
}

/**
 * 진입가/청산가 기반 PnL 계산
 *
 * @param entryPrice - 진입 가격
 * @param exitPrice - 청산 가격
 * @param side - 포지션 방향 (long/short)
 * @param leverage - 레버리지 배수 (기본 1)
 * @param feeRate - 편도 수수료율 (기본 0.05%, 왕복 시 2배 적용)
 */
export function calculatePnlPct(
  entryPrice: number,
  exitPrice: number,
  side: 'long' | 'short',
  leverage: number = 1,
  feeRate: number = 0.0005
): PnlResult {
  const rawPnlPct = side === 'long'
    ? (exitPrice - entryPrice) / entryPrice
    : (entryPrice - exitPrice) / entryPrice

  const leveragedPnlPct = rawPnlPct * leverage
  const netPnlPct = leveragedPnlPct - feeRate * 2 * leverage

  return { rawPnlPct, leveragedPnlPct, netPnlPct }
}
