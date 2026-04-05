import type {
  Strategy,
  StrategySignal,
  ExitSignal,
  CandleMap,
  RegimeState,
  OpenPosition,
} from '../core/types.js'
import { supabase } from '../services/database.js'

/**
 * V2 전략 레지스트리
 *
 * 모든 전략을 ID로 등록·조회·목록화한다.
 * safeEvaluate / safeEvaluateExits 로 개별 전략 오류를 격리하여
 * 하나의 전략 실패가 전체 사이클을 중단시키지 않도록 보호한다.
 */

/** 전략 저장소 (id → Strategy) */
const registry = new Map<string, Strategy>()

/**
 * 서버 시작 시 strategies DB와 레지스트리 동기화
 *
 * - 레지스트리에 있지만 DB에 없는 전략 → DB에 등록
 * - DB에서 retired 상태인 전략 → 레지스트리에서 제거
 */
export async function syncRegistryWithDb(): Promise<void> {
  const strategies = getAllStrategies()
  if (strategies.length === 0) return

  // DB 전략 목록 조회
  const { data: dbStrategies, error } = await supabase
    .from('strategies')
    .select('id, strategy_id, status')

  if (error) {
    console.error('[레지스트리] DB 동기화 실패:', error.message)
    return
  }

  const dbMap = new Map((dbStrategies ?? []).map((s) => [s.strategy_id as string, s]))

  // 레지스트리에 있지만 DB에 없는 전략 → DB에 등록
  for (const strategy of strategies) {
    const sid = strategy.config.id
    if (!dbMap.has(sid)) {
      const { error: insertErr } = await supabase
        .from('strategies')
        .insert({
          strategy_id: sid,
          name: strategy.config.name,
          description: strategy.config.description,
          exchange: strategy.config.exchange,
          asset_class: strategy.config.assetClass,
          timeframe: strategy.config.timeframe,
          direction: strategy.config.direction,
          status: 'research_only',
          default_params: strategy.config.params,
        })

      if (insertErr) {
        console.error(`[레지스트리] ${sid} DB 등록 실패:`, insertErr.message)
      } else {
        console.log(`[레지스트리] ${sid} DB에 등록 완료`)
      }
    }
  }

  // DB에서 retired 상태인 전략 → 레지스트리에서 제거
  for (const [strategyId, dbEntry] of dbMap) {
    if (dbEntry.status === 'retired' && registry.has(strategyId)) {
      registry.delete(strategyId)
      console.log(`[레지스트리] ${strategyId} 퇴역 — 레지스트리에서 제거`)
    }
  }

  console.log(`[레지스트리] DB 동기화 완료: ${registry.size}개 활성 전략`)
}

/**
 * 전략 등록
 * @throws 같은 ID로 중복 등록 시 에러
 */
export function registerStrategy(strategy: Strategy): void {
  const { id } = strategy.config
  if (registry.has(id)) {
    throw new Error(`[레지스트리] 전략 ID 중복: ${id}`)
  }
  registry.set(id, strategy)
  console.log(`[레지스트리] 전략 등록 완료: ${id} (${strategy.config.name})`)
}

/**
 * ID로 전략 조회
 * @returns 전략 인스턴스 또는 undefined
 */
export function getStrategy(id: string): Strategy | undefined {
  return registry.get(id)
}

/**
 * 등록된 전략 전체 목록 반환
 */
export function getAllStrategies(): Strategy[] {
  return [...registry.values()]
}

/**
 * 안전한 진입 시그널 평가
 *
 * 전략의 evaluate()를 try-catch로 감싸서 실행.
 * 에러 발생 시 로그만 남기고 빈 배열을 반환한다 — 사이클 중단 방지.
 */
export function safeEvaluate(
  strategyId: string,
  candles: CandleMap,
  regime: RegimeState,
): StrategySignal[] {
  const strategy = registry.get(strategyId)
  if (!strategy) {
    console.warn(`[레지스트리] safeEvaluate 실패 — 전략 미등록: ${strategyId}`)
    return []
  }

  try {
    return strategy.evaluate(candles, regime)
  } catch (err) {
    console.error(
      `[레지스트리] 전략 평가 오류 (${strategyId}):`,
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

/**
 * 안전한 청산 시그널 평가
 *
 * 전략의 evaluateExits()를 try-catch로 감싸서 실행.
 * 에러 발생 시 로그만 남기고 빈 배열을 반환한다 — 사이클 중단 방지.
 */
export function safeEvaluateExits(
  strategyId: string,
  candles: CandleMap,
  regime: RegimeState,
  positions: OpenPosition[],
): ExitSignal[] {
  const strategy = registry.get(strategyId)
  if (!strategy) {
    console.warn(`[레지스트리] safeEvaluateExits 실패 — 전략 미등록: ${strategyId}`)
    return []
  }

  try {
    return strategy.evaluateExits(candles, regime, positions)
  } catch (err) {
    console.error(
      `[레지스트리] 전략 청산 평가 오류 (${strategyId}):`,
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

/**
 * 인스턴스 기반 안전 평가 (싱글턴 아닌 전략 인스턴스용)
 *
 * factory.createStrategyInstance()로 생성된 인스턴스 등,
 * 레지스트리에 등록되지 않은 전략을 안전하게 실행하기 위한 변형.
 * paper-engine/execution-engine이 active_param_set_id가 반영된
 * 독립 인스턴스를 사용할 때 호출한다.
 */
export function safeEvaluateOn(
  strategy: Strategy,
  candles: CandleMap,
  regime: RegimeState,
): StrategySignal[] {
  try {
    return strategy.evaluate(candles, regime)
  } catch (err) {
    console.error(
      `[레지스트리] 전략 평가 오류 (${strategy.config.id}):`,
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

export function safeEvaluateExitsOn(
  strategy: Strategy,
  candles: CandleMap,
  regime: RegimeState,
  positions: OpenPosition[],
): ExitSignal[] {
  try {
    return strategy.evaluateExits(candles, regime, positions)
  } catch (err) {
    console.error(
      `[레지스트리] 전략 청산 평가 오류 (${strategy.config.id}):`,
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
