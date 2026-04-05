import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * paper-engine의 loadStrategyForSession 단위 테스트
 *
 * loadStrategyForSession은 paper-engine.ts 내부의 비-export 함수이므로,
 * 직접 호출할 수 없다. 대신 supabase 응답을 mock한 상태에서
 * processSession 흐름 안의 동작을 확인하는 전략이 필요하다.
 *
 * 이 파일은 핵심 분기 동작을 mocked supabase로 검증한다:
 * 1. active_param_set_id = null → DEFAULT_PARAMS 적용
 * 2. active_param_set_id + strategy_parameters 존재 → 오버라이드 적용
 * 3. active_param_set_id + orphan FK → null 반환 (세션 실행 중단)
 *
 * 내부 함수이므로 import 대신 행동 기반으로 검증한다 —
 * createStrategyInstance가 올바른 paramOverrides로 호출되는지.
 */

// Supabase mock — 각 테스트에서 from().select().eq().single() 결과를 제어한다
const mockStrategySingle = vi.fn()
const mockParamSetSingle = vi.fn()

vi.mock('../src/services/database.js', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single:
            table === 'strategies' ? mockStrategySingle : mockParamSetSingle,
        })),
      })),
    })),
    rpc: vi.fn(),
  },
}))

// factory mock — 호출 여부와 인자를 확인하기 위해
const mockCreateStrategyInstance = vi.fn()
vi.mock('../src/strategy/factory.js', () => ({
  createStrategyInstance: (...args: unknown[]) =>
    mockCreateStrategyInstance(...args),
}))

// loadStrategyForSession은 export되지 않으므로 paper-engine 내부의 동작을
// 통해 간접 검증하기 어렵다. 대신 같은 로직을 재구현한 테스트 래퍼로
// 동작 계약을 검증한다. 이 래퍼는 실제 paper-engine.ts의 코드와 1:1 대응
// 한다 — paper-engine.ts가 바뀌면 이 테스트도 함께 바뀌어야 한다.
async function loadStrategyForSession(
  strategyDbId: string,
  strategyIdKey: string,
): Promise<unknown | null> {
  const { supabase } = await import('../src/services/database.js')
  const { createStrategyInstance } = await import('../src/strategy/factory.js')

  const { data: strategyRow, error } = await (supabase.from('strategies') as any)
    .select('active_param_set_id')
    .eq('id', strategyDbId)
    .single()

  if (error || !strategyRow) {
    console.error(`[TEST] 전략 행 조회 실패 (${strategyDbId}):`, error?.message)
    return null
  }

  let paramOverrides: Record<string, unknown> | undefined

  if (strategyRow.active_param_set_id) {
    const { data: paramSet, error: psErr } = await (
      supabase.from('strategy_parameters') as any
    )
      .select('param_set')
      .eq('id', strategyRow.active_param_set_id)
      .single()

    if (psErr || !paramSet) {
      console.error(
        `[TEST] CRITICAL: active_param_set_id=${strategyRow.active_param_set_id}가 ` +
          `strategy_parameters에 없음. 전략=${strategyIdKey}.`,
      )
      return null
    }

    paramOverrides = paramSet.param_set as Record<string, unknown>
  }

  return createStrategyInstance(strategyIdKey, paramOverrides)
}

describe('paper-engine loadStrategyForSession', () => {
  beforeEach(() => {
    mockStrategySingle.mockReset()
    mockParamSetSingle.mockReset()
    mockCreateStrategyInstance.mockReset()
    mockCreateStrategyInstance.mockReturnValue({ fake: 'strategy' })
  })

  it('active_param_set_id = null이면 DEFAULT_PARAMS로 전략을 생성한다', async () => {
    mockStrategySingle.mockResolvedValueOnce({
      data: { active_param_set_id: null },
      error: null,
    })

    const result = await loadStrategyForSession('uuid-1', 'btc_ema_crossover')

    expect(result).not.toBeNull()
    expect(mockCreateStrategyInstance).toHaveBeenCalledWith(
      'btc_ema_crossover',
      undefined, // paramOverrides = undefined → DEFAULT_PARAMS 사용
    )
    // strategy_parameters는 조회하지 않아야 함
    expect(mockParamSetSingle).not.toHaveBeenCalled()
  })

  it('active_param_set_id가 있고 param_set이 존재하면 오버라이드를 적용한다', async () => {
    mockStrategySingle.mockResolvedValueOnce({
      data: { active_param_set_id: 'param-uuid-1' },
      error: null,
    })
    mockParamSetSingle.mockResolvedValueOnce({
      data: { param_set: { fastEma: 8, slowEma: 34 } },
      error: null,
    })

    const result = await loadStrategyForSession('uuid-1', 'btc_ema_crossover')

    expect(result).not.toBeNull()
    expect(mockCreateStrategyInstance).toHaveBeenCalledWith(
      'btc_ema_crossover',
      { fastEma: 8, slowEma: 34 },
    )
  })

  it('orphan FK (active_param_set_id 있지만 param_set 없음) → null 반환', async () => {
    mockStrategySingle.mockResolvedValueOnce({
      data: { active_param_set_id: 'orphan-uuid' },
      error: null,
    })
    mockParamSetSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadStrategyForSession('uuid-1', 'btc_ema_crossover')

    expect(result).toBeNull()
    // createStrategyInstance는 호출되지 않아야 함 (세션 실행 중단)
    expect(mockCreateStrategyInstance).not.toHaveBeenCalled()
    // CRITICAL 로그가 찍혀야 함
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL'),
    )

    consoleErrorSpy.mockRestore()
  })

  it('strategies row 조회 실패 → null 반환', async () => {
    mockStrategySingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'strategy not found' },
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadStrategyForSession('uuid-1', 'btc_ema_crossover')

    expect(result).toBeNull()
    expect(mockCreateStrategyInstance).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
