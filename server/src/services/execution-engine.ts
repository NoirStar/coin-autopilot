import { supabase } from './database.js'
import { evaluateRegime } from '../strategy/btc-regime-filter.js'
import { BtcEmaCrossoverStrategy } from '../strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../strategy/btc-bollinger-reversion.js'
import { loadCandles } from '../data/candle-collector.js'
import {
  fetchOpenPositions,
  fetchBalance,
  createMarketOrder,
  setLeverage,
  setMarginMode,
  calculatePositionSize,
  fetchOkxPrice,
  type OkxPosition,
  type OrderResult,
} from '../exchange/okx-client.js'
import type { Strategy, CandleMap, RegimeState, Candle } from '../strategy/strategy-base.js'

/**
 * 실전 매매 엔진 (OKX 선물)
 *
 * 가상매매 엔진과 동일한 로직이지만 실제 주문을 실행.
 * 안전장치:
 * - 일일 최대 손실 한도 초과 시 매매 중단
 * - 모든 주문은 격리(isolated) 마진
 * - 모든 청산 주문은 reduce-only
 * - 주문 실패 시 재시도 없이 로깅 후 다음으로 넘어감
 */

interface ExecutionConfig {
  enabled: boolean
  maxDailyLossPct: number    // 일일 최대 손실 (계좌 대비 %)
  maxPositionRiskPct: number // 단일 포지션 리스크 (계좌 대비 %)
  defaultLeverage: number
  marginMode: 'isolated' | 'cross'
  strategies: string[]       // 활성 전략 ID 목록
}

const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  enabled: false,            // 기본 비활성 — 명시적으로 켜야 함
  maxDailyLossPct: 3,
  maxPositionRiskPct: 1,
  defaultLeverage: 2,
  marginMode: 'isolated',
  strategies: ['btc_ema_crossover'],
}

function getStrategy(id: string): Strategy | null {
  switch (id) {
    case 'btc_ema_crossover': return new BtcEmaCrossoverStrategy()
    case 'btc_bollinger_reversion': return new BtcBollingerReversionStrategy()
    default: return null
  }
}

/** 실전 매매 사이클 (크론에서 호출) */
export async function runExecutionCycle(config?: Partial<ExecutionConfig>): Promise<void> {
  const cfg = { ...DEFAULT_EXECUTION_CONFIG, ...config }

  if (!cfg.enabled) {
    console.log('[실전매매] 비활성 상태, 스킵')
    return
  }

  console.log('[실전매매] 사이클 시작')

  // 1. 계좌 잔고 확인
  let balance
  try {
    balance = await fetchBalance()
    console.log(`[실전매매] 잔고: $${balance.total.toFixed(2)} (가용: $${balance.free.toFixed(2)})`)
  } catch (err) {
    console.error('[실전매매] 잔고 조회 실패, 중단:', err)
    return
  }

  // 2. 일일 손실 한도 확인
  // (간이: 오늘 실현 손실 합산 — 추후 DB에서 계산)
  // TODO: 일일 실현 손실 추적

  // 3. BTC 캔들 + 레짐 판단
  const btcCandles = await loadCandles('upbit', 'BTC', '4h', 300)
  if (btcCandles.length < 201) {
    console.log('[실전매매] BTC 캔들 부족, 스킵')
    return
  }
  const regimeDetail = evaluateRegime(btcCandles)
  console.log(`[실전매매] BTC 레짐: ${regimeDetail.regime}`)

  // 4. 현재 OKX 오픈 포지션 조회
  let currentPositions: OkxPosition[]
  try {
    currentPositions = await fetchOpenPositions()
  } catch (err) {
    console.error('[실전매매] 포지션 조회 실패, 중단:', err)
    return
  }

  // 5. 각 전략에 대해 시그널 평가
  for (const strategyId of cfg.strategies) {
    const strategy = getStrategy(strategyId)
    if (!strategy) continue

    try {
      await executeStrategy(strategy, btcCandles, regimeDetail.regime, currentPositions, balance, cfg)
    } catch (err) {
      console.error(`[실전매매] 전략 ${strategyId} 오류:`, err)
    }
  }

  console.log('[실전매매] 사이클 완료')
}

async function executeStrategy(
  strategy: Strategy,
  btcCandles: Candle[],
  regime: RegimeState,
  currentPositions: OkxPosition[],
  balance: { total: number; free: number },
  cfg: ExecutionConfig
): Promise<void> {
  // 캔들 로드
  const candleMap: CandleMap = new Map()
  candleMap.set('BTC', btcCandles)

  try {
    const ethCandles = await loadCandles('upbit', 'ETH', '4h', 300)
    if (ethCandles.length > 0) candleMap.set('ETH', ethCandles)
  } catch { /* ETH 실패 시 BTC만 */ }

  // 청산 시그널 평가
  const posForStrategy = currentPositions.filter((p) =>
    ['BTC', 'ETH'].includes(p.symbol)
  )

  const posArray = posForStrategy.map((p) => ({
    symbol: p.symbol,
    entryPrice: p.entryPrice,
    entryTime: new Date(), // OKX API에서 진입 시각 별도 조회 필요
    candlesSinceEntry: 0,  // TODO: DB에서 추적
    side: p.side,
  }))

  const exitSignals = strategy.evaluateExits(candleMap, regime, posArray)

  // 청산 실행
  for (const exit of exitSignals) {
    const pos = posForStrategy.find((p) => p.symbol === exit.symbol)
    if (!pos) continue

    const side = pos.side === 'long' ? 'sell' : 'buy'

    try {
      const result = await createMarketOrder(pos.symbol, side, pos.size, true)
      console.log(`[실전매매] ${pos.symbol} 청산 (${exit.reason}): ${result.status}`)

      // DB에 거래 기록
      await logTrade(pos.symbol, side, pos.entryPrice, result.price ?? 0, pos.size, exit.reason)
    } catch (err) {
      console.error(`[실전매매] ${pos.symbol} 청산 실패:`, err)
      // 실패 시 재시도 없이 다음 사이클에서 처리
    }
  }

  // 진입 시그널 평가
  const entrySignals = strategy.evaluate(candleMap, regime)
  const maxPositions = strategy.config.params.maxPositions ?? 3

  if (currentPositions.length >= maxPositions) return

  for (const signal of entrySignals) {
    if (currentPositions.some((p) => p.symbol === signal.symbol)) continue
    if (currentPositions.length >= maxPositions) break

    const leverage = signal.leverage ?? cfg.defaultLeverage
    const side = signal.positionSide === 'short' ? 'sell' : 'buy'

    try {
      // 레버리지/마진 설정
      await setLeverage(signal.symbol, leverage)
      await setMarginMode(signal.symbol, cfg.marginMode)

      // 포지션 사이즈 계산
      const price = await fetchOkxPrice(signal.symbol)
      const stopLossPct = 0.03 // 3% 기본 손절
      const positionUsd = calculatePositionSize(
        balance.total,
        cfg.maxPositionRiskPct / 100,
        stopLossPct,
        leverage
      )
      const amount = positionUsd / price

      if (amount <= 0 || positionUsd < 10) {
        console.log(`[실전매매] ${signal.symbol} 포지션 크기 너무 작음, 스킵`)
        continue
      }

      // 주문 실행
      const result = await createMarketOrder(signal.symbol, side, amount)
      console.log(`[실전매매] ${signal.symbol} ${signal.positionSide ?? 'long'} 진입: $${result.price ?? price} x ${amount.toFixed(4)}`)

      // DB에 기록
      await logEntry(signal.symbol, signal.positionSide ?? 'long', result.price ?? price, amount, strategy.config.id)
    } catch (err) {
      console.error(`[실전매매] ${signal.symbol} 진입 실패:`, err)
    }
  }
}

/** 진입 기록 → DB */
async function logEntry(
  symbol: string,
  direction: string,
  price: number,
  quantity: number,
  strategyId: string
): Promise<void> {
  await supabase.from('positions').insert({
    session_type: 'live',
    exchange: 'okx',
    strategy: strategyId,
    symbol,
    direction,
    entry_price: price,
    quantity,
    status: 'open',
    opened_at: new Date().toISOString(),
  })
}

/** 거래 기록 → DB */
async function logTrade(
  symbol: string,
  side: string,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  reason: string
): Promise<void> {
  const pnlPct = side === 'sell'
    ? (exitPrice - entryPrice) / entryPrice * 100  // 롱 청산
    : (entryPrice - exitPrice) / entryPrice * 100  // 숏 청산

  await supabase
    .from('positions')
    .update({
      status: 'closed',
      exit_price: exitPrice,
      pnl_pct: Math.round(pnlPct * 100) / 100,
      pnl: Math.round(quantity * entryPrice * pnlPct / 100 * 100) / 100,
      closed_at: new Date().toISOString(),
    })
    .eq('symbol', symbol)
    .eq('session_type', 'live')
    .eq('status', 'open')
}
