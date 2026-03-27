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
import { startCronJobs } from './core/cron.js'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())

// Health check
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

// API Routes
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/strategy', strategyRoutes)
app.route('/api/backtest', backtestRoutes)
app.route('/api/paper-trading', paperTradingRoutes)
app.route('/api/portfolio', portfolioRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/signals', signalRoutes)

// 서버 시작
const port = parseInt(process.env.PORT || '3001', 10)

serve({ fetch: app.fetch, port }, () => {
  console.log(`coin-autopilot server running on port ${port}`)
  startCronJobs()
})

export { app }
