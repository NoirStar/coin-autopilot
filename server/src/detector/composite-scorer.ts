/**
 * 복합 스코어링 시스템 v2 — 부분점수제
 *
 * 6개 지표의 가중합산으로 최종 스코어 산출.
 * 각 지표는 0.0~1.0 사이의 연속 부분점수를 반환 (이진 ON/OFF → 그라데이션).
 * 최종 스코어 > 0.35이면 시그널 발생.
 *
 * 가중치:
 * - 거래량 Z-Score:       0.20
 * - BTC 보정 급등:        0.20
 * - 호가 Bid-Ask Ratio:   0.15
 * - OBV 다이버전스:       0.15
 * - 일중 모멘텀:          0.15  (기존 9시 리셋 확장)
 * - RSI 과매도 반등:      0.15  (신규)
 */

import type { Candle } from '../core/types.js'
import { detectVolumeAnomaly } from './volume-zscore.js'
import { detectBtcAdjustedPump } from './btc-adjusted-pump.js'
import { detectOrderbookImbalance, type OrderbookSnapshot } from './orderbook-imbalance.js'
import { detectOBVDivergence } from './obv-divergence.js'
import { calcRSI, calcATRPercent } from '../indicator/indicator-engine.js'

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
    volumeZScore: { active: boolean; value: number; weight: number; partialScore: number }
    btcAdjustedPump: { active: boolean; value: number; weight: number; partialScore: number }
    orderbookImbalance: { active: boolean; value: number; weight: number; partialScore: number }
    obvDivergence: { active: boolean; value: string; weight: number; partialScore: number }
    dailyMomentum: { active: boolean; value: number; weight: number; partialScore: number }
    rsiOversold: { active: boolean; value: number; weight: number; partialScore: number }
  }
  reasoning: Record<string, unknown>
}

const WEIGHTS = {
  volumeZScore: 0.20,
  btcAdjustedPump: 0.20,
  orderbookImbalance: 0.15,
  obvDivergence: 0.15,
  dailyMomentum: 0.15,
  rsiOversold: 0.15,
}

const SCORE_THRESHOLD = 0.35

/** 선형 보간 부분점수: min 이하 → 0, max 이상 → 1, 사이 → 선형 */
function partialLinear(value: number, min: number, max: number): number {
  if (value <= min) return 0
  if (value >= max) return 1
  return (value - min) / (max - min)
}

export function computeDetectionScore(input: DetectionInput): DetectionResult {
  const volumes = input.candles.map((c) => c.volume)
  const closes = input.candles.map((c) => c.close)
  const highs = input.candles.map((c) => c.high)
  const lows = input.candles.map((c) => c.low)

  // RSI(14) & ATR%(14) — 보조 지표
  const rsiValues = calcRSI(closes, 14)
  const atrPctValues = calcATRPercent(highs, lows, closes, 14)
  const rsi14 = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
  const atrPct = atrPctValues.length > 0 ? atrPctValues[atrPctValues.length - 1] : 0

  // 24시간 변동률 (candles가 1h면 24개 전)
  const lookback = Math.min(24, closes.length - 1)
  const changePct = lookback > 0
    ? ((closes[closes.length - 1] - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100
    : 0

  // ── 1. 거래량 Z-Score (z=1.0→0, z=2.5→1.0) ──
  const volumeResult = detectVolumeAnomaly(volumes)
  const volPartial = partialLinear(volumeResult.zScore, 1.0, 2.5)

  // ── 2. BTC 보정 급등 (adj=0.5%→0, adj=2.0%→1.0) ──
  const btcAdjResult = detectBtcAdjustedPump(closes, input.btcPrices)
  const btcPartial = partialLinear(btcAdjResult.adjustedChangePct, 0.5, 2.0)

  // ── 3. 호가 불균형 (ratio=1.1→0, ratio=2.0→1.0) ──
  const obResult = input.orderbook
    ? detectOrderbookImbalance(input.orderbook)
    : { detected: false, bidAskRatio: 1.0, totalBidSize: 0, totalAskSize: 0 }
  const obPartial = partialLinear(obResult.bidAskRatio, 1.1, 2.0)

  // ── 4. OBV 다이버전스: 불리시만 인정, 기울기 차이로 강도 계산 ──
  const obvResult = detectOBVDivergence(input.candles)
  let obvPartial = 0
  if (obvResult.divergenceType === 'bullish') {
    const divergenceStrength = Math.abs(obvResult.obvSlope) + Math.abs(obvResult.priceSlope)
    obvPartial = Math.min(1.0, divergenceStrength / 0.008)
  }

  // ── 5. 일중 모멘텀 (기존 모닝 리셋 확장 — 하루 종일 동작) ──
  let dailyChangePct = 0
  if (input.openPriceAt9 > 0) {
    dailyChangePct = ((input.currentPrice - input.openPriceAt9) / input.openPriceAt9) * 100
  }
  const dailyPartial = dailyChangePct > 0 ? partialLinear(dailyChangePct, 0.3, 2.0) : 0

  // ── 6. RSI 과매도 반등 (RSI 40→0, RSI 20→1.0 역방향) ──
  let rsiPartial = 0
  if (rsi14 < 40) {
    rsiPartial = partialLinear(40 - rsi14, 0, 20) // RSI 40 → 0점, RSI 20 → 만점
  }

  // 가중합산 (부분점수 × 가중치)
  const score =
    volPartial * WEIGHTS.volumeZScore +
    btcPartial * WEIGHTS.btcAdjustedPump +
    obPartial * WEIGHTS.orderbookImbalance +
    obvPartial * WEIGHTS.obvDivergence +
    dailyPartial * WEIGHTS.dailyMomentum +
    rsiPartial * WEIGHTS.rsiOversold

  const detected = score >= SCORE_THRESHOLD

  return {
    symbol: input.symbol,
    score: Math.round(score * 1000) / 1000,
    detected,
    rsi14: Math.round(rsi14 * 10) / 10,
    atrPct: Math.round(atrPct * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    price: input.currentPrice,
    signals: {
      volumeZScore: {
        active: volPartial > 0,
        value: volumeResult.zScore,
        weight: WEIGHTS.volumeZScore,
        partialScore: Math.round(volPartial * 1000) / 1000,
      },
      btcAdjustedPump: {
        active: btcPartial > 0,
        value: btcAdjResult.adjustedChangePct,
        weight: WEIGHTS.btcAdjustedPump,
        partialScore: Math.round(btcPartial * 1000) / 1000,
      },
      orderbookImbalance: {
        active: obPartial > 0,
        value: obResult.bidAskRatio,
        weight: WEIGHTS.orderbookImbalance,
        partialScore: Math.round(obPartial * 1000) / 1000,
      },
      obvDivergence: {
        active: obvPartial > 0,
        value: obvResult.divergenceType,
        weight: WEIGHTS.obvDivergence,
        partialScore: Math.round(obvPartial * 1000) / 1000,
      },
      dailyMomentum: {
        active: dailyPartial > 0,
        value: Math.round(dailyChangePct * 100) / 100,
        weight: WEIGHTS.dailyMomentum,
        partialScore: Math.round(dailyPartial * 1000) / 1000,
      },
      rsiOversold: {
        active: rsiPartial > 0,
        value: rsi14,
        weight: WEIGHTS.rsiOversold,
        partialScore: Math.round(rsiPartial * 1000) / 1000,
      },
    },
    reasoning: {
      composite_score: Math.round(score * 1000) / 1000,
      threshold: SCORE_THRESHOLD,
      scoring: 'partial_v2',
      rsi_14: rsi14,
      atr_pct: atrPct,
      change_pct_24h: changePct,
      volume_zscore: volumeResult.zScore,
      volume_partial: Math.round(volPartial * 1000) / 1000,
      btc_adjusted_change: btcAdjResult.adjustedChangePct,
      btc_partial: Math.round(btcPartial * 1000) / 1000,
      bid_ask_ratio: obResult.bidAskRatio,
      orderbook_partial: Math.round(obPartial * 1000) / 1000,
      obv_divergence: obvResult.divergenceType,
      obv_partial: Math.round(obvPartial * 1000) / 1000,
      daily_change_pct: Math.round(dailyChangePct * 100) / 100,
      daily_partial: Math.round(dailyPartial * 1000) / 1000,
      rsi_oversold_partial: Math.round(rsiPartial * 1000) / 1000,
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
