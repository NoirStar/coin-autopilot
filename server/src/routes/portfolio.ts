import { Hono } from 'hono'

export const portfolioRoutes = new Hono()

portfolioRoutes.get('/balance', async (c) => {
  // TODO: Fetch from agent or cache
  return c.json({
    upbit: { krw: 0, positions: [] },
    okx: { usd: 0, positions: [] },
  })
})

portfolioRoutes.get('/positions', async (c) => {
  // TODO: Fetch active positions from agent
  return c.json({ data: [] })
})

portfolioRoutes.get('/trades', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = parseInt(c.req.query('offset') || '0', 10)
  // TODO: Fetch from database
  return c.json({ data: [], total: 0, limit, offset })
})
