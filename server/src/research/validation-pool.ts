/**
 * 워커 풀 기반 검증 실행기
 *
 * validation-engine.ts의 검증 로직을 워커 풀에서 실행한다.
 * IS/OOS + WF 구간별 백테스트를 병렬로 실행하고,
 * 검증 기준 평가는 메인 스레드에서 수행 (CPU 부담 없음).
 */

import type { CandleMap } from '../core/types.js'
import type { ParamSet } from './param-explorer.js'
import {
  createISOOSPlan,
  createWalkForwardPlan,
  calculateExpectedValue,
  type ValidationResult,
  type SegmentResult,
  type ValidationSegment,
} from './validation-engine.js'
import { BacktestWorkerPool, serializeCandleMap } from './worker-pool.js'

// ─── 검증 기준 (validation-engine.ts와 동일) ──────────────────

const VALIDATION_CRITERIA = {
  minOosEv: 0,
  minWfMedianEv: 0,
  maxMdd: 20,
  minTotalTrades: 20,
  minWfFoldTrades: 5,
}

// ─── 공개 API ─────────────────────────────────────────────────

/**
 * 워커 풀에서 전체 검증 실행
 *
 * IS/OOS + WF 구간별 캔들을 슬라이스하고,
 * 각 구간 백테스트를 워커에 분배하여 병렬 실행한다.
 *
 * @param strategyId 전략 ID
 * @param paramSet 파라미터 조합
 * @param allCandles 전체 캔들 데이터
 */
export async function runFullValidationInPool(
  strategyId: string,
  paramSet: ParamSet,
  allCandles: CandleMap,
): Promise<ValidationResult> {
  const pool = BacktestWorkerPool.getInstance()

  // 기준 캔들 수 파악 (최대 길이)
  let totalCandles = 0
  for (const [, candles] of allCandles) {
    if (candles.length > totalCandles) totalCandles = candles.length
  }

  // 1. IS/OOS 검증 플랜
  const isooPlan = createISOOSPlan(totalCandles)
  const isSegment = isooPlan.segments[0]
  const oosSegment = isooPlan.segments[1]

  // 2. Walk-Forward 검증 플랜
  const wfPlan = createWalkForwardPlan(totalCandles)
  const wfOosSegments = wfPlan.segments.filter((s) => s.role === 'walk_forward')

  // 3. 모든 구간의 캔들을 슬라이스 + 직렬화
  const allSegments = [isSegment, oosSegment, ...wfOosSegments]

  const segmentTasks = allSegments.map((segment) => {
    const segmentCandles = sliceCandles(allCandles, segment)
    return {
      strategyId,
      serializedCandles: serializeCandleMap(segmentCandles),
      paramOverrides: paramSet,
    }
  })

  // 4. 모든 구간 백테스트를 병렬 실행
  const batchResults = await pool.runBatch(segmentTasks)

  // 5. 결과를 SegmentResult로 변환
  const segmentResults: SegmentResult[] = allSegments.map((segment, i) => {
    const btResult = batchResults[i]
    const ev = btResult ? calculateExpectedValue(btResult) : 0

    // 날짜 추출
    let startDate = new Date()
    let endDate = new Date()
    for (const [, candles] of allCandles) {
      if (candles.length > 0) {
        const warmupStart = Math.max(0, segment.startIndex - 200)
        const evalStartIdx = Math.min(segment.startIndex - warmupStart, candles.length - 1)
        const sliced = candles.slice(warmupStart, segment.endIndex)
        if (sliced.length > 0) {
          startDate = sliced[Math.min(evalStartIdx, sliced.length - 1)]?.openTime ?? new Date()
          endDate = sliced[sliced.length - 1]?.openTime ?? new Date()
          break
        }
      }
    }

    return {
      segment,
      startDate,
      endDate,
      candleCount: segment.endIndex - segment.startIndex,
      totalReturn: btResult?.totalReturn ?? 0,
      maxDrawdown: btResult?.maxDrawdown ?? 100,
      expectedValue: ev,
      winRate: btResult?.winRate ?? 0,
      tradeCount: btResult?.totalTrades ?? 0,
      sharpe: btResult?.sharpeRatio ?? 0,
    }
  })

  const isResult = segmentResults[0]
  const oosResult = segmentResults[1]
  const wfResults = segmentResults.slice(2)

  // 6. 검증 기준 평가
  const reasons: string[] = []

  if (oosResult.expectedValue <= VALIDATION_CRITERIA.minOosEv) {
    reasons.push(`OOS EV ${oosResult.expectedValue.toFixed(2)} <= ${VALIDATION_CRITERIA.minOosEv}`)
  }

  const wfEvs = wfResults.map((r) => r.expectedValue).sort((a, b) => a - b)
  const medianWfEv = wfEvs.length > 0 ? wfEvs[Math.floor(wfEvs.length / 2)] : -1
  if (medianWfEv <= VALIDATION_CRITERIA.minWfMedianEv) {
    reasons.push(`WF 중앙값 EV ${medianWfEv.toFixed(2)} <= ${VALIDATION_CRITERIA.minWfMedianEv}`)
  }

  const allSegResults = [isResult, oosResult, ...wfResults]
  for (const seg of allSegResults) {
    if (seg.maxDrawdown > VALIDATION_CRITERIA.maxMdd) {
      reasons.push(`${seg.segment.name} MDD ${seg.maxDrawdown.toFixed(1)}% > ${VALIDATION_CRITERIA.maxMdd}%`)
    }
  }

  const totalTrades = isResult.tradeCount + oosResult.tradeCount
  if (totalTrades < VALIDATION_CRITERIA.minTotalTrades) {
    reasons.push(`전체 거래 ${totalTrades} < ${VALIDATION_CRITERIA.minTotalTrades}`)
  }

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

// ─── 내부: 구간 캔들 슬라이스 ─────────────────────────────────

/**
 * validation-engine.ts의 runSegmentBacktest와 동일한 슬라이스 로직
 *
 * 워밍업 200개 포함하여 segment 구간의 캔들만 추출
 */
function sliceCandles(allCandles: CandleMap, segment: ValidationSegment): CandleMap {
  const warmupStart = Math.max(0, segment.startIndex - 200)
  const segmentCandles: CandleMap = new Map()

  for (const [symbol, candles] of allCandles) {
    segmentCandles.set(symbol, candles.slice(warmupStart, segment.endIndex))
  }

  return segmentCandles
}
