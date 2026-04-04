/**
 * 백테스트 Worker Pool
 *
 * Worker Thread를 사용하여 CPU-intensive 백테스트를
 * 메인 이벤트 루프 밖에서 실행한다.
 *
 * 메인 스레드는 API 요청을 즉시 처리할 수 있고,
 * 백테스트는 별도 스레드에서 병렬 실행된다.
 */

import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import type { CandleMap, BacktestResult } from '../core/types.js'

// Worker 스크립트 경로 (컴파일된 JS)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'backtest-worker.js')

// ─── 직렬화 ─────────────────────────────────────────────────

interface SerializedCandle {
  openTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function serializeCandles(
  candleMap: CandleMap,
): Array<[string, SerializedCandle[]]> {
  const entries: Array<[string, SerializedCandle[]]> = []
  for (const [symbol, candles] of candleMap) {
    entries.push([
      symbol,
      candles.map((c) => ({
        openTime: c.openTime.toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    ])
  }
  return entries
}

// ─── 결과 역직렬화 ──────────────────────────────────────────

function deserializeResult(raw: Record<string, unknown>): BacktestResult {
  const trades = (raw.trades as Array<Record<string, unknown>>).map((t) => ({
    symbol: t.symbol as string,
    direction: t.direction as 'buy' | 'sell',
    entryPrice: t.entryPrice as number,
    exitPrice: t.exitPrice as number,
    entryTime: new Date(t.entryTime as string),
    exitTime: new Date(t.exitTime as string),
    pnlPct: t.pnlPct as number,
    reason: t.reason as string,
    fees: t.fees as number,
  }))

  return {
    strategyId: raw.strategyId as string,
    params: raw.params as Record<string, number>,
    timeframe: raw.timeframe as BacktestResult['timeframe'],
    periodStart: new Date(raw.periodStart as string),
    periodEnd: new Date(raw.periodEnd as string),
    totalReturn: raw.totalReturn as number,
    cagr: raw.cagr as number,
    sharpeRatio: raw.sharpeRatio as number,
    maxDrawdown: raw.maxDrawdown as number,
    winRate: raw.winRate as number,
    totalTrades: raw.totalTrades as number,
    avgHoldHours: raw.avgHoldHours as number,
    trades,
    equityCurve: raw.equityCurve as Array<{ t: string; equity: number }>,
  }
}

// ─── 공개 API ───────────────────────────────────────────────

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
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: {
        strategyId,
        candles: serializeCandles(allCandles),
      },
    })

    worker.on('message', (msg: { result?: Record<string, unknown>; error?: string }) => {
      if (msg.error) {
        reject(new Error(msg.error))
      } else if (msg.result) {
        resolve(deserializeResult(msg.result))
      }
    })

    worker.on('error', (err) => {
      reject(new Error(`Worker 오류: ${err.message}`))
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker 비정상 종료 (코드: ${code})`))
      }
    })
  })
}
