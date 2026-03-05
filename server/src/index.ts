import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { Server as SocketServer } from 'socket.io'
import { createServer } from 'node:http'

import { dashboardRoutes } from './routes/dashboard.js'
import { strategyRoutes } from './routes/strategy.js'
import { backtestRoutes } from './routes/backtest.js'
import { paperTradingRoutes } from './routes/paper-trading.js'
import { portfolioRoutes } from './routes/portfolio.js'
import { settingsRoutes } from './routes/settings.js'
import { setupWebSocket } from './websocket/hub.js'

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

// Create HTTP server
const port = parseInt(process.env.PORT || '3001', 10)
const httpServer = createServer(serve({ fetch: app.fetch, port }).server)

// WebSocket (Socket.IO)
const io = new SocketServer(httpServer, {
  cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:5173' },
})

setupWebSocket(io)

httpServer.listen(port, () => {
  console.log(`🚀 coin-autopilot server running on port ${port}`)
})

export { app, io }
