import ccxt from 'ccxt'
import type { Candle } from '../strategy/strategy-base.js'

/**
 * OKX 선물 거래소 클라이언트
 * CCXT를 래핑하여 프로젝트에서 사용하는 타입으로 변환
 */

type OkxExchange = InstanceType<typeof ccxt.okx>

let exchange: OkxExchange | null = null

/** OKX 인스턴스 초기화 (싱글턴) */
export function getOkxExchange(): OkxExchange {
  if (exchange) return exchange

  const apiKey = process.env.OKX_API_KEY || ''
  const secret = process.env.OKX_SECRET_KEY || ''
  const password = process.env.OKX_PASSPHRASE || ''

  exchange = new ccxt.okx({
    apiKey,
    secret,
    password,
    enableRateLimit: true,
    options: {
      defaultType: 'swap',
    },
  })

  if (process.env.OKX_TESTNET === 'true') {
    exchange.setSandboxMode(true)
    console.log('OKX: 테스트넷 모드 활성화')
  }

  return exchange
}

/** OKX 연결 확인 */
export async function checkOkxConnection(): Promise<boolean> {
  try {
    const okx = getOkxExchange()
    await okx.loadMarkets()
    return true
  } catch (err) {
    console.error('OKX 연결 실패:', err)
    return false
  }
}

// ============================================================
// 시세 데이터
// ============================================================

/** OKX에서 OHLCV 캔들 조회 */
export async function fetchOkxCandles(
  symbol: string,
  timeframe: string,
  limit: number = 300
): Promise<Candle[]> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`

  const ohlcv = await okx.fetchOHLCV(pair, timeframe, undefined, limit)

  return ohlcv.map((bar) => ({
    openTime: new Date(Number(bar[0])),
    open: Number(bar[1]),
    high: Number(bar[2]),
    low: Number(bar[3]),
    close: Number(bar[4]),
    volume: Number(bar[5]),
  }))
}

/** 현재 가격 조회 */
export async function fetchOkxPrice(symbol: string): Promise<number> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`
  const ticker = await okx.fetchTicker(pair)
  return ticker.last ?? 0
}

/** 펀딩비 조회 */
export async function fetchFundingRate(symbol: string): Promise<{
  current: number
  predicted: number
  nextFundingTime: Date
}> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`
  const funding = await okx.fetchFundingRate(pair)

  return {
    current: funding.fundingRate ?? 0,
    predicted: funding.nextFundingRate ?? 0,
    nextFundingTime: new Date(funding.nextFundingTimestamp ?? Date.now()),
  }
}

// ============================================================
// 포지션 관리
// ============================================================

export interface OkxPosition {
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  markPrice: number
  unrealizedPnl: number
  leverage: number
  marginMode: 'isolated' | 'cross'
  liquidationPrice: number
}

/** 오픈 포지션 조회 */
export async function fetchOpenPositions(): Promise<OkxPosition[]> {
  const okx = getOkxExchange()
  const positions = await okx.fetchPositions()

  return positions
    .filter((p) => parseFloat(String(p.contracts ?? 0)) > 0)
    .map((p) => ({
      symbol: String(p.symbol ?? '').replace('/USDT:USDT', ''),
      side: (p.side === 'short' ? 'short' : 'long') as 'long' | 'short',
      size: parseFloat(String(p.contracts ?? 0)),
      entryPrice: parseFloat(String(p.entryPrice ?? 0)),
      markPrice: parseFloat(String(p.markPrice ?? 0)),
      unrealizedPnl: parseFloat(String(p.unrealizedPnl ?? 0)),
      leverage: parseFloat(String(p.leverage ?? 1)),
      marginMode: (p.marginMode === 'cross' ? 'cross' : 'isolated') as 'isolated' | 'cross',
      liquidationPrice: parseFloat(String(p.liquidationPrice ?? 0)),
    }))
}

/** 계좌 잔고 조회 (USDT) */
export async function fetchBalance(): Promise<{ total: number; free: number; used: number }> {
  const okx = getOkxExchange()
  const balance = await okx.fetchBalance({ type: 'swap' })

  const balanceInfo = balance as Record<string, unknown>
  const totalMap = (balanceInfo.total ?? {}) as Record<string, number>
  const freeMap = (balanceInfo.free ?? {}) as Record<string, number>
  const usedMap = (balanceInfo.used ?? {}) as Record<string, number>

  return {
    total: parseFloat(String(totalMap.USDT ?? 0)),
    free: parseFloat(String(freeMap.USDT ?? 0)),
    used: parseFloat(String(usedMap.USDT ?? 0)),
  }
}

// ============================================================
// 주문 실행
// ============================================================

export interface OrderResult {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  amount: number
  price: number | null
  status: string
  timestamp: Date
}

export interface StopOrderResult {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  stopPrice: number
  size: number
  status: string
  timestamp: Date
}

/** 레버리지 설정 */
export async function setLeverage(symbol: string, leverage: number): Promise<void> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`
  await okx.setLeverage(leverage, pair)
}

/** 마진 모드 설정 (격리/교차) */
export async function setMarginMode(symbol: string, mode: 'isolated' | 'cross'): Promise<void> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`
  await okx.setMarginMode(mode, pair)
}

/** 시장가 주문 */
export async function createMarketOrder(
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
  reduceOnly: boolean = false
): Promise<OrderResult> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`

  const params: Record<string, unknown> = {}
  if (reduceOnly) params.reduceOnly = true

  const order = await okx.createOrder(pair, 'market', side, amount, undefined, params)

  return {
    id: String(order.id),
    symbol,
    side,
    type: 'market',
    amount: parseFloat(String(order.amount ?? amount)),
    price: order.average ? parseFloat(String(order.average)) : null,
    status: String(order.status ?? 'unknown'),
    timestamp: new Date(order.timestamp ?? Date.now()),
  }
}

/** 지정가 주문 */
export async function createLimitOrder(
  symbol: string,
  side: 'buy' | 'sell',
  amount: number,
  price: number,
  reduceOnly: boolean = false
): Promise<OrderResult> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`

  const params: Record<string, unknown> = {}
  if (reduceOnly) params.reduceOnly = true

  const order = await okx.createOrder(pair, 'limit', side, amount, price, params)

  return {
    id: String(order.id),
    symbol,
    side,
    type: 'limit',
    amount: parseFloat(String(order.amount ?? amount)),
    price,
    status: String(order.status ?? 'unknown'),
    timestamp: new Date(order.timestamp ?? Date.now()),
  }
}

/** Stop-Market 주문 (stopPrice 도달 시 시장가 청산) */
export async function createStopOrder(
  symbol: string,
  side: 'buy' | 'sell',
  stopPrice: number,
  size: number
): Promise<StopOrderResult> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`

  // OKX algo order: trigger 가격 도달 시 시장가 실행
  const order = await okx.createOrder(pair, 'market', side, size, undefined, {
    stopPrice,
    triggerPrice: stopPrice,
    reduceOnly: true,
  })

  return {
    id: String(order.id),
    symbol,
    side,
    stopPrice,
    size,
    status: String(order.status ?? 'unknown'),
    timestamp: new Date(order.timestamp ?? Date.now()),
  }
}

/** 미체결 주문 취소 */
export async function cancelOrder(symbol: string, orderId: string): Promise<void> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`
  await okx.cancelOrder(orderId, pair)
}

/** Stop order 취소 (algo order) */
export async function cancelStopOrder(symbol: string, orderId: string): Promise<void> {
  const okx = getOkxExchange()
  const pair = `${symbol}/USDT:USDT`
  // OKX algo order 취소
  await okx.cancelOrder(orderId, pair, { stop: true })
}

/** 미체결 주문 전체 조회 */
export async function fetchOpenOrders(symbol?: string): Promise<OrderResult[]> {
  const okx = getOkxExchange()
  const pair = symbol ? `${symbol}/USDT:USDT` : undefined

  const orders = await okx.fetchOpenOrders(pair)

  return orders.map((o) => ({
    id: String(o.id),
    symbol: String(o.symbol ?? '').replace('/USDT:USDT', ''),
    side: o.side as 'buy' | 'sell',
    type: (o.type ?? 'market') as 'market' | 'limit',
    amount: parseFloat(String(o.amount ?? 0)),
    price: o.price ? parseFloat(String(o.price)) : null,
    status: String(o.status ?? 'unknown'),
    timestamp: new Date(o.timestamp ?? Date.now()),
  }))
}

// ============================================================
// 포지션 사이징
// ============================================================

/**
 * 포지션 크기 계산
 * positionSize = (accountBalance * maxRiskPct) / (stopLossPct * leverage)
 */
export function calculatePositionSize(
  accountBalance: number,
  maxRiskPct: number,
  stopLossPct: number,
  leverage: number
): number {
  if (stopLossPct <= 0 || leverage <= 0) return 0
  return (accountBalance * maxRiskPct) / (stopLossPct * leverage)
}
