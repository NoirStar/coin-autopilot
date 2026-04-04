/**
 * 시장 상황 요약 수집 — 대시보드 MarketPanel용
 *
 * OKX: 펀딩비, OI, 롱숏비율
 * Upbit + OKX: 김치 프리미엄
 *
 * 5분 TTL 인메모리 캐시. 대시보드 polling(30초)에서 매번 호출되지만
 * 실제 거래소 API는 5분에 1회만.
 */

import { getOkxExchange, fetchFundingRate } from '../exchange/okx-client.js'

export interface MarketSummary {
  // 변동성 (ATR 기반, regime_snapshots에서)
  volatility: 'low' | 'medium' | 'high'

  // OKX 선물 데이터
  fundingRate: number        // BTC 펀딩비 (%)
  openInterest: number       // BTC OI (USD)
  longShortRatio: number     // 롱/숏 비율

  // 김치 프리미엄
  kimchiPremium: number      // %

  updatedAt: string
}

let _cache: { data: MarketSummary; expiresAt: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5분

/**
 * 시장 상황 요약 반환 (5분 캐시)
 */
export async function getMarketSummary(atrPct: number | null): Promise<MarketSummary> {
  if (_cache && Date.now() < _cache.expiresAt) {
    // ATR 기반 volatility만 업데이트 (regime에서 더 자주 갱신됨)
    _cache.data.volatility = atrToVolatility(atrPct)
    return _cache.data
  }

  const [funding, oi, lsRatio, kimchi] = await Promise.allSettled([
    fetchBtcFunding(),
    fetchBtcOpenInterest(),
    fetchLongShortRatio(),
    fetchKimchiPremium(),
  ])

  const summary: MarketSummary = {
    volatility: atrToVolatility(atrPct),
    fundingRate: funding.status === 'fulfilled' ? funding.value : 0,
    openInterest: oi.status === 'fulfilled' ? oi.value : 0,
    longShortRatio: lsRatio.status === 'fulfilled' ? lsRatio.value : 0,
    kimchiPremium: kimchi.status === 'fulfilled' ? kimchi.value : 0,
    updatedAt: new Date().toISOString(),
  }

  _cache = { data: summary, expiresAt: Date.now() + CACHE_TTL_MS }
  return summary
}

function atrToVolatility(atrPct: number | null): 'low' | 'medium' | 'high' {
  if (!atrPct) return 'low'
  if (atrPct > 3) return 'high'
  if (atrPct > 1.5) return 'medium'
  return 'low'
}

// ─── 개별 수집 함수 ─────────────────────────────────────────

async function fetchBtcFunding(): Promise<number> {
  const { current } = await fetchFundingRate('BTC')
  return Math.round(current * 10000) / 100 // 소수점 → % 변환 (0.0001 → 0.01%)
}

async function fetchBtcOpenInterest(): Promise<number> {
  try {
    const okx = getOkxExchange()
    // CCXT fetchOpenInterest
    const oi = await okx.fetchOpenInterest('BTC/USDT:USDT')
    return Number(oi.openInterestAmount ?? 0) * Number(oi.info?.last ?? 0) // 계약 수 * 가격 = USD
  } catch {
    // fetchOpenInterest 미지원 시 REST 폴백
    try {
      const res = await fetch('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=5m')
      if (!res.ok) return 0
      const json = await res.json() as { data: Array<[string, string, string]> }
      const latest = json.data?.[0]
      return latest ? Number(latest[1]) : 0 // OI value
    } catch {
      return 0
    }
  }
}

async function fetchLongShortRatio(): Promise<number> {
  try {
    // OKX 롱/숏 비율 API
    const res = await fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=5m')
    if (!res.ok) return 0
    const json = await res.json() as { data: Array<[string, string]> }
    const latest = json.data?.[0]
    return latest ? Number(latest[1]) : 0
  } catch {
    return 0
  }
}

async function fetchKimchiPremium(): Promise<number> {
  try {
    // Upbit BTC/KRW 가격
    const upbitRes = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC')
    if (!upbitRes.ok) return 0
    const upbitData = await upbitRes.json() as Array<{ trade_price: number }>
    const btcKrw = upbitData[0]?.trade_price ?? 0

    // OKX BTC/USDT 가격 (이미 초기화된 CCXT 인스턴스 사용)
    const okx = getOkxExchange()
    const ticker = await okx.fetchTicker('BTC/USDT:USDT')
    const btcUsdt = ticker.last ?? 0

    // 환율 (하나은행 API 또는 고정 폴백)
    let usdKrw = 1380 // 폴백
    try {
      const fxRes = await fetch('https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWUSD')
      if (fxRes.ok) {
        const fxData = await fxRes.json() as Array<{ basePrice: number }>
        usdKrw = fxData[0]?.basePrice ?? 1380
      }
    } catch { /* 폴백 사용 */ }

    if (btcUsdt === 0 || usdKrw === 0) return 0

    const btcKrwFromUsdt = btcUsdt * usdKrw
    const premium = ((btcKrw - btcKrwFromUsdt) / btcKrwFromUsdt) * 100

    return Math.round(premium * 100) / 100
  } catch {
    return 0
  }
}
