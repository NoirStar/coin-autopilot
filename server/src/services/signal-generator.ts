import { supabase } from './database.js'
import { fetchUpbitKrwSymbols } from '../data/candle-collector.js'
import { evaluateRegime, type RegimeDetail } from '../strategy/btc-regime-filter.js'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import { BtcEmaCrossoverStrategy } from '../strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../strategy/btc-bollinger-reversion.js'
import { BtcMacdMomentumStrategy } from '../strategy/btc-macd-momentum.js'
import { BtcDonchianBreakoutStrategy } from '../strategy/btc-donchian-breakout.js'
import type { Candle, CandleMap, RegimeState, Strategy, Timeframe } from '../strategy/strategy-base.js'

const UPBIT_API = 'https://api.upbit.com/v1'
const OKX_API = 'https://www.okx.com/api/v5'

const UPBIT_TF_MINUTES: Partial<Record<Timeframe, number>> = {
  '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
}
const OKX_BAR: Partial<Record<Timeframe, string>> = {
  '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D',
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 업비트에서 직접 캔들 페이징 수집 */
async function fetchUpbitDirect(market: string, tf: Timeframe, count: number): Promise<Candle[]> {
  const minutes = UPBIT_TF_MINUTES[tf] ?? 240
  const all: Candle[] = []
  let to: string | undefined

  while (all.length < count) {
    const batch = Math.min(200, count - all.length)
    const url = new URL(`${UPBIT_API}/candles/minutes/${minutes}`)
    url.searchParams.set('market', market)
    url.searchParams.set('count', String(batch))
    if (to) url.searchParams.set('to', to)

    const res = await fetch(url.toString())
    if (res.status === 429) { await sleep(1000); continue }
    if (!res.ok) break

    const data = await res.json() as Array<{
      candle_date_time_utc: string
      opening_price: number; high_price: number; low_price: number
      trade_price: number; candle_acc_trade_volume: number
    }>
    if (data.length === 0) break

    const candles = data.map((d) => ({
      openTime: new Date(d.candle_date_time_utc + 'Z'),
      open: d.opening_price, high: d.high_price, low: d.low_price,
      close: d.trade_price, volume: d.candle_acc_trade_volume,
    }))

    all.unshift(...candles.reverse())
    to = data[data.length - 1].candle_date_time_utc.replace(/\.\d{3}$/, '')
    await sleep(130)
    if (data.length < batch) break
  }

  return all
}

/** OKX에서 직접 캔들 수집 (페이징) */
async function fetchOkxDirect(instId: string, tf: Timeframe, count: number): Promise<Candle[]> {
  const bar = OKX_BAR[tf] ?? '4H'
  const all: Candle[] = []
  let after: string | undefined

  while (all.length < count) {
    const limit = Math.min(100, count - all.length)
    const url = new URL(`${OKX_API}/market/candles`)
    url.searchParams.set('instId', instId)
    url.searchParams.set('bar', bar)
    url.searchParams.set('limit', String(limit))
    if (after) url.searchParams.set('after', after)

    const res = await fetch(url.toString())
    if (!res.ok) break

    const json = await res.json() as { data: string[][] }
    if (!json.data || json.data.length === 0) break

    const candles = json.data.map((d) => ({
      openTime: new Date(parseInt(d[0])),
      open: parseFloat(d[1]), high: parseFloat(d[2]),
      low: parseFloat(d[3]), close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }))

    all.unshift(...candles.reverse())
    after = json.data[json.data.length - 1][0]
    await sleep(100)
    if (json.data.length < limit) break
  }

  return all
}

/** 등록된 전략 목록 — 업비트 현물 */
const upbitStrategies: Strategy[] = [
  new AltMeanReversionStrategy(),
]

/** 등록된 전략 목록 — OKX 선물 (4H 타임프레임) */
const okx4hStrategies: Strategy[] = [
  new BtcEmaCrossoverStrategy(),
  new BtcBollingerReversionStrategy(),
]

/** 등록된 전략 목록 — OKX 선물 (1H 타임프레임) */
const okx1hStrategies: Strategy[] = [
  new BtcMacdMomentumStrategy(),
  new BtcDonchianBreakoutStrategy(),
]

let previousRegime: RegimeState = 'risk_off'

/**
 * 시그널 생성 파이프라인
 * 크론에서 호출: 캔들 수집 → 지표 → 레짐 → 시그널 → DB 저장
 */
export async function generateSignals(): Promise<void> {
  console.log('[시그널] 파이프라인 시작')

  try {
    // 1. 업비트에서 직접 BTC 4h 캔들 수집 (EMA200에 최소 201개 필요)
    console.log('[시그널] BTC 4h 캔들 직접 수집 중...')
    const btcCandles = await fetchUpbitDirect('KRW-BTC', '4h', 500)
    console.log(`[시그널] BTC 캔들: ${btcCandles.length}개`)

    const candleMap: CandleMap = new Map()
    candleMap.set('BTC', btcCandles)

    // 2. 알트코인 캔들 수집 (동적 KRW 마켓, 상위 20개)
    const allKrwSymbols = await fetchUpbitKrwSymbols()
    const targetSymbols = allKrwSymbols.slice(0, 20)
    console.log(`[시그널] 알트코인 ${targetSymbols.length}개 수집 중...`)

    for (const symbol of targetSymbols) {
      try {
        const candles = await fetchUpbitDirect(`KRW-${symbol}`, '4h', 500)
        if (candles.length > 0) candleMap.set(symbol, candles)
      } catch {
        // 개별 코인 실패 스킵
      }
    }
    console.log(`[시그널] 캔들 수집 완료 (${candleMap.size}개 심볼)`)

    // 3. BTC 레짐 판단
    const regimeDetail = evaluateRegime(btcCandles, previousRegime)
    previousRegime = regimeDetail.regime
    console.log(`[시그널] BTC 레짐: ${regimeDetail.regime} (RSI: ${regimeDetail.rsi14.toFixed(1)}, ATR%: ${regimeDetail.atrPct.toFixed(2)})`)

    // 레짐 상태 저장
    await saveRegimeState(regimeDetail)

    // 4. 업비트 전략 시그널 생성 (알트 평균회귀)
    for (const strategy of upbitStrategies) {
      const signals = strategy.evaluate(candleMap, regimeDetail.regime)
      console.log(`[시그널] ${strategy.config.name}: ${signals.length}개 시그널`)

      const activeSignals = signals.slice(0, 5)
      for (const signal of activeSignals) {
        await saveSignal(strategy.config.id, signal.symbol, signal.direction, signal.reasoning, regimeDetail.regime)
      }
    }

    // 5. OKX 4H 캔들 수집 (BTC, ETH USDT 선물)
    console.log('[시그널] OKX 4H 캔들 수집 중...')
    const okx4hMap: CandleMap = new Map()
    try {
      const btcOkx4h = await fetchOkxDirect('BTC-USDT', '4h', 500)
      if (btcOkx4h.length > 0) okx4hMap.set('BTC', btcOkx4h)
      const ethOkx4h = await fetchOkxDirect('ETH-USDT', '4h', 500)
      if (ethOkx4h.length > 0) okx4hMap.set('ETH', ethOkx4h)
    } catch (err) {
      console.error('[시그널] OKX 4H 캔들 수집 오류:', err)
    }

    if (okx4hMap.size > 0) {
      for (const strategy of okx4hStrategies) {
        const signals = strategy.evaluate(okx4hMap, regimeDetail.regime)
        console.log(`[시그널] ${strategy.config.name}: ${signals.length}개 시그널`)

        const activeSignals = signals.slice(0, 3)
        for (const signal of activeSignals) {
          await saveSignal(strategy.config.id, signal.symbol, signal.direction, signal.reasoning, regimeDetail.regime)
        }
      }
    }

    // 6. OKX 1H 캔들 수집 (MACD, 돈치안 전략용)
    console.log('[시그널] OKX 1H 캔들 수집 중...')
    const okx1hMap: CandleMap = new Map()
    try {
      const btcOkx1h = await fetchOkxDirect('BTC-USDT', '1h', 500)
      if (btcOkx1h.length > 0) okx1hMap.set('BTC', btcOkx1h)
      const ethOkx1h = await fetchOkxDirect('ETH-USDT', '1h', 500)
      if (ethOkx1h.length > 0) okx1hMap.set('ETH', ethOkx1h)
    } catch (err) {
      console.error('[시그널] OKX 1H 캔들 수집 오류:', err)
    }

    if (okx1hMap.size > 0) {
      for (const strategy of okx1hStrategies) {
        const signals = strategy.evaluate(okx1hMap, regimeDetail.regime)
        console.log(`[시그널] ${strategy.config.name}: ${signals.length}개 시그널`)

        const activeSignals = signals.slice(0, 3)
        for (const signal of activeSignals) {
          await saveSignal(strategy.config.id, signal.symbol, signal.direction, signal.reasoning, regimeDetail.regime)
        }
      }
    }

    // 이전 시그널 비활성화 (4시간 이상 지난 것)
    await deactivateOldSignals()

    console.log('[시그널] 파이프라인 완료')
  } catch (err) {
    console.error('[시그널] 파이프라인 오류:', err)
  }
}

async function saveRegimeState(detail: RegimeDetail): Promise<void> {
  const { error } = await supabase.from('regime_states').insert({
    timestamp: detail.timestamp.toISOString(),
    regime: detail.regime,
    btc_close: detail.btcClose,
    ema_200: detail.ema200,
    rsi_14: detail.rsi14,
    atr_pct: detail.atrPct,
  })
  if (error) console.error('레짐 저장 오류:', error.message)
}

async function saveSignal(
  strategy: string,
  symbol: string,
  direction: string,
  reasoning: Record<string, unknown>,
  regime: string
): Promise<void> {
  const { error } = await supabase.from('signals').insert({
    strategy,
    symbol,
    direction,
    z_score: reasoning.z_score as number ?? null,
    rsi: reasoning.rsi as number ?? null,
    btc_regime: regime,
    reasoning,
    is_active: true,
  })
  if (error) console.error('시그널 저장 오류:', error.message)
}

async function deactivateOldSignals(): Promise<void> {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('signals')
    .update({ is_active: false })
    .eq('is_active', true)
    .lt('created_at', fourHoursAgo)

  if (error) console.error('시그널 비활성화 오류:', error.message)
}
