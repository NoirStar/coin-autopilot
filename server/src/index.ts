import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { dashboardRoutes } from './routes/dashboard.js'
import { strategyRoutes } from './routes/strategy.js'
import { backtestRoutes } from './routes/backtest.js'
import { paperTradingRoutes } from './routes/paper-trading.js'
import { portfolioRoutes } from './routes/portfolio.js'
import { settingsRoutes } from './routes/settings.js'
import { signalRoutes } from './routes/signals.js'
import { detectionRoutes } from './routes/detection.js'
import { startCronJobs } from './core/cron.js'
import { authMiddleware } from './core/auth.js'

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

// 공개 API (인증 불필요)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/signals', signalRoutes)
app.route('/api/backtest', backtestRoutes)
app.route('/api/detection', detectionRoutes)

// 인증 필요 API (strategy GET /는 별도로 비인증 허용)
app.route('/api/strategy', strategyRoutes)
app.use('/api/paper-trading/*', authMiddleware)
app.use('/api/portfolio/*', authMiddleware)
app.use('/api/settings/*', authMiddleware)
app.route('/api/paper-trading', paperTradingRoutes)
app.route('/api/portfolio', portfolioRoutes)
app.route('/api/settings', settingsRoutes)

// 서버 시작
const port = parseInt(process.env.PORT || '3001', 10)

serve({ fetch: app.fetch, port }, () => {
  console.log(`coin-autopilot server running on port ${port}`)
  startCronJobs()
})

export { app }
