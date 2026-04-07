/**
 * 백테스트 Worker Pool (레거시 호환 래퍼)
 *
 * 기존 runBacktestInWorker API를 유지하면서
 * 내부적으로 BacktestWorkerPool을 사용한다.
 *
 * 레거시 모드(research-loop.ts runLegacyMode)에서 호출.
 */

import type { CandleMap, BacktestResult } from '../core/types.js'
import { BacktestWorkerPool } from './worker-pool.js'

/**
 * Worker Thread에서 백테스트 실행
 *
 * 메인 스레드를 차단하지 않으므로 API 요청이
 * 백테스트 중에도 즉시 응답된다.
 */
export function runBacktestInWorker(
  strategyId: string,
  allCandles: CandleMap,
): Promise<BacktestResult> {
  const pool = BacktestWorkerPool.getInstance()
  return pool.runBacktest(strategyId, allCandles)
}
