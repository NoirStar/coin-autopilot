import type {
  Strategy,
  StrategySignal,
  ExitSignal,
  CandleMap,
  RegimeState,
  OpenPosition,
} from '../core/types.js'

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
