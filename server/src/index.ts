import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { portfolioRoutes } from './routes/portfolio.js'
import { settingsRoutes } from './routes/settings.js'
import { detectionRoutes } from './routes/detection.js'
import v2ApiRoutes from './routes/v2-api.js'
import { startCronJobs } from './core/cron.js'
import { authMiddleware } from './core/auth.js'
import { syncRegistryWithDb } from './strategy/v2-registry.js'
// 전략 파일 import — 모듈 로드 시 registerStrategy() 자동 호출
import './strategy/v2-btc-ema-crossover.js'
import './strategy/v2-btc-bollinger-reversion.js'
import './strategy/v2-btc-macd-momentum.js'
import './strategy/v2-btc-donchian-breakout.js'
import './strategy/v2-alt-mean-reversion.js'
import './strategy/v2-alt-detection.js'

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

// 인증 필요 API
app.use('/api/portfolio/*', authMiddleware)
app.use('/api/settings/*', authMiddleware)
app.use('/api/v2/*', authMiddleware)
app.route('/api/portfolio', portfolioRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/v2', v2ApiRoutes)

// 서버 시작
const port = parseInt(process.env.PORT || '3001', 10)

serve({ fetch: app.fetch, port }, async () => {
  console.log(`coin-autopilot server running on port ${port}`)
  await syncRegistryWithDb()
  startCronJobs()
})

export { app }
