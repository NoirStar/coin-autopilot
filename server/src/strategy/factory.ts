/**
 * 전략 팩토리
 *
 * 레지스트리(registry.ts)는 전략 싱글턴을 유지하여 운영 경로에서
 * 기본 인스턴스를 제공한다. 하지만 연구/승격 경로에서는 같은 전략을
 * 서로 다른 파라미터로 실행해야 하므로, 파라미터 오버라이드가 적용된
 * 독립 인스턴스가 필요하다.
 *
 * 이 팩토리는 strategyId + paramOverrides를 받아 매번 새 인스턴스를
 * 생성한다. 싱글턴의 공유 상태 레이스를 방지한다.
 *
 * 사용처:
 * - paper-engine.loadStrategyForSession() → 세션 생성 시 active_param_set_id 반영
 * - execution-engine → 실전 포지션 생성 시
 * - (2단계) research-orchestrator → 그리드 탐색 시
 */

import type { Strategy } from '../core/types.js'
import { BtcEmaCrossoverV2 } from './btc-ema-crossover.js'
import { BtcDonchianBreakoutV2 } from './btc-donchian-breakout.js'
import { BtcBollingerReversionV2 } from './btc-bollinger-reversion.js'
import { BtcMacdMomentumV2 } from './btc-macd-momentum.js'
import { AltMeanReversionV2 } from './alt-mean-reversion.js'
import { AltDetectionV2 } from './alt-detection.js'

// ─── 전략 생성자 레지스트리 ───────────────────────────────────

// 각 전략 클래스의 생성자는 `overrides?: Partial<typeof DEFAULT_PARAMS>`를 받는다.
// 이 시그니처는 전략마다 달라질 수 있지만 런타임에서 jsonb로 전달된 파라미터를
// 타입스크립트로 엄격 검증하기 어려우므로 Record<string, unknown>으로 받는다.
type StrategyConstructor = new (overrides?: Record<string, unknown>) => Strategy

const STRATEGY_CONSTRUCTORS: Record<string, StrategyConstructor> = {
  btc_ema_crossover: BtcEmaCrossoverV2 as unknown as StrategyConstructor,
  btc_donchian_breakout: BtcDonchianBreakoutV2 as unknown as StrategyConstructor,
  btc_bollinger_reversion: BtcBollingerReversionV2 as unknown as StrategyConstructor,
  btc_macd_momentum: BtcMacdMomentumV2 as unknown as StrategyConstructor,
  alt_mean_reversion: AltMeanReversionV2 as unknown as StrategyConstructor,
  alt_detection: AltDetectionV2 as unknown as StrategyConstructor,
}

// ─── 팩토리 함수 ──────────────────────────────────────────────

/**
 * 파라미터 오버라이드가 적용된 전략 인스턴스를 생성한다.
 *
 * - 같은 strategyId로 여러 번 호출하면 각각 독립된 인스턴스를 반환한다
 *   (싱글턴 아님, 공유 상태 레이스 방지).
 * - paramOverrides가 없으면 DEFAULT_PARAMS로 생성된다.
 * - paramOverrides의 일부 키만 제공해도 나머지는 DEFAULT_PARAMS와 병합된다
 *   (각 전략 클래스 생성자 내부에서 `{ ...DEFAULT_PARAMS, ...overrides }`로 처리).
 *
 * @param strategyId strategies.strategy_id (텍스트 키, UUID 아님)
 * @param paramOverrides strategy_parameters.param_set에서 읽은 jsonb
 * @returns 전략 인스턴스, 알 수 없는 strategyId면 null
 */
export function createStrategyInstance(
  strategyId: string,
  paramOverrides?: Record<string, unknown>,
): Strategy | null {
  const Ctor = STRATEGY_CONSTRUCTORS[strategyId]
  if (!Ctor) {
    console.warn(`[strategy-factory] 알 수 없는 전략 ID: ${strategyId}`)
    return null
  }

  return new Ctor(paramOverrides)
}

/** 등록된 전략 ID 목록 반환 (테스트/디버깅용) */
export function getFactoryStrategyIds(): string[] {
  return Object.keys(STRATEGY_CONSTRUCTORS)
}
