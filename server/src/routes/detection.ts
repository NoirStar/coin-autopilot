import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { scoreMultipleCoins, computeDetectionScore, type DetectionStrategy } from '../detector/composite-scorer.js'
import { fetchUpbitKrwSymbols } from '../data/candle-collector.js'
import type { Candle } from '../strategy/strategy-base.js'

export const detectionRoutes = new Hono()

const UPBIT_API = 'https://api.upbit.com/v1'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 업비트에서 직접 캔들 가져오기 (DB 거치지 않고 실시간) */
async function fetchUpbitCandlesDirect(
  market: string,
  count: number = 50
): Promise<Candle[]> {
  const url = `${UPBIT_API}/candles/minutes/60?market=${market}&count=${count}`
  console.log(`[탐지] 업비트 요청: ${url}`)
  const res = await fetch(url)
  console.log(`[탐지] 업비트 응답: ${res.status} (${market})`)
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

/** 스캔 대상 — 업비트 KRW 마켓에서 동적으로 가져옴 */

/** GET /api/detection/scan/stream — SSE 스트리밍 전체 알트코인 스캔 */
detectionRoutes.get('/scan/stream', async (c) => {
  const strategyParam = c.req.query('strategy') ?? 'composite'
  const validStrategies = ['composite', 'oversold', 'momentum', 'volume']
  const strategy = (validStrategies.includes(strategyParam) ? strategyParam : 'composite') as DetectionStrategy

  return streamSSE(c, async (stream) => {
    try {
      const btcCandles = await fetchUpbitCandlesDirect('KRW-BTC', 50)
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

      const allKrwSymbols = await fetchUpbitKrwSymbols()
      const total = allKrwSymbols.length

      await stream.writeSSE({
        data: JSON.stringify({ type: 'start', total }),
        event: 'progress',
      })

      const inputs: Array<{
        symbol: string
        candles: Candle[]
        btcPrices: number[]
        currentPrice: number
        openPriceAt9: number
        currentTimeKST: Date
      }> = []

      for (let i = 0; i < total; i++) {
        const symbol = allKrwSymbols[i]
        try {
          await sleep(130)
          const altCandles = await fetchUpbitCandlesDirect(`KRW-${symbol}`, 50)
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

          inputs.push({
            symbol,
            candles: altCandles,
            btcPrices: btcPrices.slice(-altCandles.length),
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

      const results = scoreMultipleCoins(inputs, 20, strategy)

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'complete',
          strategy,
          scannedAt: now.toISOString(),
          totalScanned: inputs.length,
          detected: results.length,
          results: results.map((r) => ({
            symbol: r.symbol,
            score: r.score,
            rsi14: r.rsi14,
            atrPct: r.atrPct,
            changePct: r.changePct,
            price: r.price,
            signals: r.signals,
            reasoning: r.reasoning,
          })),
        }),
        event: 'complete',
      })
    } catch (err) {
      console.error('SSE 탐지 스캔 오류:', err)
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
    const strategyParam = c.req.query('strategy') ?? 'composite'
    const validStrategies = ['composite', 'oversold', 'momentum', 'volume']
    const strategy = (validStrategies.includes(strategyParam) ? strategyParam : 'composite') as DetectionStrategy

    // BTC 캔들 직접 로드
    console.log('[탐지] 스캔 시작 — BTC 캔들 요청')
    const btcCandles = await fetchUpbitCandlesDirect('KRW-BTC', 50)
    console.log(`[탐지] BTC 캔들 수신: ${btcCandles.length}개`)
    if (btcCandles.length < 21) {
      return c.json({ error: `BTC 데이터 부족 (${btcCandles.length}/21)` }, 422)
    }
    const btcPrices = btcCandles.map((cl) => cl.close)

    const now = new Date()
    const kstOffset = 9 * 60 * 60 * 1000
    const kstNow = new Date(now.getTime() + kstOffset)

    // 업비트 KRW 마켓 동적 조회 (상위 50개만 스캔 — 속도)
    const allKrwSymbols = await fetchUpbitKrwSymbols()
    const ALT_UNIVERSE = allKrwSymbols.slice(0, 50)
    console.log(`[탐지] 알트 유니버스: ${ALT_UNIVERSE.length}개 (전체 ${allKrwSymbols.length}개)`)

    // 각 알트코인 스코어링
    const inputs = []
    for (const symbol of ALT_UNIVERSE) {
      try {
        await sleep(130) // 업비트 레이트 리밋 (초당 ~8회)
        const altCandles = await fetchUpbitCandlesDirect(`KRW-${symbol}`, 50)
        if (altCandles.length < 21) continue

        const currentPrice = altCandles[altCandles.length - 1].close
        const openPriceAt9 = altCandles.length > 9
          ? altCandles[altCandles.length - 9].open
          : altCandles[0].open

        inputs.push({
          symbol,
          candles: altCandles,
          btcPrices: btcPrices.slice(-altCandles.length),
          currentPrice,
          openPriceAt9,
          currentTimeKST: kstNow,
        })
      } catch {
        // 개별 코인 실패 시 스킵
      }
    }

    const results = scoreMultipleCoins(inputs, 20, strategy)

    return c.json({
      strategy,
      scannedAt: now.toISOString(),
      totalScanned: inputs.length,
      detected: results.length,
      results: results.map((r) => ({
        symbol: r.symbol,
        score: r.score,
        rsi14: r.rsi14,
        atrPct: r.atrPct,
        changePct: r.changePct,
        price: r.price,
        signals: r.signals,
        reasoning: r.reasoning,
      })),
    })
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

    const result = computeDetectionScore({
      symbol,
      candles: altCandles,
      btcPrices: btcPrices.slice(-altCandles.length),
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
