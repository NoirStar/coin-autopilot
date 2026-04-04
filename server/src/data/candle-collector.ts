import type { Candle, Timeframe, Exchange } from '../core/types.js'
import { supabase } from '../services/database.js'
import { fetchOkxCandles as fetchOkxCandlesCCXT } from '../exchange/okx-client.js'

const UPBIT_API = 'https://api.upbit.com/v1'

/** 타임프레임 → 업비트 분봉 단위 */
const TIMEFRAME_MINUTES: Partial<Record<Timeframe, number>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
}

/** 타임프레임 → OKX bar 파라미터 */
const OKX_BAR: Partial<Record<Timeframe, string>> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
}

/** 레이트 리밋 딜레이 (ms) */
const RATE_LIMIT_DELAY = 130 // 초당 ~8회

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── asset_key 변환 유틸 ────────────────────────────────────
// 내부 asset_key 형식: "BTC-KRW", "ETH-USDT" 등
// 업비트 마켓 형식: "KRW-BTC" → asset_key "BTC-KRW"
// OKX instId 형식: "BTC-USDT" → asset_key "BTC-USDT"

/** 업비트 마켓 코드(KRW-BTC)를 asset_key(BTC-KRW)로 변환 */
function upbitMarketToAssetKey(market: string): string {
  const [quote, base] = market.split('-')
  return `${base}-${quote}`
}

/** asset_key(BTC-KRW)를 업비트 마켓 코드(KRW-BTC)로 변환 */
export function assetKeyToUpbitMarket(assetKey: string): string {
  const [base, quote] = assetKey.split('-')
  return `${quote}-${base}`
}

/** asset_key(BTC-USDT)를 OKX instId(BTC-USDT)로 변환 — 동일 형식 */
function assetKeyToOkxInstId(assetKey: string): string {
  return assetKey
}

// ─── 업비트 KRW 마켓 캐시 ───────────────────────────────────

/** 업비트 KRW 마켓 심볼 캐시 (1시간 TTL) */
let _upbitKrwCache: {
  assetKeys: string[]
  koreanNames: Map<string, string>
  fetchedAt: number
} | null = null

const CACHE_TTL = 60 * 60 * 1000 // 1시간

async function _refreshUpbitKrwCache(): Promise<void> {
  const res = await fetch(`${UPBIT_API}/market/all?is_details=false`)
  if (!res.ok) {
    console.error(`업비트 마켓 조회 실패: ${res.status}`)
    if (_upbitKrwCache) return
    throw new Error(`업비트 마켓 API 오류: ${res.status}`)
  }

  const data = await res.json() as Array<{
    market: string
    korean_name: string
    english_name: string
  }>

  const assetKeys: string[] = []
  const koreanNames = new Map<string, string>()

  for (const m of data) {
    if (m.market.startsWith('KRW-') && m.market !== 'KRW-BTC') {
      const assetKey = upbitMarketToAssetKey(m.market) // "ETH-KRW"
      assetKeys.push(assetKey)
      koreanNames.set(assetKey, m.korean_name)
    }
  }

  _upbitKrwCache = { assetKeys, koreanNames, fetchedAt: Date.now() }
  console.log(`[업비트] KRW 마켓 ${assetKeys.length}개 로드 완료`)
}

/**
 * 업비트 KRW 마켓 asset_key 목록 동적 조회 (BTC-KRW 제외)
 * - /v1/market/all API 사용
 * - 1시간 캐싱
 * @returns asset_key 배열 (예: ["ETH-KRW", "XRP-KRW", ...])
 */
export async function fetchUpbitKrwSymbols(): Promise<string[]> {
  if (!_upbitKrwCache || Date.now() - _upbitKrwCache.fetchedAt >= CACHE_TTL) {
    await _refreshUpbitKrwCache()
  }
  return _upbitKrwCache!.assetKeys
}

/**
 * asset_key → 한글 이름 맵 반환 (캐시 갱신 포함)
 * @returns Map<"ETH-KRW", "이더리움"> 등
 */
export async function fetchUpbitKoreanNameMap(): Promise<Map<string, string>> {
  if (!_upbitKrwCache || Date.now() - _upbitKrwCache.fetchedAt >= CACHE_TTL) {
    await _refreshUpbitKrwCache()
  }
  return _upbitKrwCache!.koreanNames
}

// ─── 거래소별 캔들 수집 ─────────────────────────────────────

/**
 * 업비트 캔들 수집
 * @param market 업비트 마켓 코드 (KRW-BTC 등)
 */
async function fetchUpbitCandles(
  market: string,
  timeframe: Timeframe,
  count: number = 200,
  to?: string
): Promise<Candle[]> {
  const minutes = TIMEFRAME_MINUTES[timeframe] ?? 240
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
 * OKX 캔들 수집 — CCXT 래퍼 사용 (okx-client.ts 통일)
 */
async function fetchOkxCandles(
  instId: string,
  timeframe: Timeframe,
  limit: number = 100,
  since?: number,
): Promise<Candle[]> {
  const symbol = instId.split('-')[0] // BTC-USDT → BTC
  const tfMap: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' }
  return fetchOkxCandlesCCXT(symbol, tfMap[timeframe] ?? '4h', limit, since)
}

// ─── DB 저장/조회 (candles 테이블) ───────────────────────

/**
 * 캔들을 candles 테이블에 저장 (upsert, 중복 무시)
 */
async function saveCandlesToDb(
  exchange: Exchange,
  assetKey: string,
  timeframe: Timeframe,
  candles: Candle[]
): Promise<number> {
  if (candles.length === 0) return 0

  const rows = candles.map((c) => ({
    asset_key: assetKey,
    exchange,
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
    .upsert(rows, {
      onConflict: 'asset_key,exchange,timeframe,open_time',
      ignoreDuplicates: true,
      count: 'exact',
    })

  if (error) {
    console.error('캔들 저장 오류:', error.message)
    return 0
  }

  return count ?? rows.length
}

// ─── 공개 API ───────────────────────────────────────────────

/**
 * 히스토리 캔들 일괄 수집 (backfill)
 * @param exchange 거래소
 * @param assetKey 내부 심볼 키 (예: "BTC-KRW", "BTC-USDT")
 * @param timeframe 타임프레임
 * @param months 수집 기간 (개월)
 */
export async function backfillCandles(
  exchange: Exchange,
  assetKey: string,
  timeframe: Timeframe,
  months: number = 6
): Promise<number> {
  let totalSaved = 0
  const candlesPerDay = timeframe === '1m' ? 1440
    : timeframe === '5m' ? 288
    : timeframe === '15m' ? 96
    : timeframe === '1h' ? 24
    : timeframe === '4h' ? 6
    : 1
  const totalCandles = months * 30 * candlesPerDay

  if (exchange === 'upbit') {
    const market = assetKeyToUpbitMarket(assetKey)
    let to: string | undefined
    let remaining = totalCandles

    while (remaining > 0) {
      const batch = await fetchUpbitCandles(market, timeframe, 200, to)
      if (batch.length === 0) break

      const saved = await saveCandlesToDb(exchange, assetKey, timeframe, batch)
      totalSaved += saved
      remaining -= batch.length

      // 다음 페이지 — 업비트 to 형식: yyyy-MM-ddTHH:mm:ss
      to = batch[0].openTime.toISOString().replace(/\.\d{3}Z$/, '')
      await sleep(RATE_LIMIT_DELAY)
    }
  } else if (exchange === 'okx') {
    const instId = assetKeyToOkxInstId(assetKey)
    let remaining = totalCandles
    // since 기반 페이지네이션: 과거부터 수집
    const tfMs: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 }
    const intervalMs = tfMs[timeframe] ?? 14_400_000
    let since = Date.now() - totalCandles * intervalMs

    while (remaining > 0) {
      const batchSize = Math.min(remaining, 300)
      const batch = await fetchOkxCandles(instId, timeframe, batchSize, since)
      if (batch.length === 0) break

      const saved = await saveCandlesToDb(exchange, assetKey, timeframe, batch)
      totalSaved += saved
      remaining -= batch.length

      // 다음 페이지: 마지막 캔들 시간 + 1 interval
      since = batch[batch.length - 1].openTime.getTime() + intervalMs
      await sleep(100)
      if (batch.length < batchSize) break
    }
  }

  console.log(`[V2] ${exchange}/${assetKey} backfill 완료: ${totalSaved}개 캔들 저장`)
  return totalSaved
}

/**
 * 최신 캔들 증분 수집
 * @param exchange 거래소
 * @param assetKeys 내부 심볼 키 배열 (예: ["BTC-KRW", "ETH-KRW"])
 * @param timeframe 타임프레임
 */
export async function collectLatestCandles(
  exchange: Exchange,
  assetKeys: string[],
  timeframe: Timeframe
): Promise<number> {
  let totalSaved = 0

  for (const assetKey of assetKeys) {
    try {
      let candles: Candle[]

      if (exchange === 'upbit') {
        const market = assetKeyToUpbitMarket(assetKey)
        candles = await fetchUpbitCandles(market, timeframe, 10)
        await sleep(RATE_LIMIT_DELAY)
      } else {
        const instId = assetKeyToOkxInstId(assetKey)
        candles = await fetchOkxCandles(instId, timeframe, 10)
      }

      const saved = await saveCandlesToDb(exchange, assetKey, timeframe, candles)
      totalSaved += saved
    } catch (err) {
      console.error(`[V2] 캔들 수집 실패 (${exchange}/${assetKey}):`, err)
    }
  }

  return totalSaved
}

/**
 * candles 테이블에서 캔들 조회
 * @param exchange 거래소
 * @param assetKey 내부 심볼 키 (예: "BTC-KRW")
 * @param timeframe 타임프레임
 * @param limit 최대 조회 수
 */
export async function loadCandles(
  exchange: Exchange,
  assetKey: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<Candle[]> {
  const { data, error } = await supabase
    .from('candles')
    .select('*')
    .eq('asset_key', assetKey)
    .eq('exchange', exchange)
    .eq('timeframe', timeframe)
    .order('open_time', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[V2] 캔들 조회 오류:', error.message)
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
