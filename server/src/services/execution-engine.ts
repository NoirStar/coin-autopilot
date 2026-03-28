import { supabase } from './database.js'
import { calculatePnlPct } from './pnl-calculator.js'
import { evaluateRegime } from '../strategy/btc-regime-filter.js'
import { BtcEmaCrossoverStrategy } from '../strategy/btc-ema-crossover.js'
import { BtcBollingerReversionStrategy } from '../strategy/btc-bollinger-reversion.js'
import { loadCandles } from '../data/candle-collector.js'
import {
  fetchOpenPositions,
  fetchBalance,
  createMarketOrder,
  createStopOrder,
  cancelStopOrder,
  setLeverage,
  setMarginMode,
  calculatePositionSize,
  fetchOkxPrice,
  type OkxPosition,
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

/** 오늘(UTC) 실현 손실 합산 조회 */
async function getDailyRealizedLoss(): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('positions')
    .select('pnl')
    .eq('session_type', 'live')
    .eq('status', 'closed')
    .gte('closed_at', todayStart.toISOString())

  if (error || !data) return 0

  // 손실만 합산 (음수 pnl)
  return data.reduce((sum, row) => {
    const pnl = typeof row.pnl === 'number' ? row.pnl : 0
    return sum + Math.min(pnl, 0)
  }, 0)
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
  const dailyLoss = await getDailyRealizedLoss()
  const dailyLossPct = balance.total > 0 ? Math.abs(dailyLoss) / balance.total * 100 : 0
  const dailyLimitExceeded = dailyLossPct >= cfg.maxDailyLossPct

  if (dailyLimitExceeded) {
    console.log(`[실전매매] 일일 손실 한도 초과: ${dailyLossPct.toFixed(2)}% >= ${cfg.maxDailyLossPct}% — 신규 진입 차단, 청산만 허용`)
  }

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

  // 5. 현재 오픈 포지션의 심볼→방향 매핑 (전략 충돌 방지용)
  const openPositionDirections = new Map<string, 'long' | 'short'>()
  for (const pos of currentPositions) {
    openPositionDirections.set(pos.symbol, pos.side as 'long' | 'short')
  }

  // 이번 사이클에서 진입된 심볼→방향 기록 (전략 간 중복 진입 방지)
  const activeEntries = new Map<string, 'long' | 'short'>()

  // 6. 각 전략에 대해 시그널 평가 (배열 순서 = 우선순위)
  for (const strategyId of cfg.strategies) {
    const strategy = getStrategy(strategyId)
    if (!strategy) continue

    try {
      await executeStrategy(strategy, btcCandles, regimeDetail.regime, currentPositions, balance, cfg, dailyLimitExceeded, activeEntries, openPositionDirections)
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
  cfg: ExecutionConfig,
  dailyLimitExceeded: boolean,
  activeEntries: Map<string, 'long' | 'short'>,
  openPositionDirections: Map<string, 'long' | 'short'>,
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

  // DB에서 entryTime/candlesSinceEntry/peakPrice 조회 (서버 재시작 시에도 정확한 값 유지)
  const posArray = await Promise.all(
    posForStrategy.map(async (p) => {
      const { data: dbPos } = await supabase
        .from('positions')
        .select('opened_at, peak_price')
        .eq('symbol', p.symbol)
        .eq('session_type', 'live')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single()

      const entryTime = dbPos?.opened_at ? new Date(dbPos.opened_at as string) : new Date()
      const candlesSinceEntry = Math.floor(
        (Date.now() - entryTime.getTime()) / (4 * 3600000)
      )
      const peakPrice = typeof dbPos?.peak_price === 'number'
        ? dbPos.peak_price
        : p.entryPrice

      return {
        symbol: p.symbol,
        entryPrice: p.entryPrice,
        entryTime,
        candlesSinceEntry,
        side: p.side as 'long' | 'short',
        peakPrice,
      }
    })
  )

  const exitSignals = strategy.evaluateExits(candleMap, regime, posArray)

  // 청산 실행
  for (const exit of exitSignals) {
    const pos = posForStrategy.find((p) => p.symbol === exit.symbol)
    if (!pos) continue

    const side = pos.side === 'long' ? 'sell' : 'buy'

    try {
      // DB에서 해당 포지션 id + stop_order_id 조회
      const { data: dbPos } = await supabase
        .from('positions')
        .select('id, stop_order_id')
        .eq('symbol', exit.symbol)
        .eq('session_type', 'live')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single()

      // 기존 stop order 취소 (청산 시 중복 실행 방지)
      if (dbPos?.stop_order_id) {
        try {
          await cancelStopOrder(pos.symbol, dbPos.stop_order_id as string)
          console.log(`[실전매매] ${pos.symbol} 스탑 주문 취소 완료`)
        } catch (cancelErr) {
          console.warn(`[실전매매] ${pos.symbol} 스탑 주문 취소 실패 (이미 체결됐을 수 있음):`, cancelErr)
        }
      }

      const result = await createMarketOrder(pos.symbol, side, pos.size, true)
      console.log(`[실전매매] ${pos.symbol} 청산 (${exit.reason}): ${result.status}`)

      // 체결 가격 확인 — null이면 현재 시장가로 폴백
      const exitPrice = result.price ?? pos.markPrice ?? pos.entryPrice
      if (!result.price) {
        console.warn(`[실전매매] ${pos.symbol} 체결가 미수신, 마크가격으로 대체: $${exitPrice}`)
      }

      // DB에 거래 기록 (position id로 정확한 행 지정)
      if (dbPos?.id) {
        await logTrade(dbPos.id as string, side, pos.entryPrice, exitPrice, pos.size, exit.reason)
      }
    } catch (err) {
      console.error(`[실전매매] ${pos.symbol} 청산 실패:`, err)
      // 실패 시 재시도 없이 다음 사이클에서 처리
    }
  }

  // 일일 손실 한도 초과 시 신규 진입 차단 (기존 포지션 청산은 위에서 계속 실행)
  if (dailyLimitExceeded) return

  // 진입 시그널 평가 + 충돌 필터링
  const rawEntrySignals = strategy.evaluate(candleMap, regime)
  const maxPositions = strategy.config.params.maxPositions ?? 3

  if (currentPositions.length >= maxPositions) return

  // 전략 간 충돌 방지: 같은 심볼에 반대 방향 시그널 필터링
  const entrySignals = rawEntrySignals.filter((signal) => {
    const signalSide: 'long' | 'short' = signal.positionSide ?? 'long'

    // 이미 다른 전략이 이번 사이클에서 같은 심볼에 진입했으면 스킵
    const activeDirection = activeEntries.get(signal.symbol)
    if (activeDirection) {
      if (activeDirection !== signalSide) {
        console.log(`[실전매매] 충돌 감지: ${signal.symbol} — 전략 ${strategy.config.id}의 ${signalSide} 시그널이 기존 ${activeDirection} 진입과 충돌, 스킵`)
      }
      return false // 같은 방향이든 반대든, 이미 진입된 심볼은 건너뜀
    }

    // 이미 오픈 포지션이 있으면 같은 방향만 허용 (반대 시그널 무시)
    const openDirection = openPositionDirections.get(signal.symbol)
    if (openDirection && openDirection !== signalSide) {
      console.log(`[실전매매] 충돌 감지: ${signal.symbol} — 전략 ${strategy.config.id}의 ${signalSide} 시그널이 기존 ${openDirection} 포지션과 충돌, 스킵`)
      return false
    }

    return true
  })

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
      if (!result.price) {
        console.warn(`[실전매매] ${signal.symbol} 체결가 미수신, 시장가 $${price}로 대체`)
      }
      const entryPrice = result.price ?? price
      console.log(`[실전매매] ${signal.symbol} ${signal.positionSide ?? 'long'} 진입: $${entryPrice} x ${amount.toFixed(4)}`)

      // 이번 사이클에서 진입된 심볼 기록 (다음 전략에서 충돌 방지)
      activeEntries.set(signal.symbol, signal.positionSide ?? 'long')

      // DB에 기록
      const positionId = await logEntry(signal.symbol, signal.positionSide ?? 'long', entryPrice, amount, strategy.config.id)

      // Stop-market 주문 배치 (ATR 기반 기본 1.5배, 또는 기본 3% 손절)
      const atrMultiplier = strategy.config.params.atrStopMultiplier ?? 1.5
      const stopPct = (strategy.config.params.stopLossPct ?? stopLossPct) * atrMultiplier
      const stopSide = signal.positionSide === 'short' ? 'buy' : 'sell'
      const stopPrice = signal.positionSide === 'short'
        ? entryPrice * (1 + stopPct)
        : entryPrice * (1 - stopPct)

      try {
        const stopResult = await createStopOrder(signal.symbol, stopSide, stopPrice, amount)
        console.log(`[실전매매] ${signal.symbol} 스탑 주문 배치: $${stopPrice.toFixed(2)} (${(stopPct * 100).toFixed(1)}%)`)

        // DB에 stop_order_id 저장
        if (positionId) {
          await supabase
            .from('positions')
            .update({ stop_order_id: stopResult.id })
            .eq('id', positionId)
        }
      } catch (stopErr) {
        console.error(`[실전매매] ${signal.symbol} 스탑 주문 실패 (폴링 손절로 대체):`, stopErr)
      }
    } catch (err) {
      console.error(`[실전매매] ${signal.symbol} 진입 실패:`, err)
    }
  }
}

/** 진입 기록 → DB, 생성된 position id 반환 */
async function logEntry(
  symbol: string,
  direction: string,
  price: number,
  quantity: number,
  strategyId: string
): Promise<string | null> {
  const { data } = await supabase.from('positions').insert({
    session_type: 'live',
    exchange: 'okx',
    strategy: strategyId,
    symbol,
    direction,
    entry_price: price,
    quantity,
    status: 'open',
    opened_at: new Date().toISOString(),
  }).select('id').single()
  return data?.id ?? null
}

/** 거래 기록 → DB (position id로 정확한 행 지정) */
async function logTrade(
  positionId: string,
  side: string,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  reason: string
): Promise<void> {
  // side === 'sell'이면 롱 포지션 청산, 'buy'이면 숏 포지션 청산
  const positionSide = side === 'sell' ? 'long' as const : 'short' as const
  const { rawPnlPct } = calculatePnlPct(entryPrice, exitPrice, positionSide)
  const pnlPct = rawPnlPct * 100

  await supabase
    .from('positions')
    .update({
      status: 'closed',
      exit_price: exitPrice,
      pnl_pct: Math.round(pnlPct * 100) / 100,
      pnl: Math.round(quantity * entryPrice * rawPnlPct * 100) / 100,
      exit_reason: reason,
      closed_at: new Date().toISOString(),
    })
    .eq('id', positionId)
}
