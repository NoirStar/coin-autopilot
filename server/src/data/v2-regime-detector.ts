import type { Candle, RegimeState } from '../core/types.js'
import { calcEMA, calcRSI, calcATRPercent } from '../indicator/indicator-engine.js'
import { supabase } from '../services/database.js'
import { loadCandles } from './v2-candle-collector.js'

// ─── 레짐 판정 임계값 ──────────────────────────────────────
// PRD 정의 기준:
//   Risk-On:  BTC > EMA200 AND RSI 52~70 AND ATR% <= 4.5
//   Risk-Off: BTC < EMA200 OR ATR% >= 6.5 OR RSI <= 45
//   Neutral:  경계 구간 (RSI 45~52 또는 ATR% 4.5~6.5) — Risk-Off로 폴백

const EMA_PERIOD = 200
const RSI_PERIOD = 14
const ATR_PERIOD = 14

/** Risk-On 진입 조건 */
const RISK_ON = {
  rsiMin: 52,
  rsiMax: 70,
  atrPctMax: 4.5,
} as const

/** Risk-Off 강제 조건 */
const RISK_OFF = {
  rsiMax: 45,
  atrPctMin: 6.5,
} as const

// ─── 레짐 판정 인터페이스 ───────────────────────────────────

interface RegimeSnapshot {
  regime: RegimeState
  btcPrice: number
  ema200: number
  rsi14: number
  atrPct: number
}

/**
 * BTC 캔들 데이터로 현재 레짐 판정
 *
 * 판정 로직:
 *   1. EMA200, RSI14, ATR%14 계산
 *   2. Risk-On 조건 충족 → 'risk_on'
 *   3. Risk-Off 강제 조건 충족 → 'risk_off'
 *   4. 나머지 (경계 구간) → 'neutral' (실질적으로 Risk-Off 취급)
 *
 * @param btcCandles BTC 캔들 배열 (최소 201개 권장, 오래된 순)
 * @returns 현재 레짐 상태
 */
export function detectRegime(btcCandles: Candle[]): RegimeState {
  const snapshot = computeRegimeSnapshot(btcCandles)
  if (!snapshot) {
    console.warn('[레짐] 지표 계산 불가 — 캔들 부족, risk_off 반환')
    return 'risk_off'
  }
  return snapshot.regime
}

/**
 * 레짐 스냅샷 계산 (내부용)
 * 지표 값과 판정 결과를 함께 반환
 */
function computeRegimeSnapshot(btcCandles: Candle[]): RegimeSnapshot | null {
  if (btcCandles.length < EMA_PERIOD + 1) {
    return null
  }

  const closes = btcCandles.map((c) => c.close)
  const highs = btcCandles.map((c) => c.high)
  const lows = btcCandles.map((c) => c.low)

  // 지표 계산
  const emaValues = calcEMA(closes, EMA_PERIOD)
  const rsiValues = calcRSI(closes, RSI_PERIOD)
  const atrPctValues = calcATRPercent(highs, lows, closes, ATR_PERIOD)

  // 최신값 추출
  const latestEma = emaValues[emaValues.length - 1]
  const latestRsi = rsiValues[rsiValues.length - 1]
  const latestAtrPct = atrPctValues[atrPctValues.length - 1]
  const latestClose = closes[closes.length - 1]

  if (latestEma === undefined || latestRsi === undefined || latestAtrPct === undefined) {
    return null
  }

  // 레짐 판정
  const regime = classifyRegime(latestClose, latestEma, latestRsi, latestAtrPct)

  return {
    regime,
    btcPrice: latestClose,
    ema200: latestEma,
    rsi14: latestRsi,
    atrPct: latestAtrPct,
  }
}

/**
 * 지표값으로 레짐 분류
 */
function classifyRegime(
  price: number,
  ema200: number,
  rsi: number,
  atrPct: number
): RegimeState {
  // Risk-Off 강제 조건: 하나라도 충족하면 즉시 risk_off
  if (price < ema200 || atrPct >= RISK_OFF.atrPctMin || rsi <= RISK_OFF.rsiMax) {
    return 'risk_off'
  }

  // Risk-On 조건: 모두 충족해야 risk_on
  if (
    price > ema200 &&
    rsi >= RISK_ON.rsiMin &&
    rsi <= RISK_ON.rsiMax &&
    atrPct <= RISK_ON.atrPctMax
  ) {
    return 'risk_on'
  }

  // 경계 구간 — neutral (실질적으로 Risk-Off 취급)
  return 'neutral'
}

// ─── DB 저장 + 통합 함수 ────────────────────────────────────

/**
 * BTC 4h 캔들을 로드하고 레짐을 판정하여 v2_regime_snapshots에 저장
 *
 * 크론 스케줄러에서 주기적으로 호출하는 메인 진입점
 * - 업비트 BTC-KRW 4h 캔들 기준으로 레짐 판정
 * - 판정 결과를 v2_regime_snapshots 테이블에 기록
 */
export async function detectAndSaveRegime(): Promise<RegimeState> {
  // BTC-KRW 4h 캔들 로드 (EMA200 계산을 위해 충분한 양 확보)
  const btcCandles = await loadCandles('upbit', 'BTC-KRW', '4h', 500)

  if (btcCandles.length < EMA_PERIOD + 1) {
    console.error(`[레짐] BTC 캔들 부족: ${btcCandles.length}개 (최소 ${EMA_PERIOD + 1}개 필요)`)
    return 'risk_off'
  }

  const snapshot = computeRegimeSnapshot(btcCandles)
  if (!snapshot) {
    console.error('[레짐] 스냅샷 계산 실패')
    return 'risk_off'
  }

  // v2_regime_snapshots 테이블에 저장
  const { error } = await supabase
    .from('v2_regime_snapshots')
    .insert({
      regime: snapshot.regime,
      btc_price: snapshot.btcPrice,
      ema200: snapshot.ema200,
      rsi14: snapshot.rsi14,
      atr_pct: snapshot.atrPct,
    })

  if (error) {
    console.error('[레짐] 스냅샷 저장 오류:', error.message)
  } else {
    console.log(
      `[레짐] ${snapshot.regime} | BTC=${snapshot.btcPrice.toLocaleString()} | ` +
      `EMA200=${snapshot.ema200.toFixed(0)} | RSI=${snapshot.rsi14.toFixed(1)} | ` +
      `ATR%=${snapshot.atrPct.toFixed(2)}`
    )
  }

  return snapshot.regime
}
