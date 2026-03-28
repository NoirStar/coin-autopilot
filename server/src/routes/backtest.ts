import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import { BtcEmaCrossoverStrategy } from '../strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../strategy/btc-bollinger-reversion.js'
import { AltDetectionStrategy } from '../strategy/alt-detection-strategy.js'
import { runBacktest } from '../services/backtest-engine.js'
import { fetchUpbitKrwSymbols } from '../data/candle-collector.js'
import { supabase } from '../services/database.js'
import type { Candle, CandleMap, Timeframe } from '../strategy/strategy-base.js'

export const backtestRoutes = new Hono()

const UPBIT_API = 'https://api.upbit.com/v1'
const OKX_API = 'https://www.okx.com/api/v5'

const UPBIT_TF_MINUTES: Partial<Record<Timeframe, number>> = {
  '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
}
const OKX_BAR: Partial<Record<Timeframe, string>> = {
  '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D',
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 업비트에서 직접 캔들 수집 (페이징으로 최대 count개) */
async function fetchUpbitDirect(market: string, tf: Timeframe, count: number): Promise<Candle[]> {
  const minutes = UPBIT_TF_MINUTES[tf] ?? 240
  const all: Candle[] = []
  let to: string | undefined

  while (all.length < count) {
    const batch = Math.min(200, count - all.length)
    const url = new URL(`${UPBIT_API}/candles/minutes/${minutes}`)
    url.searchParams.set('market', market)
    url.searchParams.set('count', String(batch))
    if (to) url.searchParams.set('to', to)

    const res = await fetch(url.toString())
    if (res.status === 429) { await sleep(1000); continue }
    if (!res.ok) break

    const data = await res.json() as Array<{
      candle_date_time_utc: string
      opening_price: number; high_price: number; low_price: number
      trade_price: number; candle_acc_trade_volume: number
    }>
    if (data.length === 0) break

    const candles = data.map((d) => ({
      openTime: new Date(d.candle_date_time_utc + 'Z'),
      open: d.opening_price, high: d.high_price, low: d.low_price,
      close: d.trade_price, volume: d.candle_acc_trade_volume,
    }))

    all.unshift(...candles.reverse())
    to = data[data.length - 1].candle_date_time_utc.replace(/\.\d{3}$/, '')
    await sleep(130)
    if (data.length < batch) break
  }

  return all
}

/** OKX에서 직접 캔들 수집 (페이징) */
async function fetchOkxDirect(instId: string, tf: Timeframe, count: number): Promise<Candle[]> {
  const bar = OKX_BAR[tf] ?? '4H'
  const all: Candle[] = []
  let after: string | undefined

  while (all.length < count) {
    const limit = Math.min(100, count - all.length)
    const url = new URL(`${OKX_API}/market/candles`)
    url.searchParams.set('instId', instId)
    url.searchParams.set('bar', bar)
    url.searchParams.set('limit', String(limit))
    if (after) url.searchParams.set('after', after)

    const res = await fetch(url.toString())
    if (!res.ok) break

    const json = await res.json() as { data: string[][] }
    if (!json.data || json.data.length === 0) break

    const candles = json.data.map((d) => ({
      openTime: new Date(parseInt(d[0])),
      open: parseFloat(d[1]), high: parseFloat(d[2]),
      low: parseFloat(d[3]), close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }))

    all.unshift(...candles.reverse())
    after = json.data[json.data.length - 1][0]
    await sleep(100)
    if (json.data.length < limit) break
  }

  return all
}

/** 업비트 전략용 심볼은 동적으로 조회, OKX는 ETH만 */
const OKX_TARGET = ['ETH']

const runBacktestSchema = z.object({
  strategyId: z.enum(['alt_mean_reversion', 'btc_ema_crossover', 'btc_bollinger_reversion', 'alt_detection']).default('alt_mean_reversion'),
  initialCapital: z.number().min(100_000).max(1_000_000_000).default(10_000_000),
  params: z.object({
    zScoreEntry: z.number().min(-3).max(0).optional(),
    zScoreExit: z.number().min(-1).max(2).optional(),
    rsiMax: z.number().min(50).max(95).optional(),
    maxPositions: z.number().int().min(1).max(10).optional(),
    atrStopMult: z.number().min(1).max(5).optional(),
    timeLimitCandles: z.number().int().min(1).max(50).optional(),
  }).optional(),
})

/** POST /api/backtest/run — 백테스트 실행 (동기) */
backtestRoutes.post('/run', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = runBacktestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청 파라미터', details: parsed.error.flatten() }, 400)
  }

  const { strategyId, initialCapital, params } = parsed.data

  try {
    // 전략 인스턴스 생성
    let strategy
    if (strategyId === 'alt_mean_reversion') {
      strategy = new AltMeanReversionStrategy(params)
    } else if (strategyId === 'btc_ema_crossover') {
      strategy = new BtcEmaCrossoverStrategy(params)
    } else if (strategyId === 'btc_bollinger_reversion') {
      strategy = new BtcBollingerReversionStrategy(params)
    } else if (strategyId === 'alt_detection') {
      strategy = new AltDetectionStrategy(params)
    } else {
      return c.json({ error: '지원하지 않는 전략입니다' }, 400)
    }

    // 직접 API에서 캔들 로드 (전략의 거래소에 맞춰 분기)
    const candleMap: CandleMap = new Map()
    const exchange = strategy.config.exchange === 'okx' ? 'okx' : 'upbit'
    const timeframe = strategy.config.timeframe

    let btcCandles: Candle[]
    if (exchange === 'okx') {
      btcCandles = await fetchOkxDirect('BTC-USDT', timeframe, 2000)
    } else {
      btcCandles = await fetchUpbitDirect('KRW-BTC', timeframe, 2000)
    }
    if (btcCandles.length < 201) {
      return c.json({ error: `BTC 캔들 데이터가 부족합니다 (${btcCandles.length}/201)` }, 422)
    }
    candleMap.set('BTC', btcCandles)

    // OKX 선물 전략은 ETH만, 업비트 전략은 KRW 마켓 동적 조회
    let symbols: string[]
    if (exchange === 'okx') {
      symbols = OKX_TARGET
    } else {
      const allKrw = await fetchUpbitKrwSymbols()
      // 상위 20개만 사용 (백테스트 속도)
      symbols = allKrw.slice(0, 20)
    }
    for (const symbol of symbols) {
      try {
        let candles: Candle[]
        if (exchange === 'okx') {
          candles = await fetchOkxDirect(`${symbol}-USDT`, timeframe, 2000)
        } else {
          candles = await fetchUpbitDirect(`KRW-${symbol}`, timeframe, 2000)
        }
        if (candles.length > 0) candleMap.set(symbol, candles)
      } catch {
        // 개별 코인 실패 스킵
      }
    }

    // 백테스트 실행
    const result = runBacktest(strategy, candleMap, { initialCapital })

    // DB에 결과 저장 (user_id=null → 시스템 레벨 공개 결과)
    const { data: saved, error: saveError } = await supabase
      .from('backtest_results')
      .insert({
        user_id: null,
        strategy: result.strategyId,
        params: result.params,
        timeframe: result.timeframe,
        period_start: result.periodStart instanceof Date ? result.periodStart.toISOString().slice(0, 10) : result.periodStart,
        period_end: result.periodEnd instanceof Date ? result.periodEnd.toISOString().slice(0, 10) : result.periodEnd,
        total_return: result.totalReturn,
        cagr: result.cagr,
        sharpe_ratio: result.sharpeRatio,
        max_drawdown: result.maxDrawdown,
        win_rate: result.winRate,
        total_trades: result.totalTrades,
        avg_hold_hours: result.avgHoldHours,
        equity_curve: result.equityCurve,
      })
      .select('id')
      .single()

    if (saveError) {
      console.error('백테스트 결과 저장 오류:', saveError.message)
    }

    return c.json({
      id: saved?.id ?? null,
      ...result,
      periodStart: result.periodStart instanceof Date ? result.periodStart.toISOString() : result.periodStart,
      periodEnd: result.periodEnd instanceof Date ? result.periodEnd.toISOString() : result.periodEnd,
      trades: result.trades.map((t) => ({
        ...t,
        entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime,
        exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime,
      })),
    })
  } catch (err) {
    console.error('백테스트 실행 오류:', err)
    return c.json({ error: '백테스트 실행 중 오류가 발생했습니다' }, 500)
  }
})

/** POST /api/backtest/run/stream — SSE 스트리밍 백테스트 */
backtestRoutes.post('/run/stream', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = runBacktestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청 파라미터', details: parsed.error.flatten() }, 400)
  }

  const { strategyId, initialCapital, params } = parsed.data

  return streamSSE(c, async (stream) => {
    try {
      let strategy
      if (strategyId === 'alt_mean_reversion') {
        strategy = new AltMeanReversionStrategy(params)
      } else if (strategyId === 'btc_ema_crossover') {
        strategy = new BtcEmaCrossoverStrategy(params)
      } else if (strategyId === 'btc_bollinger_reversion') {
        strategy = new BtcBollingerReversionStrategy(params)
      } else if (strategyId === 'alt_detection') {
        strategy = new AltDetectionStrategy(params)
      } else {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: '지원하지 않는 전략' }), event: 'bt-error' })
        return
      }

      const candleMap: CandleMap = new Map()
      const exchange = strategy.config.exchange === 'okx' ? 'okx' : 'upbit'
      const timeframe = strategy.config.timeframe

      let symbols: string[]
      if (exchange === 'okx') {
        symbols = OKX_TARGET
      } else {
        const allKrw = await fetchUpbitKrwSymbols()
        symbols = allKrw.slice(0, 20)
      }

      const totalSteps = 1 + symbols.length

      await stream.writeSSE({
        data: JSON.stringify({ type: 'progress', phase: 'candles', current: 0, total: totalSteps, detail: 'BTC 캔들 로딩...' }),
        event: 'progress',
      })

      let btcCandles: Candle[]
      if (exchange === 'okx') {
        btcCandles = await fetchOkxDirect('BTC-USDT', timeframe, 2000)
      } else {
        btcCandles = await fetchUpbitDirect('KRW-BTC', timeframe, 2000)
      }
      if (btcCandles.length < 201) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: `BTC 캔들 부족 (${btcCandles.length}/201)` }), event: 'bt-error' })
        return
      }
      candleMap.set('BTC', btcCandles)

      await stream.writeSSE({
        data: JSON.stringify({ type: 'progress', phase: 'candles', current: 1, total: totalSteps, detail: `BTC ${btcCandles.length}개 완료` }),
        event: 'progress',
      })

      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i]
        await stream.writeSSE({
          data: JSON.stringify({ type: 'progress', phase: 'candles', current: i + 2, total: totalSteps, detail: `${symbol} 캔들 로딩...` }),
          event: 'progress',
        })

        try {
          let candles: Candle[]
          if (exchange === 'okx') {
            candles = await fetchOkxDirect(`${symbol}-USDT`, timeframe, 2000)
          } else {
            candles = await fetchUpbitDirect(`KRW-${symbol}`, timeframe, 2000)
          }
          if (candles.length > 0) candleMap.set(symbol, candles)
        } catch {
          // skip
        }
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: 'progress', phase: 'backtest', current: totalSteps, total: totalSteps, detail: '백테스트 실행 중...' }),
        event: 'progress',
      })

      const result = runBacktest(strategy, candleMap, { initialCapital })

      await stream.writeSSE({
        data: JSON.stringify({ type: 'progress', phase: 'saving', current: totalSteps, total: totalSteps, detail: '결과 저장 중...' }),
        event: 'progress',
      })

      const { data: saved, error: saveError } = await supabase
        .from('backtest_results')
        .insert({
          user_id: null,
          strategy: result.strategyId,
          params: result.params,
          timeframe: result.timeframe,
          period_start: result.periodStart instanceof Date ? result.periodStart.toISOString().slice(0, 10) : result.periodStart,
          period_end: result.periodEnd instanceof Date ? result.periodEnd.toISOString().slice(0, 10) : result.periodEnd,
          total_return: result.totalReturn,
          cagr: result.cagr,
          sharpe_ratio: result.sharpeRatio,
          max_drawdown: result.maxDrawdown,
          win_rate: result.winRate,
          total_trades: result.totalTrades,
          avg_hold_hours: result.avgHoldHours,
          equity_curve: result.equityCurve,
        })
        .select('id')
        .single()

      if (saveError) console.error('백테스트 결과 저장 오류:', saveError.message)

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'complete',
          result: {
            id: saved?.id ?? null,
            ...result,
            periodStart: result.periodStart instanceof Date ? result.periodStart.toISOString() : result.periodStart,
            periodEnd: result.periodEnd instanceof Date ? result.periodEnd.toISOString() : result.periodEnd,
            trades: result.trades.map((t) => ({
              ...t,
              entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime,
              exitTime: t.exitTime instanceof Date ? t.exitTime.toISOString() : t.exitTime,
            })),
          },
        }),
        event: 'complete',
      })
    } catch (err) {
      console.error('SSE 백테스트 오류:', err)
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: '백테스트 실행 실패' }),
        event: 'bt-error',
      })
    }
  })
})

/** GET /api/backtest/results — 저장된 백테스트 결과 목록 */
backtestRoutes.get('/results', async (c) => {
  const { data, error } = await supabase
    .from('backtest_results')
    .select('id, strategy, params, timeframe, period_start, period_end, total_return, cagr, sharpe_ratio, max_drawdown, win_rate, total_trades, avg_hold_hours, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ data })
})

/** GET /api/backtest/results/:id — 단일 백테스트 결과 (에퀴티 커브 포함) */
backtestRoutes.get('/results/:id', async (c) => {
  const id = c.req.param('id')
  const { data, error } = await supabase
    .from('backtest_results')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return c.json({ error: error.message }, 404)
  return c.json({ data })
})
