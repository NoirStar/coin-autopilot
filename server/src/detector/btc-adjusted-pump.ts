/**
 * BTC 보정 급등 감지
 *
 * 알트코인 상승률에서 BTC 연동 상승분을 제거하여
 * 독립적인 펌핑만 감지.
 *
 * adjusted = altChangePct - (btcChangePct * beta)
 * beta = 알트/BTC 상관계수 (기본 1.0, 추후 동적 계산)
 */
export function detectBtcAdjustedPump(
  altPrices: number[],
  btcPrices: number[],
  lookback: number = 12,  // 12개 캔들 (1시간봉이면 12시간)
  threshold: number = 2.0, // 보정 후 2% 이상이면 독립 펌핑
  beta: number = 1.0
): { detected: boolean; adjustedChangePct: number; altChangePct: number; btcChangePct: number } {
  if (altPrices.length < lookback + 1 || btcPrices.length < lookback + 1) {
    return { detected: false, adjustedChangePct: 0, altChangePct: 0, btcChangePct: 0 }
  }

  const altCurrent = altPrices[altPrices.length - 1]
  const altPrev = altPrices[altPrices.length - 1 - lookback]
  const btcCurrent = btcPrices[btcPrices.length - 1]
  const btcPrev = btcPrices[btcPrices.length - 1 - lookback]

  if (altPrev === 0 || btcPrev === 0) {
    return { detected: false, adjustedChangePct: 0, altChangePct: 0, btcChangePct: 0 }
  }

  const altChangePct = ((altCurrent - altPrev) / altPrev) * 100
  const btcChangePct = ((btcCurrent - btcPrev) / btcPrev) * 100
  const adjustedChangePct = altChangePct - (btcChangePct * beta)

  return {
    detected: adjustedChangePct >= threshold,
    adjustedChangePct: Math.round(adjustedChangePct * 100) / 100,
    altChangePct: Math.round(altChangePct * 100) / 100,
    btcChangePct: Math.round(btcChangePct * 100) / 100,
  }
}
