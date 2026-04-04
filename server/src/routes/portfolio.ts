import { Hono } from 'hono'
import { supabase } from '../services/database.js'

export const portfolioRoutes = new Hono()

/** GET /api/portfolio/balance — 거래소 잔고 조회 (1인 사용, 무인증) */
portfolioRoutes.get('/balance', async (c) => {
  // live_positions + paper_positions 기반 잔고 집계
  const [liveResult, paperResult, liveEquityResult, paperEquityResult] = await Promise.all([
    supabase
      .from('live_positions')
      .select('asset_key, exchange, side, current_qty, entry_price, unrealized_pnl')
      .eq('status', 'open'),
    supabase
      .from('paper_positions')
      .select('asset_key, side, current_qty, entry_price, unrealized_pnl')
      .eq('status', 'open'),
    supabase
      .from('equity_snapshots')
      .select('total_equity')
      .eq('source', 'live')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('equity_snapshots')
      .select('total_equity')
      .eq('source', 'paper')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const livePositions = (liveResult.data ?? []).map((p) => ({
    symbol: p.asset_key,
    qty: Number(p.current_qty),
    entryPrice: Number(p.entry_price),
    pnl: Number(p.unrealized_pnl ?? 0),
  }))

  const upbitPositions = livePositions.filter((p) =>
    (liveResult.data ?? []).find((d) => d.asset_key === p.symbol)?.exchange === 'upbit',
  )
  const okxPositions = livePositions.filter((p) =>
    (liveResult.data ?? []).find((d) => d.asset_key === p.symbol)?.exchange === 'okx',
  )

  // 에퀴티 스냅샷에서 잔고 추출
  const liveEquity = liveEquityResult.data
  const paperEquity = paperEquityResult.data

  return c.json({
    upbit: {
      configured: upbitPositions.length > 0,
      krw: 0,
      positions: upbitPositions,
    },
    okx: {
      configured: okxPositions.length > 0,
      usd: Number(liveEquity?.total_equity ?? 0),
      positions: okxPositions,
    },
    paper: {
      equity: Number(paperEquity?.total_equity ?? 0),
      positions: (paperResult.data ?? []).map((p) => ({
        symbol: p.asset_key,
        qty: Number(p.current_qty),
        entryPrice: Number(p.entry_price),
        pnl: Number(p.unrealized_pnl ?? 0),
      })),
    },
  })
})

/** GET /api/portfolio/positions — 활성 포지션 (1인 사용, 무인증) */
portfolioRoutes.get('/positions', async (c) => {
  const [live, paper] = await Promise.all([
    supabase
      .from('live_positions')
      .select('*')
      .eq('status', 'open')
      .order('entry_time', { ascending: false }),
    supabase
      .from('paper_positions')
      .select('*')
      .eq('status', 'open')
      .order('entry_time', { ascending: false }),
  ])

  return c.json({
    data: [
      ...(live.data ?? []).map((p) => ({ ...p, session_type: 'live' })),
      ...(paper.data ?? []).map((p) => ({ ...p, session_type: 'paper' })),
    ],
  })
})

/** GET /api/portfolio/trades — 거래 내역 (1인 사용, 무인증) */
portfolioRoutes.get('/trades', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100)
  const offset = parseInt(c.req.query('offset') || '0', 10)
  const exchange = c.req.query('exchange')
  const days = parseInt(c.req.query('days') || '0', 10)

  // live_positions에서 청산된 거래 조회
  let query = supabase
    .from('live_positions')
    .select('*', { count: 'exact' })
    .eq('status', 'closed')
    .order('exit_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (exchange) {
    query = query.eq('exchange', exchange)
  }

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('exit_time', since)
  }

  const { data, error, count } = await query

  if (error) {
    return c.json({ error: '거래 내역 조회 실패' }, 500)
  }

  return c.json({
    data: (data ?? []).map((p) => ({
      id: p.id,
      exchange: p.exchange,
      symbol: p.asset_key,
      direction: p.side,
      entry_price: Number(p.entry_price),
      exit_price: Number(p.exit_price ?? 0),
      quantity: Number(p.current_qty),
      pnl: Number(p.realized_pnl ?? 0),
      pnl_pct: Number(p.entry_price) > 0 && Number(p.current_qty) > 0
        ? (Number(p.realized_pnl ?? 0) / (Number(p.entry_price) * Number(p.current_qty))) * 100
        : 0,
      strategy: p.strategy_id ?? '',
      session_type: 'live',
      closed_at: p.exit_time,
    })),
    total: count ?? 0,
    limit,
    offset,
  })
})
