import { Hono } from 'hono'
import { scoreMultipleCoins } from '../detector/composite-scorer.js'
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
  const res = await fetch(url)
  if (res.status === 429) {
    await sleep(1000)
    return fetchUpbitCandlesDirect(market, count)
  }
  if (!res.ok) throw new Error(`업비트 API: ${res.status}`)

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

/** 업비트 알트코인 유니버스 (시총/유동성 기반, 동적 관리 예정) */
const ALT_UNIVERSE = [
  'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'ATOM',
  'MATIC', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'SEI', 'TIA', 'STX',
  'IMX', 'SAND', 'MANA', 'AXS', 'AAVE', 'UNI', 'CRV',
]

/** GET /api/detection/scan — 전체 알트코인 스캔 (공개) */
detectionRoutes.get('/scan', async (c) => {
  try {
    // BTC 캔들 직접 로드
    const btcCandles = await fetchUpbitCandlesDirect('KRW-BTC', 50)
    if (btcCandles.length < 21) {
      return c.json({ error: 'BTC 데이터 부족' }, 422)
    }
    const btcPrices = btcCandles.map((cl) => cl.close)

    const now = new Date()
    const kstOffset = 9 * 60 * 60 * 1000
    const kstNow = new Date(now.getTime() + kstOffset)

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

    const results = scoreMultipleCoins(inputs, 10)

    return c.json({
      scannedAt: now.toISOString(),
      totalScanned: inputs.length,
      detected: results.length,
      results: results.map((r) => ({
        symbol: r.symbol,
        score: r.score,
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
