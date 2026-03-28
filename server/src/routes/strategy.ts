import { Hono } from 'hono'
import { z } from 'zod'
import { supabase } from '../services/database.js'
import { authMiddleware } from '../core/auth.js'

type AuthEnv = { Variables: { userId: string } }

export const strategyRoutes = new Hono<AuthEnv>()

const createStrategySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['alt_mean_reversion', 'btc_ema_crossover', 'btc_bollinger_reversion', 'btc_macd_momentum', 'btc_donchian_breakout']),
  params: z.record(z.unknown()).default({}),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  exchange: z.enum(['upbit', 'okx']).default('upbit'),
  mode: z.enum(['paper', 'live', 'backtest']).default('paper'),
})

const updateStrategySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  params: z.record(z.unknown()).optional(),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  exchange: z.enum(['upbit', 'okx']).optional(),
  mode: z.enum(['paper', 'live', 'backtest']).optional(),
})

/** GET /api/strategy — 전략 목록 조회 (비로그인 허용) */
strategyRoutes.get('/', async (c) => {
  // optional auth: 토큰이 있으면 사용자 전략, 없으면 기본 전략
  const authHeader = c.req.header('Authorization')
  let userId: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const token = authHeader.slice(7)
      const sb = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: { user } } = await sb.auth.getUser(token)
      userId = user?.id ?? null
    } catch { /* 비로그인 처리 */ }
  }

  if (!userId) {
    return c.json({
      data: getDefaultStrategies(),
    })
  }

  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    return c.json({ error: '전략 목록 조회 실패' }, 500)
  }

  // 사용자 전략이 없으면 기본 전략 반환
  if (!data || data.length === 0) {
    return c.json({ data: getDefaultStrategies() })
  }

  return c.json({ data })
})

/** POST /api/strategy — 전략 생성 */
strategyRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => ({}))
  const parsed = createStrategySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  const { name, type, params, riskProfile, exchange, mode } = parsed.data

  const { data, error } = await supabase
    .from('strategies')
    .insert({
      user_id: userId,
      name,
      type,
      params,
      risk_profile: riskProfile,
      exchange,
      mode,
      is_active: false,
    })
    .select('id')
    .single()

  if (error) {
    return c.json({ error: '전략 생성 실패' }, 500)
  }

  return c.json({ success: true, id: data.id }, 201)
})

/** PUT /api/strategy/:id — 전략 수정 */
strategyRoutes.put('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const parsed = updateStrategySchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name) updates.name = parsed.data.name
  if (parsed.data.params) updates.params = parsed.data.params
  if (parsed.data.riskProfile) updates.risk_profile = parsed.data.riskProfile
  if (parsed.data.exchange) updates.exchange = parsed.data.exchange
  if (parsed.data.mode) updates.mode = parsed.data.mode

  const { error } = await supabase
    .from('strategies')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return c.json({ error: '전략 수정 실패' }, 500)
  }

  return c.json({ success: true, id })
})

/** PUT /api/strategy/:id/activate — 전략 활성화 */
strategyRoutes.put('/:id/activate', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const id = c.req.param('id')
  const { error } = await supabase
    .from('strategies')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return c.json({ error: '전략 활성화 실패' }, 500)
  }

  return c.json({ success: true })
})

/** PUT /api/strategy/:id/deactivate — 전략 비활성화 */
strategyRoutes.put('/:id/deactivate', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const id = c.req.param('id')
  const { error } = await supabase
    .from('strategies')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return c.json({ error: '전략 비활성화 실패' }, 500)
  }

  return c.json({ success: true })
})

/** 기본 전략 목록 (DB에 저장 전) */
function getDefaultStrategies() {
  return [
    {
      id: 'default_1',
      name: 'BTC 레짐 + 알트 평균회귀',
      type: 'alt_mean_reversion',
      params: {
        zScoreEntry: -1.0,
        zScoreExit: 0.0,
        rsiMax: 78,
        maxPositions: 5,
        atrStopMult: 2.7,
        timeLimitCandles: 8,
      },
      risk_profile: 'moderate',
      is_active: true,
      mode: 'paper',
      exchange: 'upbit',
      implemented: true,
    },
    {
      id: 'default_2',
      name: 'BTC EMA 크로스오버',
      type: 'btc_ema_crossover',
      params: {
        fastEma: 12,
        slowEma: 26,
        trendEma: 200,
        adxThreshold: 20,
        atrStopMult: 1.5,
        atrTrailMult: 2.0,
        timeLimitCandles: 30,
        leverage: 2,
      },
      risk_profile: 'moderate',
      is_active: false,
      mode: 'paper',
      exchange: 'okx',
      implemented: true,
    },
    {
      id: 'default_3',
      name: 'BTC 볼린저 평균회귀',
      type: 'btc_bollinger_reversion',
      params: {
        bbPeriod: 20,
        bbStdDev: 2,
        rsiOversold: 30,
        rsiOverbought: 70,
        trendEma: 200,
        atrStopMult: 1.0,
        timeLimitCandles: 20,
        leverage: 2,
      },
      risk_profile: 'moderate',
      is_active: false,
      mode: 'paper',
      exchange: 'okx',
      implemented: true,
    },
    {
      id: 'default_4',
      name: 'BTC MACD 모멘텀',
      type: 'btc_macd_momentum',
      params: {
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        rsiPeriod: 14,
        adxThreshold: 25,
        atrStopMult: 1.5,
        atrTrailMult: 2.5,
        timeLimitCandles: 24,
        leverage: 2,
      },
      risk_profile: 'moderate',
      is_active: false,
      mode: 'paper',
      exchange: 'okx',
      implemented: true,
    },
    {
      id: 'default_5',
      name: 'BTC 돈치안 브레이크아웃',
      type: 'btc_donchian_breakout',
      params: {
        donchianPeriod: 20,
        atrStopMult: 1.5,
        atrTrailMult: 3.0,
        volumeMultiplier: 2.0,
        timeLimitCandles: 20,
        leverage: 2,
      },
      risk_profile: 'aggressive',
      is_active: false,
      mode: 'paper',
      exchange: 'okx',
      implemented: true,
    },
  ]
}
