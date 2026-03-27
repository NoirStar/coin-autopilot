import { Hono } from 'hono'
import { z } from 'zod'
import { supabase } from '../services/database.js'

type AuthEnv = { Variables: { userId: string } }

export const paperTradingRoutes = new Hono<AuthEnv>()

/** GET /api/paper-trading/sessions — 가상매매 세션 목록 */
paperTradingRoutes.get('/sessions', async (c) => {
  const userId = c.get('userId')

  const { data, error } = await supabase
    .from('paper_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: '세션 목록 조회 실패' }, 500)
  }

  return c.json({ data: data ?? [] })
})

/** POST /api/paper-trading/session — 새 가상매매 세션 생성 */
paperTradingRoutes.post('/session', async (c) => {
  const userId = c.get('userId')

  const schema = z.object({
    name: z.string().min(1).max(50),
    strategyId: z.number().int().positive().optional(),
    strategyType: z.string().optional(),
    initialCapital: z.number().min(100_000).max(1_000_000_000).default(10_000_000),
  })

  const body = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  // 활성 세션 수 확인 (최대 10개)
  // NOTE: TOCTOU race 가능 — 동시 요청 시 10개 초과 가능. 가상매매 특성상 빈도 낮아 허용.
  const { count } = await supabase
    .from('paper_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'running')

  if ((count ?? 0) >= 10) {
    return c.json({ error: '활성 세션은 최대 10개까지 가능합니다' }, 400)
  }

  const { data, error } = await supabase
    .from('paper_sessions')
    .insert({
      user_id: userId,
      strategy_id: parsed.data.strategyId ?? null,
      name: parsed.data.name,
      initial_capital: parsed.data.initialCapital,
      current_equity: parsed.data.initialCapital,
      status: 'running',
    })
    .select('id')
    .single()

  if (error) {
    return c.json({ error: '세션 생성 실패' }, 500)
  }

  return c.json({ success: true, id: data.id }, 201)
})

/** PUT /api/paper-trading/session/:id — 세션 상태 변경 (일시정지/재개/종료) */
paperTradingRoutes.put('/session/:id', async (c) => {
  const userId = c.get('userId')

  const id = c.req.param('id')
  const schema = z.object({
    action: z.enum(['pause', 'resume', 'stop']),
  })

  const body = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  const statusMap: Record<string, string> = {
    pause: 'paused',
    resume: 'running',
    stop: 'completed',
  }

  const updates: Record<string, unknown> = {
    status: statusMap[parsed.data.action],
  }

  if (parsed.data.action === 'stop') {
    updates.ended_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('paper_sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return c.json({ error: '세션 상태 변경 실패' }, 500)
  }

  return c.json({ success: true, id })
})

/** GET /api/paper-trading/compare — 세션 간 성과 비교 */
paperTradingRoutes.get('/compare', async (c) => {
  const userId = c.get('userId')

  const { data, error } = await supabase
    .from('paper_sessions')
    .select('id, name, initial_capital, current_equity, status, total_return, sharpe_ratio, max_drawdown, win_rate, total_trades, started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })

  if (error) {
    return c.json({ error: '비교 데이터 조회 실패' }, 500)
  }

  return c.json({ data: data ?? [] })
})

/** GET /api/paper-trading/session/:id/positions — 세션의 가상 포지션 */
paperTradingRoutes.get('/session/:id/positions', async (c) => {
  const userId = c.get('userId')

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_type', 'paper')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })

  if (error) {
    return c.json({ error: '포지션 조회 실패' }, 500)
  }

  return c.json({ data: data ?? [] })
})
