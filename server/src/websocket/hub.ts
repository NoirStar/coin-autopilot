import type { Server } from 'socket.io'

export function setupWebSocket(io: Server): void {
  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`)

    socket.on('subscribe:prices', (symbols: string[]) => {
      for (const sym of symbols) {
        socket.join(`price:${sym}`)
      }
    })

    socket.on('subscribe:positions', () => {
      socket.join('positions')
    })

    socket.on('subscribe:regime', () => {
      socket.join('regime')
    })

    socket.on('subscribe:paper', (sessionId: string) => {
      socket.join(`paper:${sessionId}`)
    })

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`)
    })
  })
}

// Broadcast helpers (called from gRPC handler or agent comm)
export function broadcastPrice(io: Server, symbol: string, data: unknown): void {
  io.to(`price:${symbol}`).emit('price:update', data)
}

export function broadcastPositions(io: Server, data: unknown): void {
  io.to('positions').emit('position:update', data)
}

export function broadcastTrade(io: Server, data: unknown): void {
  io.to('positions').emit('trade:executed', data)
}

export function broadcastRegime(io: Server, data: unknown): void {
  io.to('regime').emit('regime:change', data)
}

export function broadcastAgentStatus(io: Server, data: unknown): void {
  io.emit('agent:status', data)
}

export function broadcastPaperUpdate(io: Server, sessionId: string, data: unknown): void {
  io.to(`paper:${sessionId}`).emit('paper:update', data)
}
