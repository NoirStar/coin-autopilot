import { Hono } from 'hono'
import { supabase } from '../services/database.js'

type AuthEnv = { Variables: { userId: string } }

export const portfolioRoutes = new Hono<AuthEnv>()

/** GET /api/portfolio/balance — 거래소 잔고 조회 */
portfolioRoutes.get('/balance', async (c) => {
  const userId = c.get('userId')

  // 사용자 설정에서 거래소 연결 상태 확인
  const { data: settings } = await supabase
    .from('user_settings')
    .select('upbit_configured, okx_configured')
    .eq('user_id', userId)
    .single()

  const upbitConfigured = settings?.upbit_configured ?? false
  const okxConfigured = settings?.okx_configured ?? false

  // 현재는 DB 포지션 기반 잔고 집계 (실제 거래소 API 연동은 추후)
  const { data: openPositions } = await supabase
    .from('positions')
    .select('exchange, symbol, quantity, entry_price, pnl, session_type')
    .eq('user_id', userId)
    .eq('status', 'open')
    .in('session_type', ['live', 'paper'])

  const upbitPositions = (openPositions ?? [])
    .filter((p) => p.exchange === 'upbit' || !p.exchange)
    .map((p) => ({
      symbol: p.symbol,
      qty: p.quantity,
      entryPrice: p.entry_price,
      pnl: p.pnl ?? 0,
    }))

  const okxPositions = (openPositions ?? [])
    .filter((p) => p.exchange === 'okx')
    .map((p) => ({
      symbol: p.symbol,
      qty: p.quantity,
      entryPrice: p.entry_price,
      pnl: p.pnl ?? 0,
    }))

  return c.json({
    upbit: {
      configured: upbitConfigured,
      krw: 0,
      positions: upbitPositions,
    },
    okx: {
      configured: okxConfigured,
      usd: 0,
      positions: okxPositions,
    },
  })
})

/** GET /api/portfolio/positions — 활성 포지션 */
portfolioRoutes.get('/positions', async (c) => {
  const userId = c.get('userId')

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })

  if (error) {
    return c.json({ error: '포지션 조회 실패' }, 500)
  }

  return c.json({ data: data ?? [] })
})

/** GET /api/portfolio/trades — 거래 내역 (페이지네이션) */
portfolioRoutes.get('/trades', async (c) => {
  const userId = c.get('userId')

  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100)
  const offset = parseInt(c.req.query('offset') || '0', 10)
  const exchange = c.req.query('exchange')
  const days = parseInt(c.req.query('days') || '0', 10)

  let query = supabase
    .from('positions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (exchange) {
    query = query.eq('exchange', exchange)
  }

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('closed_at', since)
  }

  const { data, error, count } = await query

  if (error) {
    return c.json({ error: '거래 내역 조회 실패' }, 500)
  }

  return c.json({
    data: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
})
