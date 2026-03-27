/**
 * 호가 불균형 탐지
 *
 * Bid-Ask Ratio: 상위 N호가 매수잔량 / 매도잔량
 * > 1.5 매수 우세, > 2.0 강한 매수 압력, > 3.0 매수벽 형성
 */

export interface OrderbookSnapshot {
  bids: Array<{ price: number; size: number }>  // 매수 호가 (높은 가격순)
  asks: Array<{ price: number; size: number }>  // 매도 호가 (낮은 가격순)
}

export function detectOrderbookImbalance(
  orderbook: OrderbookSnapshot,
  levels: number = 10,
  threshold: number = 2.0
): { detected: boolean; bidAskRatio: number; totalBidSize: number; totalAskSize: number } {
  const bids = orderbook.bids.slice(0, levels)
  const asks = orderbook.asks.slice(0, levels)

  const totalBidSize = bids.reduce((sum, b) => sum + b.size, 0)
  const totalAskSize = asks.reduce((sum, a) => sum + a.size, 0)

  if (totalAskSize === 0) {
    return { detected: true, bidAskRatio: Infinity, totalBidSize, totalAskSize }
  }

  const bidAskRatio = totalBidSize / totalAskSize

  return {
    detected: bidAskRatio >= threshold,
    bidAskRatio: Math.round(bidAskRatio * 100) / 100,
    totalBidSize: Math.round(totalBidSize),
    totalAskSize: Math.round(totalAskSize),
  }
}

/**
 * 매수벽 감지
 * 특정 호가의 매수 잔량이 전체 매수 잔량의 wallPct% 이상이면 매수벽
 */
export function detectBuyWall(
  orderbook: OrderbookSnapshot,
  wallPct: number = 10
): { detected: boolean; wallPrice: number; wallSize: number; wallPctOfTotal: number } | null {
  const totalBidSize = orderbook.bids.reduce((sum, b) => sum + b.size, 0)
  if (totalBidSize === 0) return null

  for (const bid of orderbook.bids) {
    const pct = (bid.size / totalBidSize) * 100
    if (pct >= wallPct) {
      return {
        detected: true,
        wallPrice: bid.price,
        wallSize: bid.size,
        wallPctOfTotal: Math.round(pct * 10) / 10,
      }
    }
  }

  return { detected: false, wallPrice: 0, wallSize: 0, wallPctOfTotal: 0 }
}
