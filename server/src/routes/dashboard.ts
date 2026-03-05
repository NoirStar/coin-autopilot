import { Hono } from 'hono'

export const dashboardRoutes = new Hono()

dashboardRoutes.get('/summary', async (c) => {
  // TODO: Fetch from agent via gRPC + database
  return c.json({
    totalEquityKrw: 0,
    totalEquityUsd: 0,
    dailyPnlKrw: 0,
    dailyPnlPct: 0,
    openPositions: 0,
    activeStrategies: 0,
    winRate: 0,
    todayTrades: 0,
  })
})

dashboardRoutes.get('/equity-history', async (c) => {
  // TODO: Fetch from database
  return c.json({ data: [] })
})
