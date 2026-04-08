import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { supabase } from '../services/database.js'

export const portfolioRoutes = new Hono()

/** GET /api/portfolio/balance — 거래소 잔고 조회 (1인 사용, 무인증) */
portfolioRoutes.get('/balance', async (c) => {
  // live_positions + paper_positions 기반 잔고 집계
  const [liveResult, paperResult, liveEquityResult, paperEquityResult] = await Promise.all([
    supabase
      .from('live_positions')
      .select('asset_key, exchange, side, current_qty, entry_price, unrealized_pnl')
      .eq('status', 'open'),
    supabase
      .from('paper_positions')
      .select('asset_key, side, current_qty, entry_price, unrealized_pnl')
      .eq('status', 'open'),
    supabase
      .from('equity_snapshots')
      .select('total_equity')
      .eq('source', 'live')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('equity_snapshots')
      .select('total_equity')
      .eq('source', 'paper')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const livePositions = (liveResult.data ?? []).map((p) => ({
    symbol: p.asset_key,
    qty: Number(p.current_qty),
    entryPrice: Number(p.entry_price),
    pnl: Number(p.unrealized_pnl ?? 0),
  }))

  const upbitPositions = livePositions.filter((p) =>
    (liveResult.data ?? []).find((d) => d.asset_key === p.symbol)?.exchange === 'upbit',
  )
  const okxPositions = livePositions.filter((p) =>
    (liveResult.data ?? []).find((d) => d.asset_key === p.symbol)?.exchange === 'okx',
  )

  // 에퀴티 스냅샷에서 잔고 추출
  const liveEquity = liveEquityResult.data
  const paperEquity = paperEquityResult.data

  // 업비트 실계좌 조회 (KRW + 코인 평가금 합산)
  const hasUpbitKeys = !!(process.env.UPBIT_ACCESS_KEY && process.env.UPBIT_SECRET_KEY)
  const okxConfigured = !!(process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY)

  let upbitConnected = false
  let upbitTotalKrw = 0
  let upbitHoldings: Array<{ symbol: string; qty: number; entryPrice: number; pnl: number }> = []

  console.log(`[포트폴리오] 업비트 키 존재: ${hasUpbitKeys}, OKX 키 존재: ${okxConfigured}`)
  if (hasUpbitKeys) {
    try {
      const accounts = await fetchUpbitAccounts()
      console.log(`[포트폴리오] 업비트 계좌 ${accounts.length}개 조회 성공`)
      upbitConnected = true

      let krwBalance = 0
      const coinAccounts: Array<{ currency: string; balance: number; avgBuyPrice: number }> = []

      for (const a of accounts) {
        const bal = Number(a.balance) + Number(a.locked)
        if (a.currency === 'KRW') {
          krwBalance = bal
        } else if (bal > 0) {
          coinAccounts.push({
            currency: a.currency,
            balance: bal,
            avgBuyPrice: Number(a.avg_buy_price),
          })
        }
      }

      // KRW 마켓 존재 여부 확인 → 없는 코인은 BTC 마켓 등이라 현재가 조회 불가
      let krwMarketSet = new Set<string>()
      try {
        const marketRes = await fetch('https://api.upbit.com/v1/market/all?isDetails=false')
        if (marketRes.ok) {
          const allMarkets = await marketRes.json() as Array<{ market: string }>
          krwMarketSet = new Set(allMarkets.filter((m) => m.market.startsWith('KRW-')).map((m) => m.market))
        }
      } catch { /* 마켓 목록 실패 시 전체 시도 */ }

      // KRW 마켓 코인과 비-KRW 코인 분리
      const krwCoins = coinAccounts.filter((c) => krwMarketSet.size === 0 || krwMarketSet.has(`KRW-${c.currency}`))
      const nonKrwCoins = coinAccounts.filter((c) => krwMarketSet.size > 0 && !krwMarketSet.has(`KRW-${c.currency}`))

      // KRW 마켓 코인 현재가 조회
      if (krwCoins.length > 0) {
        const markets = krwCoins.map((c) => `KRW-${c.currency}`).join(',')
        try {
          const tickerRes = await fetch(`https://api.upbit.com/v1/ticker?markets=${markets}`)
          if (tickerRes.ok) {
            const tickers = await tickerRes.json() as Array<{ market: string; trade_price: number }>
            const priceMap = new Map(tickers.map((t) => [t.market, t.trade_price]))

            for (const coin of krwCoins) {
              const market = `KRW-${coin.currency}`
              const currentPrice = priceMap.get(market) ?? 0
              const evalKrw = coin.balance * currentPrice
              const costKrw = coin.balance * coin.avgBuyPrice
              const pnl = costKrw > 0 ? ((evalKrw - costKrw) / costKrw) * 100 : 0

              upbitTotalKrw += evalKrw
              upbitHoldings.push({
                symbol: coin.currency,
                qty: coin.balance,
                entryPrice: Math.round(evalKrw),
                pnl: Math.round(pnl * 100) / 100,
              })
            }
          }
        } catch { /* 현재가 실패 시 아래 폴백 */ }
      }

      // 비-KRW 마켓 코인은 제외 (BTC 마켓은 원화 평가 불가)

      // 현재가 조회 실패 시 매입가 기준 폴백
      if (upbitHoldings.length === 0 && krwCoins.length > 0) {
        for (const coin of krwCoins) {
          const evalKrw = coin.balance * coin.avgBuyPrice
          upbitTotalKrw += evalKrw
          upbitHoldings.push({
            symbol: coin.currency,
            qty: coin.balance,
            entryPrice: Math.round(evalKrw),
            pnl: 0,
          })
        }
      }

      upbitTotalKrw += krwBalance
    } catch (err) {
      console.warn('[포트폴리오] 업비트 잔고 조회 실패:', err instanceof Error ? err.message : err)
    }
  }

  console.log(`[포트폴리오] 응답: connected=${upbitConnected}, totalKrw=${upbitTotalKrw}, holdings=${upbitHoldings.length}개`)

  return c.json({
    upbit: {
      configured: hasUpbitKeys,
      connected: upbitConnected,
      krw: Math.round(upbitTotalKrw),
      positions: upbitHoldings,
    },
    okx: {
      configured: okxConfigured,
      usd: Number(liveEquity?.total_equity ?? 0),
      positions: okxPositions,
    },
    paper: {
      equity: Number(paperEquity?.total_equity ?? 0),
      positions: (paperResult.data ?? []).map((p) => ({
        symbol: p.asset_key,
        qty: Number(p.current_qty),
        entryPrice: Number(p.entry_price),
        pnl: Number(p.unrealized_pnl ?? 0),
      })),
    },
  })
})

/** GET /api/portfolio/positions — 활성 포지션 (1인 사용, 무인증) */
portfolioRoutes.get('/positions', async (c) => {
  const [live, paper] = await Promise.all([
    supabase
      .from('live_positions')
      .select('*')
      .eq('status', 'open')
      .order('entry_time', { ascending: false }),
    supabase
      .from('paper_positions')
      .select('*')
      .eq('status', 'open')
      .order('entry_time', { ascending: false }),
  ])

  return c.json({
    data: [
      ...(live.data ?? []).map((p) => ({ ...p, session_type: 'live' })),
      ...(paper.data ?? []).map((p) => ({ ...p, session_type: 'paper' })),
    ],
  })
})

/** GET /api/portfolio/trades — 거래 내역 (1인 사용, 무인증) */
portfolioRoutes.get('/trades', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100)
  const offset = parseInt(c.req.query('offset') || '0', 10)
  const exchange = c.req.query('exchange')
  const days = parseInt(c.req.query('days') || '0', 10)

  // live_positions에서 청산된 거래 조회
  let query = supabase
    .from('live_positions')
    .select('*', { count: 'exact' })
    .eq('status', 'closed')
    .order('exit_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (exchange) {
    query = query.eq('exchange', exchange)
  }

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('exit_time', since)
  }

  const { data, error, count } = await query

  if (error) {
    return c.json({ error: '거래 내역 조회 실패' }, 500)
  }

  return c.json({
    data: (data ?? []).map((p) => ({
      id: p.id,
      exchange: p.exchange,
      symbol: p.asset_key,
      direction: p.side,
      entry_price: Number(p.entry_price),
      exit_price: Number(p.exit_price ?? p.entry_price ?? 0),
      quantity: Number(p.current_qty),
      pnl: Number(p.realized_pnl ?? 0),
      pnl_pct: Number(p.entry_price) > 0 && Number(p.current_qty) > 0
        ? (Number(p.realized_pnl ?? 0) / (Number(p.entry_price) * Number(p.current_qty))) * 100
        : 0,
      strategy: p.strategy_id ?? '',
      session_type: 'live',
      closed_at: p.exit_time,
    })),
    total: count ?? 0,
    limit,
    offset,
  })
})

// ─── 업비트 계좌 조회 ───────────────────────────────────────

interface UpbitAccount {
  currency: string
  balance: string
  locked: string
  avg_buy_price: string
}

/** 업비트 계좌 잔고 조회 (JWT 인증) */
async function fetchUpbitAccounts(): Promise<UpbitAccount[]> {
  const accessKey = process.env.UPBIT_ACCESS_KEY ?? ''
  const secretKey = process.env.UPBIT_SECRET_KEY ?? ''
  if (!accessKey || !secretKey) return []

  const token = jwt.sign(
    { access_key: accessKey, nonce: randomUUID() },
    secretKey,
    { algorithm: 'HS512' },
  )

  const res = await fetch('https://api.upbit.com/v1/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`업비트 계좌 조회 실패: ${res.status}`)
  }

  return res.json() as Promise<UpbitAccount[]>
}
