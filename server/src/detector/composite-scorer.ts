/**
 * 복합 스코어링 시스템
 *
 * 5개 Tier 1 지표의 가중합산으로 최종 스코어 산출.
 * 스코어 > 0.6이면 시그널 발생.
 *
 * 가중치:
 * - 거래량 Z-Score:      0.25
 * - BTC 보정 급등:       0.25
 * - 호가 Bid-Ask Ratio:  0.20
 * - OBV 다이버전스:      0.15
 * - 9시 리셋 모멘텀:     0.15
 */

import type { Candle } from '../strategy/strategy-base.js'
import { detectVolumeAnomaly } from './volume-zscore.js'
import { detectBtcAdjustedPump } from './btc-adjusted-pump.js'
import { detectOrderbookImbalance, type OrderbookSnapshot } from './orderbook-imbalance.js'
import { detectOBVDivergence } from './obv-divergence.js'
import { detectMorningResetMomentum } from './morning-reset.js'

interface DetectionInput {
  symbol: string
  candles: Candle[]           // 최소 21개 (20일 + 현재)
  btcPrices: number[]         // BTC 종가 배열 (candles와 동일 길이)
  orderbook?: OrderbookSnapshot
  currentPrice: number
  openPriceAt9: number        // 09:00 시가 (없으면 0)
  currentTimeKST: Date
}

interface DetectionResult {
  symbol: string
  score: number               // 0.0 ~ 1.0
  detected: boolean           // score > threshold
  signals: {
    volumeZScore: { active: boolean; value: number; weight: number }
    btcAdjustedPump: { active: boolean; value: number; weight: number }
    orderbookImbalance: { active: boolean; value: number; weight: number }
    obvDivergence: { active: boolean; value: string; weight: number }
    morningReset: { active: boolean; value: number; weight: number }
  }
  reasoning: Record<string, unknown>
}

const WEIGHTS = {
  volumeZScore: 0.25,
  btcAdjustedPump: 0.25,
  orderbookImbalance: 0.20,
  obvDivergence: 0.15,
  morningReset: 0.15,
}

const SCORE_THRESHOLD = 0.6

export function computeDetectionScore(input: DetectionInput): DetectionResult {
  const volumes = input.candles.map((c) => c.volume)
  const closes = input.candles.map((c) => c.close)

  // 1. 거래량 Z-Score
  const volumeResult = detectVolumeAnomaly(volumes)

  // 2. BTC 보정 급등
  const btcAdjResult = detectBtcAdjustedPump(closes, input.btcPrices)

  // 3. 호가 불균형
  const obResult = input.orderbook
    ? detectOrderbookImbalance(input.orderbook)
    : { detected: false, bidAskRatio: 1.0, totalBidSize: 0, totalAskSize: 0 }

  // 4. OBV 다이버전스
  const obvResult = detectOBVDivergence(input.candles)

  // 5. 9시 리셋 모멘텀
  const morningResult = detectMorningResetMomentum(
    input.currentPrice,
    input.openPriceAt9,
    input.currentTimeKST
  )

  // 가중합산
  let score = 0
  if (volumeResult.detected) score += WEIGHTS.volumeZScore
  if (btcAdjResult.detected) score += WEIGHTS.btcAdjustedPump
  if (obResult.detected) score += WEIGHTS.orderbookImbalance
  if (obvResult.detected && obvResult.divergenceType === 'bullish') score += WEIGHTS.obvDivergence
  if (morningResult.detected) score += WEIGHTS.morningReset

  const detected = score >= SCORE_THRESHOLD

  return {
    symbol: input.symbol,
    score: Math.round(score * 100) / 100,
    detected,
    signals: {
      volumeZScore: {
        active: volumeResult.detected,
        value: volumeResult.zScore,
        weight: WEIGHTS.volumeZScore,
      },
      btcAdjustedPump: {
        active: btcAdjResult.detected,
        value: btcAdjResult.adjustedChangePct,
        weight: WEIGHTS.btcAdjustedPump,
      },
      orderbookImbalance: {
        active: obResult.detected,
        value: obResult.bidAskRatio,
        weight: WEIGHTS.orderbookImbalance,
      },
      obvDivergence: {
        active: obvResult.detected && obvResult.divergenceType === 'bullish',
        value: obvResult.divergenceType,
        weight: WEIGHTS.obvDivergence,
      },
      morningReset: {
        active: morningResult.detected,
        value: morningResult.changePct,
        weight: WEIGHTS.morningReset,
      },
    },
    reasoning: {
      composite_score: score,
      threshold: SCORE_THRESHOLD,
      volume_zscore: volumeResult.zScore,
      btc_adjusted_change: btcAdjResult.adjustedChangePct,
      bid_ask_ratio: obResult.bidAskRatio,
      obv_divergence: obvResult.divergenceType,
      morning_change: morningResult.changePct,
    },
  }
}

/** 여러 코인을 한번에 스코어링하고 상위 결과만 반환 */
export function scoreMultipleCoins(
  inputs: DetectionInput[],
  topN: number = 5
): DetectionResult[] {
  const results = inputs.map(computeDetectionScore)

  return results
    .filter((r) => r.detected)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
