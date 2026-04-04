import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { scoreMultipleCoins, computeDetectionScore } from '../detector/composite-scorer.js'
import { fetchUpbitKrwSymbols, fetchUpbitKoreanNameMap, assetKeyToUpbitMarket } from '../data/candle-collector.js'
import { supabase } from '../services/database.js'
import { notifyStrongBuySignals } from '../services/telegram-notifier.js'
import type { Candle } from '../core/types.js'
import type { OrderbookSnapshot } from '../detector/orderbook-imbalance.js'

export const detectionRoutes = new Hono()

const UPBIT_API = 'https://api.upbit.com/v1'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 업비트 오더북 가져오기 */
async function fetchUpbitOrderbook(market: string): Promise<OrderbookSnapshot | undefined> {
  try {
    const res = await fetch(`${UPBIT_API}/orderbook?markets=${market}`)
    if (!res.ok) return undefined
    const data = await res.json() as Array<{
      orderbook_units: Array<{
        ask_price: number
        bid_price: number
        ask_size: number
        bid_size: number
      }>
    }>
    if (!data[0]?.orderbook_units) return undefined
    const units = data[0].orderbook_units
    return {
      bids: units.map((u) => ({ price: u.bid_price, size: u.bid_size })),
      asks: units.map((u) => ({ price: u.ask_price, size: u.ask_size })),
    }
  } catch {
    return undefined
  }
}

/** 업비트에서 직접 캔들 가져오기 (DB 거치지 않고 실시간) */
async function fetchUpbitCandlesDirect(
  market: string,
  count: number = 50
): Promise<Candle[]> {
  const url = `${UPBIT_API}/candles/minutes/60?market=${market}&count=${count}`
  const res = await fetch(url)
  if (res.status === 429) {
    await sleep(1000)
    return fetchUpbitCandlesDirect(market, count)
  }
  if (!res.ok) {
    const text = await res.text()
    console.error(`[탐지] 업비트 에러: ${res.status} ${text}`)
    throw new Error(`업비트 API: ${res.status}`)
  }

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
  })).reverse()
}

/** 스캔 결과를 Supabase에 캐시 저장 */
async function saveScanToCache(
  totalScanned: number,
  detected: number,
  results: unknown[],
  durationMs: number
): Promise<void> {
  try {
    const { error } = await supabase.from('detection_cache').insert({
      total_scanned: totalScanned,
      detected,
      results,
      scan_duration_ms: durationMs,
      created_by: 'system',
    })
    if (error) {
      console.error('[캐시] detection_cache 저장 실패:', error.message)
    } else {
      console.log(`[캐시] detection_cache 저장 완료 (${totalScanned}개 스캔, ${detected}개 감지)`)
    }
  } catch (err) {
    console.error('[캐시] detection_cache 저장 오류:', err)
  }
}

/** 30일 이전 캐시 삭제 */
export async function cleanOldCache(): Promise<void> {
  try {
    const { error } = await supabase
      .from('detection_cache')
      .delete()
      .lt('scanned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    if (error) console.error('[캐시] 오래된 캐시 삭제 실패:', error.message)
    else console.log('[캐시] 30일 이전 캐시 정리 완료')
  } catch (err) {
    console.error('[캐시] 캐시 정리 오류:', err)
  }
}

/** 전체 알트코인 스캔 실행 (캐시 저장 포함) */
export async function runFullScan(): Promise<{
  scannedAt: string
  totalScanned: number
  detected: number
  results: Array<{
    symbol: string
    koreanName: string
    score: number
    rsi14: number
    atrPct: number
    changePct: number
    price: number
    signals: unknown
    reasoning: unknown
  }>
}> {
  const startTime = Date.now()

  const btcCandles = await fetchUpbitCandlesDirect('KRW-BTC', 50)
  if (btcCandles.length < 21) {
    throw new Error(`BTC 데이터 부족 (${btcCandles.length}/21)`)
  }
  const btcPrices = btcCandles.map((cl) => cl.close)
  const now = new Date()
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)

  const allKrwSymbols = await fetchUpbitKrwSymbols()
  const koreanNames = await fetchUpbitKoreanNameMap()

  const inputs: Array<{
    symbol: string
    candles: Candle[]
    btcPrices: number[]
    currentPrice: number
    openPriceAt9: number
    currentTimeKST: Date
    orderbook?: OrderbookSnapshot
  }> = []

  for (const symbol of allKrwSymbols) {
    try {
      await sleep(130)
      const market = assetKeyToUpbitMarket(symbol)
      const altCandles = await fetchUpbitCandlesDirect(market, 50)
      if (altCandles.length < 21) continue

      const currentPrice = altCandles[altCandles.length - 1].close
      const openPriceAt9 = altCandles.length > 9
        ? altCandles[altCandles.length - 9].open
        : altCandles[0].open

      // 오더북 데이터 가져오기 (실패해도 무시)
      const orderbook = await fetchUpbitOrderbook(market)

      inputs.push({
        symbol,
        candles: altCandles,
        btcPrices: btcPrices.slice(-altCandles.length),
        currentPrice,
        openPriceAt9,
        currentTimeKST: kstNow,
        orderbook,
      })
    } catch {
      // 개별 코인 실패 시 스킵
    }
  }

  const scored = scoreMultipleCoins(inputs, 20, 'composite')
  const durationMs = Date.now() - startTime

  const mappedResults = scored.map((r) => ({
    symbol: r.symbol,
    koreanName: koreanNames.get(r.symbol) ?? r.symbol,
    score: r.score,
    rsi14: r.rsi14,
    atrPct: r.atrPct,
    changePct: r.changePct,
    price: r.price,
    signals: r.signals,
    reasoning: r.reasoning,
  }))

  // 캐시 저장
  await saveScanToCache(inputs.length, scored.length, mappedResults, durationMs)

  // 강력 매수 알림 (score >= 0.8)
  await notifyStrongBuySignals(mappedResults.map((r) => ({
    symbol: r.symbol,
    koreanName: r.koreanName,
    score: r.score,
    price: r.price,
    changePct: r.changePct,
  })))

  return {
    scannedAt: now.toISOString(),
    totalScanned: inputs.length,
    detected: scored.length,
    results: mappedResults,
  }
}

/** GET /api/detection/cached — 최신 캐시 결과 반환 */
detectionRoutes.get('/cached', async (c) => {
  try {
    const { data, error } = await supabase
      .from('detection_cache')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return c.json({ error: '캐시 조회 실패' }, 500)
    }

    if (!data) {
      return c.json({ cached: false, message: '아직 스캔 결과가 없습니다' }, 200)
    }

    return c.json({
      cached: true,
      scannedAt: data.scanned_at,
      totalScanned: data.total_scanned,
      detected: data.detected,
      results: data.results,
      scanDurationMs: data.scan_duration_ms,
    })
  } catch (err) {
    console.error('[캐시] 조회 오류:', err)
    return c.json({ error: '캐시 조회 실패' }, 500)
  }
})

/** POST /api/detection/refresh — 수동 갱신 (전체 스캔 + 캐시 저장) */
detectionRoutes.post('/refresh', async (c) => {
  try {
    const result = await runFullScan()
    return c.json(result)
  } catch (err) {
    console.error('[갱신] 스캔 오류:', err)
    return c.json({ error: '스캔 실패' }, 500)
  }
})

/** GET /api/detection/scan/stream — SSE 스트리밍 전체 알트코인 스캔 */
detectionRoutes.get('/scan/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    const startTime = Date.now()
    try {
      let btcCandles: Candle[]
      try {
        btcCandles = await fetchUpbitCandlesDirect('KRW-BTC', 50)
      } catch (btcErr) {
        console.error('[탐지 SSE] BTC 캔들 조회 실패:', btcErr)
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: 'BTC 캔들 조회 실패 (업비트 API 오류)' }),
          event: 'scan-error',
        })
        return
      }
      if (btcCandles.length < 21) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: `BTC 데이터 부족 (${btcCandles.length}/21)` }),
          event: 'scan-error',
        })
        return
      }
      const btcPrices = btcCandles.map((cl) => cl.close)
      const now = new Date()
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)

      let allKrwSymbols: string[]
      let koreanNames: Map<string, string>
      try {
        allKrwSymbols = await fetchUpbitKrwSymbols()
        koreanNames = await fetchUpbitKoreanNameMap()
      } catch (symbolErr) {
        console.error('[탐지 SSE] 심볼 목록 조회 실패:', symbolErr)
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: '업비트 마켓 목록 조회 실패' }),
          event: 'scan-error',
        })
        return
      }
      const total = allKrwSymbols.length

      await stream.writeSSE({
        data: JSON.stringify({ type: 'start', total }),
        event: 'progress',
      })

      const inputs: Array<{
        symbol: string
        candles: Candle[]
        btcPrices: number[]
        orderbook?: OrderbookSnapshot
        currentPrice: number
        openPriceAt9: number
        currentTimeKST: Date
      }> = []

      for (let i = 0; i < total; i++) {
        const symbol = allKrwSymbols[i]
        try {
          await sleep(130)
          const market = assetKeyToUpbitMarket(symbol)
          const altCandles = await fetchUpbitCandlesDirect(market, 50)
          if (altCandles.length < 21) {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'scan', current: i + 1, total, symbol, status: 'skip' }),
              event: 'progress',
            })
            continue
          }

          const currentPrice = altCandles[altCandles.length - 1].close
          const openPriceAt9 = altCandles.length > 9
            ? altCandles[altCandles.length - 9].open
            : altCandles[0].open
          const orderbook = await fetchUpbitOrderbook(market)

          inputs.push({
            symbol,
            candles: altCandles,
            btcPrices: btcPrices.slice(-altCandles.length),
            orderbook,
            currentPrice,
            openPriceAt9,
            currentTimeKST: kstNow,
          })

          await stream.writeSSE({
            data: JSON.stringify({ type: 'scan', current: i + 1, total, symbol, status: 'ok' }),
            event: 'progress',
          })
        } catch {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'scan', current: i + 1, total, symbol, status: 'error' }),
            event: 'progress',
          })
        }
      }

      const results = scoreMultipleCoins(inputs, 20, 'composite')
      const durationMs = Date.now() - startTime

      const mappedResults = results.map((r) => ({
        symbol: r.symbol,
        koreanName: koreanNames.get(r.symbol) ?? r.symbol,
        score: r.score,
        rsi14: r.rsi14,
        atrPct: r.atrPct,
        changePct: r.changePct,
        price: r.price,
        signals: r.signals,
        reasoning: r.reasoning,
      }))

      // 캐시 저장
      await saveScanToCache(inputs.length, results.length, mappedResults, durationMs)

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'complete',
          scannedAt: now.toISOString(),
          totalScanned: inputs.length,
          detected: results.length,
          results: mappedResults,
        }),
        event: 'complete',
      })
    } catch (err) {
      console.error('[탐지 SSE] 스캔 오류:', err)
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: '탐지 스캔 실패' }),
        event: 'scan-error',
      })
    }
  })
})

/** GET /api/detection/scan — 전체 알트코인 스캔 (공개, 폴백) */
detectionRoutes.get('/scan', async (c) => {
  try {
    const result = await runFullScan()
    return c.json(result)
  } catch (err) {
    console.error('탐지 스캔 오류:', err)
    return c.json({ error: '탐지 스캔 실패' }, 500)
  }
})

/** GET /api/detection/score/:symbol — 단일 코인 상세 스코어 */
detectionRoutes.get('/score/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase()

  try {
    const btcCandles = await fetchUpbitCandlesDirect('KRW-BTC', 50)
    const altCandles = await fetchUpbitCandlesDirect(`KRW-${symbol}`, 50)

    if (btcCandles.length < 21 || altCandles.length < 21) {
      return c.json({ error: '데이터 부족' }, 422)
    }

    const btcPrices = btcCandles.map((cl) => cl.close)
    const currentPrice = altCandles[altCandles.length - 1].close
    const now = new Date()
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const openPriceAt9 = altCandles.length > 9
      ? altCandles[altCandles.length - 9].open
      : altCandles[0].open
    const orderbook = await fetchUpbitOrderbook(`KRW-${symbol}`)

    const result = computeDetectionScore({
      symbol,
      candles: altCandles,
      btcPrices: btcPrices.slice(-altCandles.length),
      orderbook,
      currentPrice,
      openPriceAt9,
      currentTimeKST: kstNow,
    })

    return c.json({
      scannedAt: now.toISOString(),
      ...result,
    })
  } catch (err) {
    console.error(`탐지 스코어 오류 (${symbol}):`, err)
    return c.json({ error: '스코어 계산 실패' }, 500)
  }
})
