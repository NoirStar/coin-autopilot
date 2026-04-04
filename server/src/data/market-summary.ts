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

  // 실패한 항목 로그 (디버그용)
  if (funding.status === 'rejected') console.warn('[시장] 펀딩비 조회 실패:', funding.reason)
  if (oi.status === 'rejected') console.warn('[시장] OI 조회 실패:', oi.reason)
  if (lsRatio.status === 'rejected') console.warn('[시장] 롱숏비율 조회 실패:', lsRatio.reason)
  if (kimchi.status === 'rejected') console.warn('[시장] 김프 조회 실패:', kimchi.reason)

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
  // CCXT로 실패할 수 있으므로 REST 폴백 포함
  try {
    const { current } = await fetchFundingRate('BTC')
    // CCXT fundingRate는 0.00015 같은 소수 → % 변환
    return Math.round(current * 100 * 1000) / 1000 // 0.00015 → 0.015%
  } catch {
    // REST API 직접 호출 폴백
    try {
      const res = await fetch('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')
      if (!res.ok) return 0
      const json = await res.json() as { data: Array<{ fundingRate: string }> }
      const rate = Number(json.data?.[0]?.fundingRate ?? 0)
      return Math.round(rate * 100 * 1000) / 1000
    } catch {
      return 0
    }
  }
}

async function fetchBtcOpenInterest(): Promise<number> {
  // OKX REST API 직접 호출 (인증 불필요, CCXT보다 안정적)
  try {
    const res = await fetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP')
    if (!res.ok) return 0
    const json = await res.json() as { data: Array<{ oi: string; oiCcy: string }> }
    const entry = json.data?.[0]
    if (!entry) return 0
    // oi는 계약 수(BTC 단위), BTC 가격을 곱해서 USD로 변환
    const oiBtc = Number(entry.oi ?? 0)
    // BTC 가격 조회
    const priceRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP')
    if (!priceRes.ok) return oiBtc
    const priceJson = await priceRes.json() as { data: Array<{ last: string }> }
    const price = Number(priceJson.data?.[0]?.last ?? 0)
    return Math.round(oiBtc * price)
  } catch {
    return 0
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

    // OKX BTC/USDT 현물 가격 (REST API 직접 — 선물 가격 왜곡 방지)
    let btcUsdt = 0
    try {
      const okxRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT')
      if (okxRes.ok) {
        const okxData = await okxRes.json() as { data: Array<{ last: string }> }
        btcUsdt = Number(okxData.data?.[0]?.last ?? 0)
      }
    } catch { /* 폴백 아래 */ }
    // 현물 실패 시 CCXT 선물 가격 사용
    if (btcUsdt === 0) {
      const okx = getOkxExchange()
      const ticker = await okx.fetchTicker('BTC/USDT:USDT')
      btcUsdt = ticker.last ?? 0
    }

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
