import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'

/**
 * 업비트 WebSocket 실시간 데이터 클라이언트
 *
 * 체결(trade), 호가(orderbook), 시세(ticker) 스트리밍.
 * 자동 재연결 (3초 지수 백오프).
 */

type MessageHandler = (data: UpbitTradeMessage | UpbitOrderbookMessage | UpbitTickerMessage) => void

export interface UpbitTradeMessage {
  type: 'trade'
  code: string          // KRW-BTC
  trade_price: number
  trade_volume: number
  ask_bid: 'ASK' | 'BID'  // 매도/매수 체결
  trade_timestamp: number
  timestamp: number
}

export interface UpbitOrderbookMessage {
  type: 'orderbook'
  code: string
  orderbook_units: Array<{
    ask_price: number
    bid_price: number
    ask_size: number
    bid_size: number
  }>
  total_ask_size: number
  total_bid_size: number
  timestamp: number
}

export interface UpbitTickerMessage {
  type: 'ticker'
  code: string
  trade_price: number
  signed_change_rate: number
  acc_trade_volume_24h: number
  acc_trade_price_24h: number
  highest_52_week_price: number
  lowest_52_week_price: number
  timestamp: number
}

export class UpbitWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private handlers: Map<string, MessageHandler[]> = new Map()
  private markets: string[] = []
  private subscriptions: string[] = [] // 'trade', 'orderbook', 'ticker'
  private isClosing = false

  constructor(
    markets: string[],
    subscriptions: string[] = ['trade', 'ticker']
  ) {
    this.markets = markets
    this.subscriptions = subscriptions
  }

  /** 이벤트 핸들러 등록 */
  on(event: string, handler: MessageHandler): void {
    const existing = this.handlers.get(event) ?? []
    existing.push(handler)
    this.handlers.set(event, existing)
  }

  /** 연결 시작 */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.isClosing = false
    this.ws = new WebSocket('wss://api.upbit.com/websocket/v1')

    this.ws.on('open', () => {
      console.log('[업비트 WS] 연결 성공')
      this.reconnectAttempts = 0
      this.subscribe()
    })

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString())
        const type = msg.type as string

        // 타입별 핸들러 호출
        const typeHandlers = this.handlers.get(type) ?? []
        for (const handler of typeHandlers) {
          handler(msg)
        }

        // 전체 핸들러
        const allHandlers = this.handlers.get('*') ?? []
        for (const handler of allHandlers) {
          handler(msg)
        }
      } catch {
        // 파싱 실패 무시 (ping/pong 등)
      }
    })

    this.ws.on('close', () => {
      console.log('[업비트 WS] 연결 종료')
      if (!this.isClosing) {
        this.reconnect()
      }
    })

    this.ws.on('error', (err) => {
      console.error('[업비트 WS] 오류:', err.message)
    })
  }

  /** 구독 메시지 전송 */
  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const payload: Array<Record<string, unknown>> = [
      { ticket: uuidv4() },
    ]

    for (const type of this.subscriptions) {
      payload.push({
        type,
        codes: this.markets,
        isOnlyRealtime: true,
      })
    }

    this.ws.send(JSON.stringify(payload))
    console.log(`[업비트 WS] 구독: ${this.subscriptions.join(', ')} (${this.markets.length}개 마켓)`)
  }

  /** 자동 재연결 (지수 백오프) */
  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[업비트 WS] 최대 재연결 시도 초과, 중단')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 60000)
    console.log(`[업비트 WS] ${delay / 1000}초 후 재연결 시도 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    setTimeout(() => this.connect(), delay)
  }

  /** 마켓 목록 업데이트 (동적) */
  updateMarkets(markets: string[]): void {
    this.markets = markets
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.subscribe()
    }
  }

  /** 연결 종료 */
  disconnect(): void {
    this.isClosing = true
    this.ws?.close()
    this.ws = null
  }

  /** 연결 상태 */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

/**
 * 실시간 체결 데이터 집계기
 *
 * WebSocket 체결 데이터를 분봉 단위로 집계하여
 * 거래량, 매수/매도 비율 등을 실시간 계산.
 */
export class TradeAggregator {
  // symbol → 1분 버킷
  private buckets: Map<string, {
    volume: number
    buyVolume: number
    sellVolume: number
    trades: number
    lastPrice: number
    openPrice: number
    highPrice: number
    lowPrice: number
    startTime: number
  }> = new Map()

  /** 체결 데이터 처리 */
  handleTrade(msg: UpbitTradeMessage): void {
    const symbol = msg.code.replace('KRW-', '')
    const now = Date.now()
    const minuteKey = Math.floor(now / 60000) * 60000

    let bucket = this.buckets.get(symbol)
    if (!bucket || bucket.startTime !== minuteKey) {
      // 새 분봉 시작
      bucket = {
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        trades: 0,
        lastPrice: msg.trade_price,
        openPrice: msg.trade_price,
        highPrice: msg.trade_price,
        lowPrice: msg.trade_price,
        startTime: minuteKey,
      }
      this.buckets.set(symbol, bucket)
    }

    bucket.volume += msg.trade_volume
    bucket.trades++
    bucket.lastPrice = msg.trade_price
    bucket.highPrice = Math.max(bucket.highPrice, msg.trade_price)
    bucket.lowPrice = Math.min(bucket.lowPrice, msg.trade_price)

    if (msg.ask_bid === 'BID') {
      bucket.buyVolume += msg.trade_volume
    } else {
      bucket.sellVolume += msg.trade_volume
    }
  }

  /** 현재 분봉 데이터 조회 */
  getCurrentBucket(symbol: string) {
    return this.buckets.get(symbol) ?? null
  }

  /** 매수/매도 비율 (Cumulative Delta 간이) */
  getBuySellRatio(symbol: string): number {
    const bucket = this.buckets.get(symbol)
    if (!bucket || bucket.sellVolume === 0) return 0
    return bucket.buyVolume / bucket.sellVolume
  }
}
