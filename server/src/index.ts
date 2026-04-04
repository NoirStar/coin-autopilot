import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

import { portfolioRoutes } from './routes/portfolio.js'
import { settingsRoutes } from './routes/settings.js'
import { detectionRoutes } from './routes/detection.js'
import apiRoutes from './routes/api.js'
import { startCronJobs } from './core/cron.js'
import { syncRegistryWithDb } from './strategy/registry.js'
// 전략 파일 import — 모듈 로드 시 registerStrategy() 자동 호출
import './strategy/btc-ema-crossover.js'
import './strategy/btc-bollinger-reversion.js'
import './strategy/btc-macd-momentum.js'
import './strategy/btc-donchian-breakout.js'
import './strategy/alt-mean-reversion.js'
import './strategy/alt-detection.js'

const app = new Hono()

// CORS — Cloudflare Tunnel이 OPTIONS preflight를 전달하지 않을 수 있으므로 수동 처리
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000']

function isAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  if (allowedOrigins.includes(origin)) return origin
  if (/^https:\/\/(.*\.)?noirstar\.cloud$/.test(origin)) return origin
  return null
}

// OPTIONS preflight 직접 처리
app.all('*', async (c, next) => {
  const origin = c.req.header('Origin')
  const allowed = isAllowedOrigin(origin)

  if (c.req.method === 'OPTIONS') {
    const headers: Record<string, string> = {}
    if (allowed) {
      headers['Access-Control-Allow-Origin'] = allowed
      headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
      headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
      headers['Access-Control-Allow-Credentials'] = 'true'
      headers['Access-Control-Max-Age'] = '86400'
    }
    return new Response(null, { status: 204, headers })
  }

  await next()

  if (allowed) {
    c.res.headers.set('Access-Control-Allow-Origin', allowed)
    c.res.headers.set('Access-Control-Allow-Credentials', 'true')
  }
})

app.use('*', logger())

// Health check
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

// 공개 API
app.route('/api/detection', detectionRoutes)

// 포트폴리오/설정 — 1인 사용 단계에서 읽기는 무인증, 쓰기만 인증 (HANDOFF.md §1)
app.route('/api/portfolio', portfolioRoutes)
app.route('/api/settings', settingsRoutes)

// 트레이딩 대시보드 API — 1인 사용 단계에서는 무인증 (HANDOFF.md §1)
app.route('/api/dash', apiRoutes)

// 서버 시작
const port = parseInt(process.env.PORT || '3001', 10)

serve({ fetch: app.fetch, port }, async () => {
  console.log(`coin-autopilot server running on port ${port}`)
  await syncRegistryWithDb()
  startCronJobs()
})

export { app }
