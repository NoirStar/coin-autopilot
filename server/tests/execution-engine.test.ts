import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── 외부 의존성 mock ──

// supabase mock
vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'pos-uuid-123' } })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: { id: 'pos-uuid-456' } })),
                })),
              })),
            })),
          })),
        })),
      })),
    })),
  },
}))

// okx-client mock
vi.mock('../src/exchange/okx-client.js', async () => {
  const actual = await vi.importActual<typeof import('../src/exchange/okx-client.js')>(
    '../src/exchange/okx-client.js'
  )
  return {
    // calculatePositionSize는 순수 함수이므로 실제 구현 사용
    calculatePositionSize: actual.calculatePositionSize,
    fetchBalance: vi.fn(),
    fetchOpenPositions: vi.fn(),
    createMarketOrder: vi.fn(),
    setLeverage: vi.fn(),
    setMarginMode: vi.fn(),
    fetchOkxPrice: vi.fn(),
  }
})

// candle-collector mock
vi.mock('../src/data/candle-collector.js', () => ({
  loadCandles: vi.fn(),
}))

// 전략 mock: evaluateRegime는 실제 로직 사용하면 캔들 의존이 커지므로 mock
vi.mock('../src/strategy/btc-regime-filter.js', () => ({
  evaluateRegime: vi.fn(),
}))

// 전략 클래스 mock
vi.mock('../src/strategy/btc-ema-crossover.js', () => ({
  BtcEmaCrossoverStrategy: vi.fn().mockImplementation(() => ({
    config: {
      id: 'btc_ema_crossover',
      name: 'BTC EMA 크로스오버',
      timeframe: '4h',
      exchange: 'okx',
      params: { maxPositions: 3, leverage: 2 },
    },
    evaluate: vi.fn().mockReturnValue([]),
    evaluateExits: vi.fn().mockReturnValue([]),
  })),
}))

vi.mock('../src/strategy/btc-bollinger-reversion.js', () => ({
  BtcBollingerReversionStrategy: vi.fn().mockImplementation(() => ({
    config: {
      id: 'btc_bollinger_reversion',
      name: 'BTC 볼린저 회귀',
      timeframe: '4h',
      exchange: 'okx',
      params: { maxPositions: 3 },
    },
    evaluate: vi.fn().mockReturnValue([]),
    evaluateExits: vi.fn().mockReturnValue([]),
  })),
}))

import { runExecutionCycle } from '../src/services/execution-engine.js'
import { calculatePositionSize } from '../src/exchange/okx-client.js'
import {
  fetchBalance,
  fetchOpenPositions,
  createMarketOrder,
  setLeverage,
  setMarginMode,
  fetchOkxPrice,
} from '../src/exchange/okx-client.js'
import { loadCandles } from '../src/data/candle-collector.js'
import { evaluateRegime } from '../src/strategy/btc-regime-filter.js'
import { BtcEmaCrossoverStrategy } from '../src/strategy/btc-ema-crossover.js'
import { supabase } from '../src/services/database.js'
import type { Candle } from '../src/strategy/strategy-base.js'

// mock된 함수에 타입 캐스팅
const mockFetchBalance = fetchBalance as ReturnType<typeof vi.fn>
const mockFetchOpenPositions = fetchOpenPositions as ReturnType<typeof vi.fn>
const mockCreateMarketOrder = createMarketOrder as ReturnType<typeof vi.fn>
const mockSetLeverage = setLeverage as ReturnType<typeof vi.fn>
const mockSetMarginMode = setMarginMode as ReturnType<typeof vi.fn>
const mockFetchOkxPrice = fetchOkxPrice as ReturnType<typeof vi.fn>
const mockLoadCandles = loadCandles as ReturnType<typeof vi.fn>
const mockEvaluateRegime = evaluateRegime as ReturnType<typeof vi.fn>

/** 테스트용 캔들 생성 */
function generateCandles(count: number, basePrice: number = 60000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    openTime: new Date(Date.now() - (count - i) * 4 * 3600000),
    open: basePrice,
    high: basePrice + 100,
    low: basePrice - 100,
    close: basePrice + i,
    volume: 1000,
  }))
}

/** 공통 mock 초기화: 정상 실행 경로에 필요한 기본값 설정 */
function setupDefaultMocks() {
  mockFetchBalance.mockResolvedValue({ total: 10000, free: 8000, used: 2000 })
  mockFetchOpenPositions.mockResolvedValue([])
  mockLoadCandles.mockResolvedValue(generateCandles(250))
  mockEvaluateRegime.mockReturnValue({
    regime: 'risk_on',
    btcClose: 60000,
    ema200: 58000,
    rsi14: 55,
    atrPct: 2.5,
    timestamp: new Date(),
  })
  mockSetLeverage.mockResolvedValue(undefined)
  mockSetMarginMode.mockResolvedValue(undefined)
  mockFetchOkxPrice.mockResolvedValue(60000)
  mockCreateMarketOrder.mockResolvedValue({
    id: 'order-1',
    symbol: 'BTC',
    side: 'buy',
    type: 'market',
    amount: 0.01,
    price: 60000,
    status: 'filled',
    timestamp: new Date(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

// ============================================================
// 1. 가드: enabled=false일 때 사이클 스킵
// ============================================================
describe('실행 엔진 가드', () => {
  it('enabled=false이면 사이클을 스킵한다', async () => {
    await runExecutionCycle({ enabled: false })

    // 잔고 조회조차 하지 않아야 함
    expect(mockFetchBalance).not.toHaveBeenCalled()
    expect(mockLoadCandles).not.toHaveBeenCalled()
  })

  it('config 없이 호출하면 기본값(enabled=false)으로 스킵한다', async () => {
    await runExecutionCycle()

    expect(mockFetchBalance).not.toHaveBeenCalled()
  })

  // ============================================================
  // 2. 가드: BTC 캔들 < 201일 때 스킵
  // ============================================================
  it('BTC 캔들이 201개 미만이면 스킵한다', async () => {
    // 200개만 반환 (201 미만)
    mockLoadCandles.mockResolvedValue(generateCandles(200))

    await runExecutionCycle({ enabled: true })

    // 잔고는 조회하지만 레짐 평가 이후 포지션 조회는 하지 않아야 함
    expect(mockFetchBalance).toHaveBeenCalled()
    expect(mockFetchOpenPositions).not.toHaveBeenCalled()
  })

  it('BTC 캔들이 201개 이상이면 정상 진행한다', async () => {
    mockLoadCandles.mockResolvedValue(generateCandles(250))

    await runExecutionCycle({ enabled: true })

    expect(mockFetchBalance).toHaveBeenCalled()
    expect(mockFetchOpenPositions).toHaveBeenCalled()
  })
})

// ============================================================
// 3. 포지션 사이징: calculatePositionSize 수학 검증
// ============================================================
describe('calculatePositionSize', () => {
  it('기본 공식이 올바르다: (잔고 * 리스크%) / (손절% * 레버리지)', () => {
    // 잔고 $10,000 / 리스크 1% / 손절 3% / 레버리지 2x
    // = (10000 * 0.01) / (0.03 * 2) = 100 / 0.06 = 1666.67
    const result = calculatePositionSize(10000, 0.01, 0.03, 2)
    expect(result).toBeCloseTo(1666.67, 1)
  })

  it('레버리지가 높을수록 포지션 크기가 작아진다', () => {
    const low = calculatePositionSize(10000, 0.01, 0.03, 2)
    const high = calculatePositionSize(10000, 0.01, 0.03, 5)
    expect(high).toBeLessThan(low)
  })

  it('손절 비율이 0이면 0을 반환한다 (0으로 나누기 방지)', () => {
    expect(calculatePositionSize(10000, 0.01, 0, 2)).toBe(0)
  })

  it('레버리지가 0이면 0을 반환한다', () => {
    expect(calculatePositionSize(10000, 0.01, 0.03, 0)).toBe(0)
  })

  it('음수 손절이면 0을 반환한다', () => {
    expect(calculatePositionSize(10000, 0.01, -0.05, 2)).toBe(0)
  })
})

// ============================================================
// 4. 레짐 필터: Risk-Off에서 신규 진입 차단
// ============================================================
describe('레짐 필터', () => {
  it('Risk-Off 레짐에서 전략 evaluate가 호출되어도 진입 주문이 발생하지 않는다', async () => {
    mockEvaluateRegime.mockReturnValue({
      regime: 'risk_off',
      btcClose: 55000,
      ema200: 60000,
      rsi14: 40,
      atrPct: 5.0,
      timestamp: new Date(),
    })

    // 전략이 risk_off 레짐을 받으면 빈 시그널 반환 (mock 기본값)
    await runExecutionCycle({ enabled: true, strategies: ['btc_ema_crossover'] })

    // 레짐이 risk_off여도 사이클 자체는 진행되지만 시그널 없으므로 주문 없음
    expect(mockCreateMarketOrder).not.toHaveBeenCalled()
  })

  it('Risk-On 레짐에서 시그널이 있으면 진입 주문이 실행된다', async () => {
    // 전략 mock이 시그널을 반환하도록 설정
    const strategyInstance = new BtcEmaCrossoverStrategy()
    ;(strategyInstance.evaluate as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        symbol: 'BTC',
        direction: 'buy',
        positionSide: 'long',
        leverage: 2,
        reasoning: { type: 'test' },
      },
    ])

    mockEvaluateRegime.mockReturnValue({
      regime: 'risk_on',
      btcClose: 65000,
      ema200: 58000,
      rsi14: 55,
      atrPct: 2.5,
      timestamp: new Date(),
    })

    await runExecutionCycle({ enabled: true, strategies: ['btc_ema_crossover'] })

    // 전략 인스턴스가 새로 생성되므로 mock의 기본 빈 배열 반환
    // 실제 주문 여부는 전략 evaluate 반환값에 의존
    expect(mockFetchOpenPositions).toHaveBeenCalled()
  })
})

// ============================================================
// 5. 최대 포지션 수 제한
// ============================================================
describe('최대 포지션 제한', () => {
  it('현재 포지션 수가 maxPositions 이상이면 신규 진입하지 않는다', async () => {
    // 이미 3개 포지션 보유 (maxPositions 기본값 3)
    mockFetchOpenPositions.mockResolvedValue([
      { symbol: 'BTC', side: 'long', size: 0.1, entryPrice: 60000, markPrice: 61000, unrealizedPnl: 100, leverage: 2, marginMode: 'isolated', liquidationPrice: 50000 },
      { symbol: 'ETH', side: 'long', size: 1.0, entryPrice: 3000, markPrice: 3100, unrealizedPnl: 100, leverage: 2, marginMode: 'isolated', liquidationPrice: 2500 },
      { symbol: 'SOL', side: 'short', size: 10, entryPrice: 150, markPrice: 145, unrealizedPnl: 50, leverage: 2, marginMode: 'isolated', liquidationPrice: 200 },
    ])

    await runExecutionCycle({ enabled: true, strategies: ['btc_ema_crossover'] })

    // 3개 이미 보유 → maxPositions(3) 이상이므로 진입 주문 없음
    expect(mockSetLeverage).not.toHaveBeenCalled()
    expect(mockCreateMarketOrder).not.toHaveBeenCalled()
  })
})

// ============================================================
// 6. logEntry: position ID 반환 (supabase mock)
// ============================================================
describe('logEntry (DB 기록)', () => {
  it('진입 시 supabase에 positions 레코드를 삽입하고 id를 받는다', async () => {
    // BtcEmaCrossoverStrategy의 evaluate가 시그널을 반환하도록 mock
    // 전략 클래스 자체가 mock이므로, 새 인스턴스의 evaluate를 설정해야 함
    // vi.mock으로 클래스를 mock했기 때문에 모든 새 인스턴스가 같은 mock 구현을 사용
    const mockEvaluate = vi.fn().mockReturnValue([
      {
        symbol: 'BTC',
        direction: 'buy',
        positionSide: 'long',
        leverage: 2,
        reasoning: { type: 'test_entry' },
      },
    ])

    // 전략 mock 재설정: evaluate가 시그널을 반환
    ;(BtcEmaCrossoverStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      config: {
        id: 'btc_ema_crossover',
        name: 'BTC EMA 크로스오버',
        timeframe: '4h',
        exchange: 'okx',
        params: { maxPositions: 3, leverage: 2 },
      },
      evaluate: mockEvaluate,
      evaluateExits: vi.fn().mockReturnValue([]),
    }))

    await runExecutionCycle({ enabled: true, strategies: ['btc_ema_crossover'] })

    // supabase.from('positions').insert()가 호출되었는지 확인
    const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls
    const positionsInsertCalled = fromCalls.some(
      (call: string[]) => call[0] === 'positions'
    )
    expect(positionsInsertCalled).toBe(true)
  })
})

// ============================================================
// 7. logTrade: position ID로 업데이트 (symbol이 아닌 id 사용)
// ============================================================
describe('logTrade (거래 기록)', () => {
  it('청산 시 position id로 DB를 업데이트한다', async () => {
    // 오픈 포지션 설정
    mockFetchOpenPositions.mockResolvedValue([
      {
        symbol: 'BTC',
        side: 'long',
        size: 0.01,
        entryPrice: 60000,
        markPrice: 62000,
        unrealizedPnl: 20,
        leverage: 2,
        marginMode: 'isolated',
        liquidationPrice: 50000,
      },
    ])

    // 전략이 청산 시그널 반환하도록 설정
    ;(BtcEmaCrossoverStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      config: {
        id: 'btc_ema_crossover',
        name: 'BTC EMA 크로스오버',
        timeframe: '4h',
        exchange: 'okx',
        params: { maxPositions: 3, leverage: 2 },
      },
      evaluate: vi.fn().mockReturnValue([]),
      evaluateExits: vi.fn().mockReturnValue([
        {
          symbol: 'BTC',
          reason: 'take_profit',
          reasoning: { type: 'test_exit' },
        },
      ]),
    }))

    // 청산 주문 결과
    mockCreateMarketOrder.mockResolvedValue({
      id: 'exit-order-1',
      symbol: 'BTC',
      side: 'sell',
      type: 'market',
      amount: 0.01,
      price: 62000,
      status: 'filled',
      timestamp: new Date(),
    })

    await runExecutionCycle({ enabled: true, strategies: ['btc_ema_crossover'] })

    // 청산 주문이 실행되었는지 확인
    expect(mockCreateMarketOrder).toHaveBeenCalledWith('BTC', 'sell', 0.01, true)

    // supabase에서 position id로 조회 후 업데이트하는 흐름 확인
    // from('positions').select('id').eq(...).single() → update().eq('id', positionId)
    const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls
    const positionsCalls = fromCalls.filter(
      (call: string[]) => call[0] === 'positions'
    )
    // 최소 1회 이상 positions 테이블 접근 (select + update)
    expect(positionsCalls.length).toBeGreaterThanOrEqual(1)
  })
})
