import { Hono } from 'hono'
import { z } from 'zod'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import { BtcEmaCrossoverStrategy } from '../strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../strategy/btc-bollinger-reversion.js'
import { AltDetectionStrategy } from '../strategy/alt-detection-strategy.js'
import { loadCandles } from '../data/candle-collector.js'
import { runBacktest } from '../services/backtest-engine.js'
import { supabase } from '../services/database.js'
import type { CandleMap } from '../strategy/strategy-base.js'

export const backtestRoutes = new Hono()

const TARGET_SYMBOLS = ['ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'ATOM']

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

    // DB에서 캔들 로드 (전략의 거래소에 맞�� 분기)
    const candleMap: CandleMap = new Map()
    const exchange = strategy.config.exchange === 'okx' ? 'okx' : 'upbit'
    const timeframe = strategy.config.timeframe

    const btcCandles = await loadCandles(exchange, 'BTC', timeframe, 2000)
    if (btcCandles.length < 201) {
      return c.json({ error: 'BTC 캔들 데이터가 부족합니다 (최소 201개 필요)' }, 422)
    }
    candleMap.set('BTC', btcCandles)

    // OKX 선물 전략은 ETH만 추가, 업비트 전략은 알트코인 전체
    const symbols = strategy.config.exchange === 'okx' ? ['ETH'] : TARGET_SYMBOLS
    for (const symbol of symbols) {
      const candles = await loadCandles(exchange, symbol, timeframe, 2000)
      if (candles.length > 0) candleMap.set(symbol, candles)
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
