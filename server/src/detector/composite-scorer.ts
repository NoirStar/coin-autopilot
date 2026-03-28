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
import { calcRSI, calcATRPercent, calcZScore } from '../indicator/indicator-engine.js'

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
  rsi14: number               // RSI(14) 0~100
  atrPct: number              // ATR% (가격 대비 변동폭)
  changePct: number           // 24시간 변동률 %
  price: number               // 현재가
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
  const highs = input.candles.map((c) => c.high)
  const lows = input.candles.map((c) => c.low)

  // RSI(14) & ATR%(14) — 보조 지표
  const rsiValues = calcRSI(closes, 14)
  const atrPctValues = calcATRPercent(highs, lows, closes, 14)
  const rsi14 = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 0
  const atrPct = atrPctValues.length > 0 ? atrPctValues[atrPctValues.length - 1] : 0

  // 24시간 변동률 (candles가 1h면 24개 전)
  const lookback = Math.min(24, closes.length - 1)
  const changePct = lookback > 0
    ? ((closes[closes.length - 1] - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100
    : 0

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
    rsi14: Math.round(rsi14 * 10) / 10,
    atrPct: Math.round(atrPct * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    price: input.currentPrice,
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
      rsi_14: rsi14,
      atr_pct: atrPct,
      change_pct_24h: changePct,
      volume_zscore: volumeResult.zScore,
      btc_adjusted_change: btcAdjResult.adjustedChangePct,
      bid_ask_ratio: obResult.bidAskRatio,
      obv_divergence: obvResult.divergenceType,
      morning_change: morningResult.changePct,
    },
  }
}

export type DetectionStrategy = 'composite' | 'oversold' | 'momentum' | 'volume'

/** 여러 코인을 한번에 스코어링하고 전략별 필터 적용 */
export function scoreMultipleCoins(
  inputs: DetectionInput[],
  topN: number = 10,
  strategy: DetectionStrategy = 'composite'
): DetectionResult[] {
  const results = inputs.map(computeDetectionScore)

  switch (strategy) {
    case 'oversold':
      // 과매도 전략: RSI ≤ 30 && 스코어 있는 코인
      return results
        .filter((r) => r.rsi14 > 0 && r.rsi14 <= 30)
        .sort((a, b) => a.rsi14 - b.rsi14)
        .slice(0, topN)

    case 'momentum':
      // 모멘텀 전략: 24h 상승률 상위 + RSI 50~70 (건강한 상승)
      return results
        .filter((r) => r.changePct > 0 && r.rsi14 >= 50 && r.rsi14 <= 70)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, topN)

    case 'volume':
      // 거래량 폭증: Z-Score 기준 상위
      return results
        .filter((r) => (r.signals.volumeZScore.value as number) > 1.5)
        .sort((a, b) => (b.signals.volumeZScore.value as number) - (a.signals.volumeZScore.value as number))
        .slice(0, topN)

    case 'composite':
    default:
      // 기본 복합 스코어: detected + 스코어 순
      return results
        .filter((r) => r.detected)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
  }
}
