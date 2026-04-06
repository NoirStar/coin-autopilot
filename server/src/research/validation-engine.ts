/**
 * IS/OOS/Walk-Forward 검증 엔진
 *
 * 백테스트 결과를 구간별로 분할하여 과최적화를 방지한다.
 *
 * - IS (In-Sample): 전체 캔들의 70% — 파라미터 탐색에 사용
 * - OOS (Out-of-Sample): 전체 캔들의 30% — 검증에 사용
 * - Walk-Forward: 3-fold 슬라이딩 윈도우, 각 fold IS 70% / OOS 30%
 *
 * Expected Value 계산: (평균 수익 * 승률) - (평균 손실 * 패률) - 평균 수수료
 * feePct 단위로 통일되어 spot/futures 비교 가능
 */

import type {
  Strategy,
  CandleMap,
  Candle,
  BacktestResult,
  BacktestTrade,
} from '../core/types.js'
import { runBacktest } from './backtest-engine.js'

// ─── 타입 ─────────────────────────────────────────────────────

export interface ValidationSegment {
  name: string
  role: 'in_sample' | 'out_of_sample' | 'walk_forward'
  startIndex: number
  endIndex: number
}

export interface ValidationPlan {
  type: 'is_oos' | 'walk_forward'
  segments: ValidationSegment[]
}

export interface SegmentResult {
  segment: ValidationSegment
  startDate: Date
  endDate: Date
  candleCount: number
  totalReturn: number
  maxDrawdown: number
  expectedValue: number
  winRate: number
  tradeCount: number
  sharpe: number
}

export interface ValidationResult {
  isOos: {
    is: SegmentResult
    oos: SegmentResult
  }
  walkForward: SegmentResult[]   // OOS fold 결과만
  overallPass: boolean
  reasons: string[]              // 실패 사유
}

// ─── 검증 기준 ────────────────────────────────────────────────

const VALIDATION_CRITERIA = {
  minOosEv: 0,            // OOS EV > 0
  minWfMedianEv: 0,       // WF 중앙값 EV > 0
  maxMdd: 20,             // 구간 MDD < 20%
  minTotalTrades: 20,     // 전체 최소 거래 수
  minWfFoldTrades: 5,     // WF fold당 최소 거래 수
}

// ─── 검증 플랜 생성 ───────────────────────────────────────────

/**
 * IS/OOS 70/30 분할 플랜 생성
 *
 * @param totalCandles 전체 캔들 수 (워밍업 200개 포함)
 * @param warmup 워밍업 캔들 수 (기본 200)
 */
export function createISOOSPlan(totalCandles: number, warmup: number = 200): ValidationPlan {
  const evalStart = warmup
  const evalEnd = totalCandles
  const evalLength = evalEnd - evalStart
  const splitIndex = evalStart + Math.floor(evalLength * 0.7)

  return {
    type: 'is_oos',
    segments: [
      { name: 'IS', role: 'in_sample', startIndex: evalStart, endIndex: splitIndex },
      { name: 'OOS', role: 'out_of_sample', startIndex: splitIndex, endIndex: evalEnd },
    ],
  }
}

/**
 * Walk-Forward 슬라이딩 윈도우 플랜 생성
 *
 * 전체 평가 구간을 folds개로 나누고, 각 fold에서 IS 70% / OOS 30%
 *
 * @param totalCandles 전체 캔들 수 (워밍업 포함)
 * @param folds fold 수 (기본 3)
 * @param warmup 워밍업 캔들 수 (기본 200)
 */
export function createWalkForwardPlan(
  totalCandles: number,
  folds: number = 3,
  warmup: number = 200,
): ValidationPlan {
  const evalStart = warmup
  const evalEnd = totalCandles
  const evalLength = evalEnd - evalStart

  // 각 fold의 전체 길이 (겹치지 않는 OOS 영역 기준으로 분배)
  // IS는 OOS 앞쪽에서 가져오되, 최소 fold 크기 보장
  const oosPerFold = Math.floor(evalLength / folds)
  const segments: ValidationSegment[] = []

  for (let f = 0; f < folds; f++) {
    const foldOosStart = evalStart + f * oosPerFold
    const foldOosEnd = f === folds - 1 ? evalEnd : foldOosStart + oosPerFold

    // IS: fold 시작까지의 모든 데이터 (최소 워밍업 이후)
    // 첫 fold는 IS가 없으므로 OOS만 사용 (training 없이 검증)
    // → 변경: 각 fold에서 IS = 전체 0~foldOosStart, OOS = foldOosStart~foldOosEnd
    const isStart = evalStart
    const isEnd = foldOosStart

    if (isEnd > isStart + 50) { // IS 구간이 의미 있는 크기인 경우만
      segments.push({
        name: `WF_fold_${f + 1}_IS`,
        role: 'in_sample',
        startIndex: isStart,
        endIndex: isEnd,
      })
    }

    segments.push({
      name: `WF_fold_${f + 1}_OOS`,
      role: 'walk_forward',
      startIndex: foldOosStart,
      endIndex: foldOosEnd,
    })
  }

  return { type: 'walk_forward', segments }
}

// ─── 검증 실행 ────────────────────────────────────────────────

/**
 * 전략 + 파라미터 조합에 대해 전체 검증을 실행
 *
 * 1. IS/OOS 70/30 분할 백테스트
 * 2. Walk-Forward 3-fold 백테스트
 * 3. 검증 기준 평가
 *
 * @param strategy 전략 인스턴스 (파라미터 오버라이드 적용 완료)
 * @param allCandles 전체 캔들 데이터
 * @returns ValidationResult
 */
export function runFullValidation(
  strategy: Strategy,
  allCandles: CandleMap,
): ValidationResult {
  // 기준 캔들 수 파악 (BTC 캔들 기준)
  let totalCandles = 0
  for (const [, candles] of allCandles) {
    if (candles.length > totalCandles) totalCandles = candles.length
  }

  // 1. IS/OOS 검증
  const isooPlan = createISOOSPlan(totalCandles)
  const isResult = runSegmentBacktest(strategy, allCandles, isooPlan.segments[0])
  const oosResult = runSegmentBacktest(strategy, allCandles, isooPlan.segments[1])

  // 2. Walk-Forward 검증
  const wfPlan = createWalkForwardPlan(totalCandles)
  const wfOosSegments = wfPlan.segments.filter((s) => s.role === 'walk_forward')
  const wfResults = wfOosSegments.map((seg) => runSegmentBacktest(strategy, allCandles, seg))

  // 3. 검증 기준 평가
  const reasons: string[] = []

  // OOS EV > 0
  if (oosResult.expectedValue <= VALIDATION_CRITERIA.minOosEv) {
    reasons.push(`OOS EV ${oosResult.expectedValue.toFixed(2)} <= ${VALIDATION_CRITERIA.minOosEv}`)
  }

  // WF 중앙값 EV > 0
  const wfEvs = wfResults.map((r) => r.expectedValue).sort((a, b) => a - b)
  const medianWfEv = wfEvs.length > 0
    ? wfEvs[Math.floor(wfEvs.length / 2)]
    : -1
  if (medianWfEv <= VALIDATION_CRITERIA.minWfMedianEv) {
    reasons.push(`WF 중앙값 EV ${medianWfEv.toFixed(2)} <= ${VALIDATION_CRITERIA.minWfMedianEv}`)
  }

  // 구간 MDD
  const allSegResults = [isResult, oosResult, ...wfResults]
  for (const seg of allSegResults) {
    if (seg.maxDrawdown > VALIDATION_CRITERIA.maxMdd) {
      reasons.push(`${seg.segment.name} MDD ${seg.maxDrawdown.toFixed(1)}% > ${VALIDATION_CRITERIA.maxMdd}%`)
    }
  }

  // 전체 거래 수
  const totalTrades = isResult.tradeCount + oosResult.tradeCount
  if (totalTrades < VALIDATION_CRITERIA.minTotalTrades) {
    reasons.push(`전체 거래 ${totalTrades} < ${VALIDATION_CRITERIA.minTotalTrades}`)
  }

  // WF fold당 최소 거래
  for (const wfRes of wfResults) {
    if (wfRes.tradeCount < VALIDATION_CRITERIA.minWfFoldTrades) {
      reasons.push(`${wfRes.segment.name} 거래 ${wfRes.tradeCount} < ${VALIDATION_CRITERIA.minWfFoldTrades}`)
    }
  }

  return {
    isOos: { is: isResult, oos: oosResult },
    walkForward: wfResults,
    overallPass: reasons.length === 0,
    reasons,
  }
}

// ─── 구간별 백테스트 ──────────────────────────────────────────

/**
 * 특정 구간의 캔들만 잘라서 백테스트 실행
 *
 * 워밍업을 위해 startIndex 이전 200개 캔들도 포함하되,
 * 실제 평가는 startIndex~endIndex 구간만.
 */
function runSegmentBacktest(
  strategy: Strategy,
  allCandles: CandleMap,
  segment: ValidationSegment,
): SegmentResult {
  // 워밍업 포함 캔들 슬라이스
  const warmupStart = Math.max(0, segment.startIndex - 200)
  const segmentCandles: CandleMap = new Map()
  let startDate = new Date()
  let endDate = new Date()

  for (const [symbol, candles] of allCandles) {
    const sliced = candles.slice(warmupStart, segment.endIndex)
    segmentCandles.set(symbol, sliced)

    // 날짜 추출 (첫 심볼 기준)
    if (sliced.length > 0 && startDate.getTime() === new Date().getTime()) {
      const evalStartIdx = Math.min(segment.startIndex - warmupStart, sliced.length - 1)
      startDate = sliced[evalStartIdx]?.openTime ?? new Date()
      endDate = sliced[sliced.length - 1]?.openTime ?? new Date()
    }
  }

  const result = runBacktest(strategy, segmentCandles)
  const ev = calculateExpectedValue(result)

  return {
    segment,
    startDate,
    endDate,
    candleCount: segment.endIndex - segment.startIndex,
    totalReturn: result.totalReturn,
    maxDrawdown: result.maxDrawdown,
    expectedValue: ev,
    winRate: result.winRate,
    tradeCount: result.totalTrades,
    sharpe: result.sharpeRatio,
  }
}

// ─── Expected Value 계산 ──────────────────────────────────────

/**
 * 기대값 계산 (feePct 단위 통일)
 *
 * EV = (평균 수익% × 승률) - (평균 손실% × 패률) - 평균 수수료%
 *
 * 모든 값이 % 단위이므로 spot/futures/leverage 비교 가능
 */
export function calculateExpectedValue(result: BacktestResult): number {
  if (result.trades.length === 0) return 0

  const wins = result.trades.filter((t) => t.pnlPct > 0)
  const losses = result.trades.filter((t) => t.pnlPct <= 0)

  const avgWinPct = wins.length > 0
    ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length
    : 0
  const avgLossPct = losses.length > 0
    ? Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length)
    : 0

  const winRate = wins.length / result.trades.length
  const avgFeePct = result.trades.reduce((s, t) => s + t.feePct, 0) / result.trades.length

  return (avgWinPct * winRate) - (avgLossPct * (1 - winRate)) - avgFeePct
}
