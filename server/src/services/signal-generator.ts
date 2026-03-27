import { supabase } from './database.js'
import { collectLatestCandles, loadCandles } from '../data/candle-collector.js'
import { evaluateRegime, type RegimeDetail } from '../strategy/btc-regime-filter.js'
import { AltMeanReversionStrategy } from '../strategy/alt-mean-reversion.js'
import type { CandleMap, RegimeState, Strategy } from '../strategy/strategy-base.js'

/** 시그널 대상 알트코인 (업비트 KRW 마켓, 거래대금 상위) */
const TARGET_SYMBOLS = ['ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'ATOM']

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
    // 1. 최신 캔들 수집
    await collectLatestCandles('upbit', ['BTC', ...TARGET_SYMBOLS], '4h')
    console.log('[시그널] 캔들 수집 완료')

    // 2. DB에서 캔들 로드
    const candleMap: CandleMap = new Map()
    const btcCandles = await loadCandles('upbit', 'BTC', '4h', 500)
    candleMap.set('BTC', btcCandles)

    for (const symbol of TARGET_SYMBOLS) {
      const candles = await loadCandles('upbit', symbol, '4h', 500)
      if (candles.length > 0) candleMap.set(symbol, candles)
    }

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
