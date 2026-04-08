import { Hono } from 'hono'
import { z } from 'zod'
import { supabase } from '../services/database.js'
import { authMiddleware } from '../core/auth.js'
import { invalidateRiskParamsCache } from '../risk/risk-manager.js'

export const settingsRoutes = new Hono()

/** 기본 설정값 (1인 사용 단계, user_id 불필요) */
const DEFAULT_SETTINGS = {
  risk_profile: 'moderate',
  daily_max_loss_pct: 2.0,
  position_max_loss_pct: 0.30,
  mdd_warning_pct: 15.0,
  mdd_stop_pct: 25.0,
  upbit_configured: false,
  okx_configured: false,
  telegram_enabled: false,
  telegram_bot_token: null,
  telegram_chat_id: null,
  discord_enabled: false,
  discord_webhook_url: null,
  alert_on_signal: true,
  alert_on_mdd: true,
  alert_on_regime: true,
  alert_on_execution: false,
}

/** .env 기반 거래소 연결 상태 */
function envConfigured() {
  return {
    upbit_configured: !!(process.env.UPBIT_ACCESS_KEY && process.env.UPBIT_SECRET_KEY),
    okx_configured: !!(process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY),
  }
}

/** GET /api/settings — 사용자 설정 조회 (1인 사용, 무인증) */
settingsRoutes.get('/', async (c) => {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    // 테이블 자체가 없으면 기본값 반환
    return c.json({ data: { ...DEFAULT_SETTINGS, ...envConfigured() } })
  }

  // .env 기반 거래소 연결 상태를 DB 값보다 우선
  return c.json({ data: { ...(data ?? DEFAULT_SETTINGS), ...envConfigured() } })
})

/** PUT /api/settings/risk-profile — 리스크 파라미터 수정 (인증 필요) */
settingsRoutes.put('/risk-profile', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const schema = z.object({
    riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
    dailyMaxLossPct: z.number().min(0.5).max(10).optional(),
    positionMaxLossPct: z.number().min(0.1).max(5).optional(),
    mddWarningPct: z.number().min(5).max(50).optional(),
    mddStopPct: z.number().min(10).max(50).optional(),
  })

  const body = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.riskProfile !== undefined) updates.risk_profile = parsed.data.riskProfile
  if (parsed.data.dailyMaxLossPct !== undefined) updates.daily_max_loss_pct = parsed.data.dailyMaxLossPct
  if (parsed.data.positionMaxLossPct !== undefined) updates.position_max_loss_pct = parsed.data.positionMaxLossPct
  if (parsed.data.mddWarningPct !== undefined) updates.mdd_warning_pct = parsed.data.mddWarningPct
  if (parsed.data.mddStopPct !== undefined) updates.mdd_stop_pct = parsed.data.mddStopPct

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      ...DEFAULT_SETTINGS,
      ...updates,
    }, { onConflict: 'user_id' })

  if (error) {
    return c.json({ error: '설정 저장 실패' }, 500)
  }

  // 리스크 파라미터 캐시 무효화 — 변경 즉시 반영
  invalidateRiskParamsCache()

  return c.json({ success: true })
})

/** PUT /api/settings/alerts — 알림 설정 수정 (인증 필요) */
settingsRoutes.put('/alerts', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const schema = z.object({
    telegramEnabled: z.boolean().optional(),
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
    discordEnabled: z.boolean().optional(),
    discordWebhookUrl: z.string().url().optional().or(z.literal('')),
    alertOnSignal: z.boolean().optional(),
    alertOnMdd: z.boolean().optional(),
    alertOnRegime: z.boolean().optional(),
    alertOnExecution: z.boolean().optional(),
  })

  const body = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.telegramEnabled !== undefined) updates.telegram_enabled = parsed.data.telegramEnabled
  if (parsed.data.telegramBotToken !== undefined) updates.telegram_bot_token = parsed.data.telegramBotToken
  if (parsed.data.telegramChatId !== undefined) updates.telegram_chat_id = parsed.data.telegramChatId
  if (parsed.data.discordEnabled !== undefined) updates.discord_enabled = parsed.data.discordEnabled
  if (parsed.data.discordWebhookUrl !== undefined) updates.discord_webhook_url = parsed.data.discordWebhookUrl
  if (parsed.data.alertOnSignal !== undefined) updates.alert_on_signal = parsed.data.alertOnSignal
  if (parsed.data.alertOnMdd !== undefined) updates.alert_on_mdd = parsed.data.alertOnMdd
  if (parsed.data.alertOnRegime !== undefined) updates.alert_on_regime = parsed.data.alertOnRegime
  if (parsed.data.alertOnExecution !== undefined) updates.alert_on_execution = parsed.data.alertOnExecution

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      ...DEFAULT_SETTINGS,
      ...updates,
    }, { onConflict: 'user_id' })

  if (error) {
    return c.json({ error: '알림 설정 저장 실패' }, 500)
  }

  return c.json({ success: true })
})

/** PUT /api/settings/api-keys — API 키 저장 (인증 필요) */
settingsRoutes.put('/api-keys', authMiddleware, async (c) => {
  const userId = c.get('userId')

  const schema = z.object({
    exchange: z.enum(['upbit', 'okx']),
    accessKey: z.string().min(1),
    secretKey: z.string().min(1),
    passphrase: z.string().optional(),
  })

  const body = await c.req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: '잘못된 요청', details: parsed.error.flatten() }, 400)
  }

  const { exchange, accessKey, secretKey, passphrase } = parsed.data

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (exchange === 'upbit') {
    updates.upbit_access_key = accessKey
    updates.upbit_secret_key = secretKey
    updates.upbit_configured = true
  } else {
    updates.okx_access_key = accessKey
    updates.okx_secret_key = secretKey
    updates.okx_passphrase = passphrase ?? ''
    updates.okx_configured = true
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      ...DEFAULT_SETTINGS,
      ...updates,
    }, { onConflict: 'user_id' })

  if (error) {
    return c.json({ error: 'API 키 저장 실패' }, 500)
  }

  return c.json({ success: true })
})

/** DELETE /api/settings/api-keys/:exchange — API 키 삭제 (인증 필요) */
settingsRoutes.delete('/api-keys/:exchange', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const exchange = c.req.param('exchange')

  if (exchange !== 'upbit' && exchange !== 'okx') {
    return c.json({ error: '잘못된 거래소' }, 400)
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (exchange === 'upbit') {
    updates.upbit_access_key = null
    updates.upbit_secret_key = null
    updates.upbit_configured = false
  } else {
    updates.okx_access_key = null
    updates.okx_secret_key = null
    updates.okx_passphrase = null
    updates.okx_configured = false
  }

  const { error } = await supabase
    .from('user_settings')
    .update(updates)
    .eq('user_id', userId)

  if (error) {
    return c.json({ error: 'API 키 삭제 실패' }, 500)
  }

  return c.json({ success: true })
})

/** GET /api/settings/runtime-config — 실제 런타임에 적용 중인 환경변수 기반 설정 (무인증) */
settingsRoutes.get('/runtime-config', async (c) => {
  return c.json({
    risk: {
      dailyLossLimitPct: Number(process.env.DAILY_LOSS_LIMIT_PCT ?? 5),
      circuitBreakerPct: Number(process.env.CIRCUIT_BREAKER_PCT ?? 10),
      maxPositions: Number(process.env.MAX_CONCURRENT_POSITIONS ?? 3),
      maxPositionSize: Number(process.env.MAX_POSITION_SIZE ?? 5000),
      maxLeverage: Number(process.env.MAX_LEVERAGE ?? 3),
    },
    exchanges: {
      upbit: !!process.env.UPBIT_ACCESS_KEY,
      okx: !!process.env.OKX_API_KEY,
    },
    alerts: {
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      discord: !!process.env.DISCORD_WEBHOOK_URL,
    },
    ai: {
      enabled: !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY,
      provider: process.env.AI_PROVIDER ?? (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null),
      model: process.env.AI_MODEL ?? null,
    },
  })
})

/** GET /api/settings/agent-status — 에이전트 상태 (무인증) */
settingsRoutes.get('/agent-status', async (c) => {
  return c.json({
    agentId: 'vps-main',
    state: 'running',
    uptimeSeconds: Math.floor(process.uptime()),
    activePositions: 0,
    activeStrategies: 1,
    wsConnections: { upbit: false, okx: false },
  })
})
