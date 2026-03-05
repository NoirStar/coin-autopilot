import { Hono } from 'hono'

export const backtestRoutes = new Hono()

backtestRoutes.post('/run', async (c) => {
  const body = await c.req.json()
  // TODO: Enqueue backtest job via BullMQ
  const jobId = crypto.randomUUID()
  return c.json({ jobId, status: 'queued' }, 202)
})

backtestRoutes.get('/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  // TODO: Check BullMQ job status
  return c.json({ jobId, status: 'pending', progress: 0 })
})

backtestRoutes.get('/results', async (c) => {
  // TODO: Fetch from database
  return c.json({ data: [] })
})

backtestRoutes.get('/results/:id', async (c) => {
  const id = c.req.param('id')
  // TODO: Fetch single backtest result
  return c.json({ id, data: null })
})
