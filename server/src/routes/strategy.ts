import { Hono } from 'hono'

export const strategyRoutes = new Hono()

strategyRoutes.get('/', async (c) => {
  // TODO: Fetch strategies from database
  return c.json({ data: [] })
})

strategyRoutes.post('/', async (c) => {
  const body = await c.req.json()
  // TODO: Save strategy config, push to agent via gRPC
  return c.json({ success: true, id: crypto.randomUUID() }, 201)
})

strategyRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  // TODO: Update strategy, push to agent
  return c.json({ success: true, id })
})

strategyRoutes.put('/:id/activate', async (c) => {
  const id = c.req.param('id')
  // TODO: Activate strategy on agent
  return c.json({ success: true })
})

strategyRoutes.put('/:id/deactivate', async (c) => {
  const id = c.req.param('id')
  // TODO: Deactivate strategy on agent
  return c.json({ success: true })
})
