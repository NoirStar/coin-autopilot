import { calcATRPercent } from '../../indicator/indicator-engine.js'
import type { Candle, PositionSide } from '../../core/types.js'

/**
 * ATR 기반 손절가 계산 유틸리티
 *
 * 4개 전략에서 중복되던 ATR 손절 로직을 DRY 원칙으로 통합.
 * ATR% × 배수만큼 진입가에서 떨어진 손절가를 반환한다.
 *
 * @param candles  - 캔들 배열 (최소 atrPeriod + 1개 필요)
 * @param entryPrice - 진입 가격
 * @param side - 포지션 방향 (long / short)
 * @param atrMult - ATR 배수 (예: 1.5)
 * @param atrPeriod - ATR 기간 (기본값 14)
 * @returns 손절가. ATR 계산 불가 시 NaN 반환
 */
export function calcATRStop(
  candles: Candle[],
  entryPrice: number,
  side: PositionSide,
  atrMult: number,
  atrPeriod: number = 14,
): number {
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const closes = candles.map((c) => c.close)

  const atrPctValues = calcATRPercent(highs, lows, closes, atrPeriod)
  if (atrPctValues.length === 0) return NaN

  const latestAtrPct = atrPctValues[atrPctValues.length - 1]
  const stopDistance = (atrMult * latestAtrPct) / 100

  return side === 'long'
    ? entryPrice * (1 - stopDistance)
    : entryPrice * (1 + stopDistance)
}
