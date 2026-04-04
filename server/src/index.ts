import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { portfolioRoutes } from './routes/portfolio.js'
import { settingsRoutes } from './routes/settings.js'
import { detectionRoutes } from './routes/detection.js'
import apiRoutes from './routes/api.js'
import { startCronJobs } from './core/cron.js'
import { authMiddleware } from './core/auth.js'
import { syncRegistryWithDb } from './strategy/registry.js'
// 전략 파일 import — 모듈 로드 시 registerStrategy() 자동 호출
import './strategy/btc-ema-crossover.js'
import './strategy/btc-bollinger-reversion.js'
import './strategy/btc-macd-momentum.js'
import './strategy/btc-donchian-breakout.js'
import './strategy/alt-mean-reversion.js'
import './strategy/alt-detection.js'

const app = new Hono()

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000']

app.use('*', cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use('*', logger())

// Health check
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

// 공개 API
app.route('/api/detection', detectionRoutes)

// 인증 필요 API (포트폴리오, 설정 등 쓰기 작업)
app.use('/api/portfolio/*', authMiddleware)
app.use('/api/settings/*', authMiddleware)
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
