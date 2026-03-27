import type { Candle, Timeframe, Exchange } from '../strategy/strategy-base.js'
import { supabase } from '../services/database.js'

const UPBIT_API = 'https://api.upbit.com/v1'
const OKX_API = 'https://www.okx.com/api/v5'

/** 타임프레임 → 업비트 분봉 단위 */
const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1h': 60,
  '4h': 240,
  '1d': 1440,
}

/** 타임프레임 → OKX bar 파라미터 */
const OKX_BAR: Record<Timeframe, string> = {
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
}

/** 레이트 리밋 딜레이 (ms) */
const RATE_LIMIT_DELAY = 130 // 초당 ~8회

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 업비트 캔들 수집
 * @param market KRW-BTC, KRW-ETH 등
 */
async function fetchUpbitCandles(
  market: string,
  timeframe: Timeframe,
  count: number = 200,
  to?: string
): Promise<Candle[]> {
  const minutes = TIMEFRAME_MINUTES[timeframe]
  const url = new URL(`${UPBIT_API}/candles/minutes/${minutes}`)
  url.searchParams.set('market', market)
  url.searchParams.set('count', String(Math.min(count, 200)))
  if (to) url.searchParams.set('to', to)

  const res = await fetch(url.toString())
  if (res.status === 429) {
    console.warn(`업비트 레이트 리밋 (${market}), 1초 대기`)
    await sleep(1000)
    return fetchUpbitCandles(market, timeframe, count, to)
  }
  if (!res.ok) throw new Error(`업비트 API 오류: ${res.status} ${await res.text()}`)

  const data = await res.json() as Array<{
    candle_date_time_utc: string
    opening_price: number
    high_price: number
    low_price: number
    trade_price: number
    candle_acc_trade_volume: number
  }>

  return data.map((d) => ({
    openTime: new Date(d.candle_date_time_utc + 'Z'),
    open: d.opening_price,
    high: d.high_price,
    low: d.low_price,
    close: d.trade_price,
    volume: d.candle_acc_trade_volume,
  })).reverse() // 오래된 순서로 정렬
}

/**
 * OKX 캔들 수집
 * @param instId BTC-USDT 등
 */
async function fetchOkxCandles(
  instId: string,
  timeframe: Timeframe,
  limit: number = 100,
  after?: string
): Promise<Candle[]> {
  const bar = OKX_BAR[timeframe]
  const url = new URL(`${OKX_API}/market/candles`)
  url.searchParams.set('instId', instId)
  url.searchParams.set('bar', bar)
  url.searchParams.set('limit', String(Math.min(limit, 100)))
  if (after) url.searchParams.set('after', after)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`OKX API 오류: ${res.status} ${await res.text()}`)

  const json = await res.json() as { data: string[][] }

  return json.data.map((d) => ({
    openTime: new Date(parseInt(d[0])),
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
  })).reverse()
}

/**
 * 히스토리 캔들 일괄 수집 (backfill)
 */
export async function backfillCandles(
  exchange: Exchange,
  symbol: string,
  timeframe: Timeframe,
  months: number = 6
): Promise<number> {
  let totalSaved = 0
  const candlesPerDay = timeframe === '1h' ? 24 : timeframe === '4h' ? 6 : 1
  const totalCandles = months * 30 * candlesPerDay

  if (exchange === 'upbit') {
    const market = `KRW-${symbol}`
    let to: string | undefined
    let remaining = totalCandles

    while (remaining > 0) {
      const batch = await fetchUpbitCandles(market, timeframe, 200, to)
      if (batch.length === 0) break

      const saved = await saveCandlesToDb(exchange, symbol, timeframe, batch)
      totalSaved += saved
      remaining -= batch.length

      // 다음 페이지 — 업비트 to 형식: yyyy-MM-ddTHH:mm:ss
      to = batch[0].openTime.toISOString().replace(/\.\d{3}Z$/, '')
      await sleep(RATE_LIMIT_DELAY)
    }
  } else if (exchange === 'okx') {
    const instId = `${symbol}-USDT`
    let after: string | undefined
    let remaining = totalCandles

    while (remaining > 0) {
      const batch = await fetchOkxCandles(instId, timeframe, 100, after)
      if (batch.length === 0) break

      const saved = await saveCandlesToDb(exchange, symbol, timeframe, batch)
      totalSaved += saved
      remaining -= batch.length

      after = String(batch[0].openTime.getTime())
      await sleep(100)
    }
  }

  console.log(`${exchange}/${symbol} backfill 완료: ${totalSaved}개 캔들 저장`)
  return totalSaved
}

/**
 * 최신 캔들 증분 수집
 */
export async function collectLatestCandles(
  exchange: Exchange,
  symbols: string[],
  timeframe: Timeframe
): Promise<number> {
  let totalSaved = 0

  for (const symbol of symbols) {
    try {
      let candles: Candle[]

      if (exchange === 'upbit') {
        candles = await fetchUpbitCandles(`KRW-${symbol}`, timeframe, 10)
        await sleep(RATE_LIMIT_DELAY)
      } else {
        candles = await fetchOkxCandles(`${symbol}-USDT`, timeframe, 10)
      }

      const saved = await saveCandlesToDb(exchange, symbol, timeframe, candles)
      totalSaved += saved
    } catch (err) {
      console.error(`캔들 수집 실패 (${exchange}/${symbol}):`, err)
    }
  }

  return totalSaved
}

/**
 * 캔들을 Supabase에 저장 (upsert, 중복 무시)
 */
async function saveCandlesToDb(
  exchange: string,
  symbol: string,
  timeframe: string,
  candles: Candle[]
): Promise<number> {
  if (candles.length === 0) return 0

  const rows = candles.map((c) => ({
    exchange,
    symbol,
    timeframe,
    open_time: c.openTime.toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }))

  const { error, count } = await supabase
    .from('candles')
    .upsert(rows, { onConflict: 'exchange,symbol,timeframe,open_time', ignoreDuplicates: true, count: 'exact' })

  if (error) {
    console.error('캔들 저장 오류:', error.message)
    return 0
  }

  return count ?? rows.length
}

/**
 * DB에서 캔들 조회
 */
export async function loadCandles(
  exchange: Exchange,
  symbol: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<Candle[]> {
  const { data, error } = await supabase
    .from('candles')
    .select('*')
    .eq('exchange', exchange)
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .order('open_time', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('캔들 조회 오류:', error.message)
    return []
  }

  return (data ?? []).map((d) => ({
    openTime: new Date(d.open_time),
    open: Number(d.open),
    high: Number(d.high),
    low: Number(d.low),
    close: Number(d.close),
    volume: Number(d.volume),
  }))
}
