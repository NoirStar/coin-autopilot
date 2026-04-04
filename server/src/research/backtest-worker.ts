/**
 * 백테스트 Worker Thread
 *
 * 메인 스레드의 이벤트 루프를 차단하지 않도록
 * CPU-intensive 백테스트를 별도 스레드에서 실행한다.
 *
 * 데이터 흐름:
 *   메인 → Worker: { strategyId, candles (직렬화) }
 *   Worker → 메인: { result (직렬화) } 또는 { error }
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
import { runBacktest } from './backtest-engine.js'
import type { CandleMap, Candle } from '../core/types.js'

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

// ─── 메인 실행 ───────────────────────────────────────────────

const input = workerData as WorkerInput

try {
  const strategy = getStrategy(input.strategyId)
  if (!strategy) {
    parentPort?.postMessage({ error: `전략 미등록: ${input.strategyId}` })
    process.exit(1)
  }

  const candleMap = deserializeCandles(input.candles)
  const result = runBacktest(strategy, candleMap)

  // BacktestResult 직렬화 (Date → string)
  const serialized = {
    ...result,
    periodStart: result.periodStart.toISOString(),
    periodEnd: result.periodEnd.toISOString(),
    trades: result.trades.map((t) => ({
      ...t,
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime.toISOString(),
    })),
  }

  parentPort?.postMessage({ result: serialized })
} catch (err) {
  parentPort?.postMessage({
    error: err instanceof Error ? err.message : String(err),
  })
  process.exit(1)
}
