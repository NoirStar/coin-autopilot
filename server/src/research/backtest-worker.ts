/**
 * 백테스트 Worker Thread
 *
 * 메인 스레드의 이벤트 루프를 차단하지 않도록
 * CPU-intensive 백테스트를 별도 스레드에서 실행한다.
 *
 * 동작 모드:
 *   1. 풀 모드 (parentPort.on 'message'): 워커 풀에서 재사용 — 여러 작업 처리
 *   2. 레거시 모드 (workerData): 1회성 실행 후 종료 (하위 호환)
 *
 * 데이터 흐름:
 *   메인 → Worker: { strategyId, candles, paramOverrides? }
 *   Worker → 메인: { result } 또는 { error }
 */

import { parentPort, workerData } from 'worker_threads'

// 전략 레지스트리 로드 (모듈 import 시 registerStrategy 자동 호출)
import '../strategy/btc-ema-crossover.js'
import '../strategy/btc-bollinger-reversion.js'
import '../strategy/btc-macd-momentum.js'
import '../strategy/btc-donchian-breakout.js'
import '../strategy/alt-mean-reversion.js'
import '../strategy/alt-detection.js'

import { getStrategy } from '../strategy/registry.js'
import { createStrategyInstance } from '../strategy/factory.js'
import { runBacktest } from './backtest-engine.js'
import type { CandleMap } from '../core/types.js'

// ─── 직렬화 타입 ─────────────────────────────────────────────

interface SerializedCandle {
  openTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface WorkerInput {
  strategyId: string
  candles: Array<[string, SerializedCandle[]]>
  paramOverrides?: Record<string, number>
}

// ─── 역직렬화 ────────────────────────────────────────────────

function deserializeCandles(data: Array<[string, SerializedCandle[]]>): CandleMap {
  const map: CandleMap = new Map()
  for (const [symbol, candles] of data) {
    map.set(symbol, candles.map((c) => ({
      openTime: new Date(c.openTime),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })))
  }
  return map
}

// ─── 공통 실행 로직 ─────────────────────────────────────────

function executeBacktest(input: WorkerInput): Record<string, unknown> {
  // 파라미터 오버라이드가 있으면 factory로 인스턴스 생성
  const strategy = input.paramOverrides
    ? createStrategyInstance(input.strategyId, input.paramOverrides)
    : getStrategy(input.strategyId)

  if (!strategy) {
    throw new Error(`전략 미등록: ${input.strategyId}`)
  }

  const candleMap = deserializeCandles(input.candles)
  const result = runBacktest(strategy, candleMap)

  return {
    ...result,
    periodStart: result.periodStart.toISOString(),
    periodEnd: result.periodEnd.toISOString(),
    trades: result.trades.map((t) => ({
      ...t,
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime.toISOString(),
    })),
  }
}

// ─── 풀 모드: parentPort 메시지 수신 ─────────────────────────

if (parentPort) {
  // workerData가 있으면 레거시 모드 (1회 실행)
  if (workerData && workerData.strategyId) {
    try {
      const result = executeBacktest(workerData as WorkerInput)
      parentPort.postMessage({ result })
    } catch (err) {
      parentPort.postMessage({
        error: err instanceof Error ? err.message : String(err),
      })
      process.exit(1)
    }
  } else {
    // 풀 모드: 메시지를 계속 수신
    parentPort.on('message', (input: WorkerInput) => {
      try {
        const result = executeBacktest(input)
        parentPort!.postMessage({ result })
      } catch (err) {
        parentPort!.postMessage({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }
}
