/**
 * 외부 시장 데이터 수집 (BTC 도미넌스, USDT 도미넌스 등)
 * 1시간 메모리 캐시로 API 호출 최소화
 */

interface MarketGlobal {
  btcDominance: number
  ethDominance: number
  totalMarketCap: number
  totalVolume24h: number
  fetchedAt: number
}

let _globalCache: MarketGlobal | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1시간

/**
 * CoinGecko /global API에서 시장 글로벌 데이터 가져오기
 * 무료 30회/분, 1시간 캐시
 */
export async function fetchMarketGlobal(): Promise<MarketGlobal> {
  if (_globalCache && Date.now() - _globalCache.fetchedAt < CACHE_TTL) {
    return _globalCache
  }

  const res = await fetch('https://api.coingecko.com/api/v3/global')
  if (!res.ok) {
    if (_globalCache) return _globalCache // 실패 시 이전 캐시 반환
    throw new Error(`CoinGecko API 실패: ${res.status}`)
  }

  const json = await res.json() as {
    data: {
      market_cap_percentage: { btc: number; eth: number }
      total_market_cap: { usd: number }
      total_volume: { usd: number }
    }
  }

  _globalCache = {
    btcDominance: json.data.market_cap_percentage.btc,
    ethDominance: json.data.market_cap_percentage.eth,
    totalMarketCap: json.data.total_market_cap.usd,
    totalVolume24h: json.data.total_volume.usd,
    fetchedAt: Date.now(),
  }

  console.log(`[시장데이터] BTC 도미넌스: ${_globalCache.btcDominance.toFixed(1)}%, ETH: ${_globalCache.ethDominance.toFixed(1)}%`)
  return _globalCache
}

/**
 * BTC 도미넌스 반환 (%)
 */
export async function getBtcDominance(): Promise<number> {
  const global = await fetchMarketGlobal()
  return global.btcDominance
}

/**
 * 업비트 거래대금 집중도 — 특정 코인의 24시간 거래대금 / 전체 KRW 마켓 거래대금
 */
export async function fetchUpbitVolumeConcentration(): Promise<Map<string, number>> {
  const res = await fetch('https://api.upbit.com/v1/market/all?is_details=false')
  if (!res.ok) throw new Error(`업비트 마켓 조회 실패: ${res.status}`)

  const markets = await res.json() as Array<{ market: string }>
  const krwMarkets = markets
    .filter((m) => m.market.startsWith('KRW-'))
    .map((m) => m.market)

  // 티커 조회 (쉼표 구분 최대 100개씩)
  const concentrationMap = new Map<string, number>()
  let totalVolume = 0
  const volumeMap = new Map<string, number>()

  for (let i = 0; i < krwMarkets.length; i += 100) {
    const batch = krwMarkets.slice(i, i + 100)
    const tickerRes = await fetch(`https://api.upbit.com/v1/ticker?markets=${batch.join(',')}`)
    if (!tickerRes.ok) continue

    const tickers = await tickerRes.json() as Array<{
      market: string
      acc_trade_price_24h: number
    }>

    for (const t of tickers) {
      const symbol = t.market.replace('KRW-', '')
      volumeMap.set(symbol, t.acc_trade_price_24h)
      totalVolume += t.acc_trade_price_24h
    }
  }

  if (totalVolume > 0) {
    for (const [symbol, vol] of volumeMap) {
      concentrationMap.set(symbol, (vol / totalVolume) * 100)
    }
  }

  return concentrationMap
}
