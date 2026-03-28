import { supabase } from './database.js'
import { fetchUpbitKrwSymbols } from '../data/candle-collector.js'
import { evaluateRegime, type RegimeDetail } from '../strategy/btc-regime-filter.js'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import type { Candle, CandleMap, RegimeState, Strategy, Timeframe } from '../strategy/strategy-base.js'

const UPBIT_API = 'https://api.upbit.com/v1'

const UPBIT_TF_MINUTES: Partial<Record<Timeframe, number>> = {
  '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
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

/** 등록된 전략 목록 */
const strategies: Strategy[] = [
  new AltMeanReversionStrategy(),
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

    // 4. 각 전략에서 시그널 생성
    for (const strategy of strategies) {
      const signals = strategy.evaluate(candleMap, regimeDetail.regime)
      console.log(`[시그널] ${strategy.config.name}: ${signals.length}개 시그널`)

      // 동시 5종목 초과 억제
      const activeSignals = signals.slice(0, 5)

      // 시그널 저장
      for (const signal of activeSignals) {
        await saveSignal(strategy.config.id, signal.symbol, signal.direction, signal.reasoning, regimeDetail.regime)
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
