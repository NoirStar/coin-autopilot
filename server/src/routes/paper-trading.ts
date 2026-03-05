import { Hono } from 'hono'

export const paperTradingRoutes = new Hono()

paperTradingRoutes.get('/sessions', async (c) => {
  // TODO: Fetch paper trading sessions from database
  return c.json({ data: [] })
})

paperTradingRoutes.post('/session', async (c) => {
  const body = await c.req.json()
  // TODO: Create paper trading session, notify agent via gRPC
  return c.json({ success: true, id: crypto.randomUUID() }, 201)
})

paperTradingRoutes.put('/session/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  // TODO: Pause/resume/stop session
  return c.json({ success: true, id })
})

paperTradingRoutes.get('/compare', async (c) => {
  // TODO: Compare all running paper sessions performance
  return c.json({ data: [] })
})
