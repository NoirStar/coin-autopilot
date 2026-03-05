import { Hono } from 'hono'

export const settingsRoutes = new Hono()

settingsRoutes.get('/agent-status', async (c) => {
  // TODO: Ping agent via gRPC
  return c.json({
    agentId: '',
    state: 'idle',
    uptimeSeconds: 0,
    activePositions: 0,
    activeStrategies: 0,
    wsConnections: { upbit: false, okx: false },
  })
})

settingsRoutes.put('/risk-profile', async (c) => {
  const body = await c.req.json()
  // TODO: Update risk profile on agent
  return c.json({ success: true })
})
