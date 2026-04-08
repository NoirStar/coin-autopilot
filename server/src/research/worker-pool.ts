/**
 * 백테스트 워커 풀
 *
 * 고정 크기 Worker Thread 풀로 CPU-intensive 백테스트를
 * 메인 이벤트 루프 밖에서 병렬 실행한다.
 *
 * 기존 backtest-pool.ts(1회성 Worker 생성)와 달리:
 *   - 워커를 재사용하여 스레드 생성 오버헤드 제거
 *   - 작업 큐로 동시성 제한 (CPU 코어 수 기반)
 *   - 배치 실행 (runBatch) 지원
 *
 * 사용:
 *   const pool = BacktestWorkerPool.getInstance()
 *   const result = await pool.runBacktest(strategyId, candles, paramOverrides)
 *   const results = await pool.runBatch(tasks)
 */

import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import os from 'os'
import type { CandleMap, BacktestResult } from '../core/types.js'

// ─── 워커 경로 ────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = __dirname.includes('/src/')
  ? path.resolve(__dirname, '../../dist/research/backtest-worker.js')
  : path.join(__dirname, 'backtest-worker.js')

// ─── 타입 ─────────────────────────────────────────────────────

export interface BacktestTask {
  strategyId: string
  candles: SerializedCandleEntries
  paramOverrides?: Record<string, number>
}

interface QueuedTask {
  task: BacktestTask
  resolve: (result: BacktestResult) => void
  reject: (error: Error) => void
}

interface SerializedCandle {
  openTime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type SerializedCandleEntries = Array<[string, SerializedCandle[]]>

// ─── 직렬화 ───────────────────────────────────────────────────

export function serializeCandleMap(candleMap: CandleMap): SerializedCandleEntries {
  const entries: SerializedCandleEntries = []
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
    feePct: t.feePct as number,
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

// ─── 워커 풀 ──────────────────────────────────────────────────

/**
 * 싱글톤 워커 풀
 *
 * 풀 크기: max(2, CPU 코어 - 2). 메인 스레드 + I/O에 코어 2개 남김.
 * 워커는 작업 완료 후 대기 상태로 남으며, 큐에 대기 중인 작업을 즉시 처리.
 */
export class BacktestWorkerPool {
  private static instance: BacktestWorkerPool | null = null

  private workers: Worker[] = []
  private busyWorkers = new Set<Worker>()
  private queue: QueuedTask[] = []
  private poolSize: number
  private destroyed = false

  private constructor(poolSize?: number) {
    // 환경변수 BACKTEST_WORKER_POOL_SIZE로 풀 크기 오버라이드 가능
    this.poolSize = poolSize ?? (Number(process.env.BACKTEST_WORKER_POOL_SIZE || 0) || Math.max(2, os.cpus().length - 2))
  }

  static getInstance(): BacktestWorkerPool {
    if (!BacktestWorkerPool.instance || BacktestWorkerPool.instance.destroyed) {
      BacktestWorkerPool.instance = new BacktestWorkerPool()
    }
    return BacktestWorkerPool.instance
  }

  /**
   * 단일 백테스트를 워커에서 실행
   */
  async runBacktest(
    strategyId: string,
    candles: CandleMap,
    paramOverrides?: Record<string, number>,
  ): Promise<BacktestResult> {
    const serialized = serializeCandleMap(candles)
    return this.enqueue({ strategyId, candles: serialized, paramOverrides })
  }

  /**
   * 사전 직렬화된 캔들로 단일 백테스트 실행
   *
   * 동일 캔들 데이터로 여러 파라미터 조합을 테스트할 때
   * 직렬화 비용을 1회로 줄임.
   */
  async runBacktestSerialized(
    strategyId: string,
    serializedCandles: SerializedCandleEntries,
    paramOverrides?: Record<string, number>,
  ): Promise<BacktestResult> {
    return this.enqueue({ strategyId, candles: serializedCandles, paramOverrides })
  }

  /**
   * 배치 실행 — 여러 백테스트를 병렬로 실행하고 결과 배열 반환
   *
   * 실패한 항목은 null로 반환 (전체 배치를 중단하지 않음).
   */
  async runBatch(
    tasks: Array<{
      strategyId: string
      serializedCandles: SerializedCandleEntries
      paramOverrides?: Record<string, number>
    }>,
  ): Promise<Array<BacktestResult | null>> {
    const promises = tasks.map((t) =>
      this.runBacktestSerialized(t.strategyId, t.serializedCandles, t.paramOverrides)
        .catch((err) => {
          console.error(`[워커풀] 백테스트 실패 (${t.strategyId}):`, err.message)
          return null
        }),
    )
    return Promise.all(promises)
  }

  /**
   * 풀 종료 — 모든 워커를 정리
   */
  async destroy(): Promise<void> {
    this.destroyed = true
    const terminations = this.workers.map((w) => w.terminate())
    await Promise.all(terminations)
    this.workers = []
    this.busyWorkers.clear()
    this.queue = []
    if (BacktestWorkerPool.instance === this) {
      BacktestWorkerPool.instance = null
    }
  }

  // ─── 내부 구현 ──────────────────────────────────────────────

  private enqueue(task: BacktestTask): Promise<BacktestResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.dispatch()
    })
  }

  private dispatch(): void {
    while (this.queue.length > 0 && this.busyWorkers.size < this.poolSize) {
      const queued = this.queue.shift()!
      const worker = this.getOrCreateWorker()
      this.executeOnWorker(worker, queued)
    }
  }

  private getOrCreateWorker(): Worker {
    // 유휴 워커 찾기
    for (const w of this.workers) {
      if (!this.busyWorkers.has(w)) {
        return w
      }
    }

    // 풀 크기 이내면 새 워커 생성
    if (this.workers.length < this.poolSize) {
      const worker = new Worker(WORKER_PATH)
      // 첫 워커 생성 시 풀 크기 로그
      if (this.workers.length === 0) {
        console.log(`[워커풀] 풀 크기: ${this.poolSize} (BACKTEST_WORKER_POOL_SIZE 또는 CPU 기반)`)
      }
      this.workers.push(worker)
      return worker
    }

    // 도달할 수 없음 (dispatch에서 busyWorkers.size < poolSize 조건)
    throw new Error('[워커풀] 가용 워커 없음 — 내부 오류')
  }

  private executeOnWorker(worker: Worker, queued: QueuedTask): void {
    this.busyWorkers.add(worker)

    const onMessage = (msg: { result?: Record<string, unknown>; error?: string }) => {
      cleanup()
      if (msg.error) {
        queued.reject(new Error(msg.error))
      } else if (msg.result) {
        queued.resolve(deserializeResult(msg.result))
      }
      this.busyWorkers.delete(worker)
      this.dispatch()
    }

    const onError = (err: Error) => {
      cleanup()
      queued.reject(new Error(`워커 오류: ${err.message}`))
      this.replaceWorker(worker)
      this.dispatch()
    }

    const onExit = (code: number) => {
      cleanup()
      if (code !== 0) {
        queued.reject(new Error(`워커 비정상 종료 (코드: ${code})`))
        this.replaceWorker(worker)
        this.dispatch()
      }
    }

    const cleanup = () => {
      worker.removeListener('message', onMessage)
      worker.removeListener('error', onError)
      worker.removeListener('exit', onExit)
    }

    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)

    // 워커에 작업 전달
    worker.postMessage({
      strategyId: queued.task.strategyId,
      candles: queued.task.candles,
      paramOverrides: queued.task.paramOverrides,
    })
  }

  /**
   * 비정상 종료된 워커를 교체
   */
  private replaceWorker(deadWorker: Worker): void {
    this.busyWorkers.delete(deadWorker)
    const idx = this.workers.indexOf(deadWorker)
    if (idx !== -1) {
      this.workers.splice(idx, 1)
    }
    // 다음 dispatch에서 새 워커가 생성됨
  }
}
