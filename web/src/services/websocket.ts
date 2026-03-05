import { io, type Socket } from 'socket.io-client'

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    })
  }
  return socket
}

export function connectSocket(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}

// Event type helpers
export type WSEvent =
  | 'price:update'
  | 'position:update'
  | 'trade:executed'
  | 'equity:update'
  | 'regime:change'
  | 'strategy:signal'
  | 'agent:status'
  | 'alert:new'
  | 'paper:update'
