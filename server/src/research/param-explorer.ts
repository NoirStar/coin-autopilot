/**
 * 전략별 파라미터 그리드 탐색기
 *
 * 각 전략의 튜닝 가능한 파라미터에 대해 범위를 정의하고,
 * 그리드 조합을 생성한다. 무의미한 조합은 constraints로 제거.
 *
 * 최대 조합 수: 100개 (메모리/시간 제한)
 */

// ─── 타입 ─────────────────────────────────────────────────────

interface ParamRange {
  key: string
  values: number[]
}

interface StrategyParamSpec {
  strategyId: string
  ranges: ParamRange[]
  /** 유효하지 않은 조합을 걸러내는 제약 조건 (false 반환 시 제외) */
  constraints?: (params: Record<string, number>) => boolean
}

export type ParamSet = Record<string, number>

// ─── 전략별 파라미터 스펙 ──────────────────────────────────────

const MAX_GRID_SIZE = 100

const PARAM_SPECS: Record<string, StrategyParamSpec> = {
  btc_ema_crossover: {
    strategyId: 'btc_ema_crossover',
    ranges: [
      { key: 'fastEma', values: [8, 12, 16, 21] },
      { key: 'slowEma', values: [21, 26, 34, 50] },
      { key: 'atrStopMult', values: [1.0, 1.5, 2.0] },
      { key: 'atrTrailMult', values: [1.5, 2.0, 2.5, 3.0] },
    ],
    constraints: (p) => p.fastEma < p.slowEma,
  },

  btc_macd_momentum: {
    strategyId: 'btc_macd_momentum',
    ranges: [
      { key: 'macdFast', values: [8, 12, 16] },
      { key: 'macdSlow', values: [21, 26, 34] },
      { key: 'adxThreshold', values: [20, 25, 30] },
      { key: 'atrStopMult', values: [1.0, 1.5, 2.0] },
    ],
    constraints: (p) => p.macdFast < p.macdSlow,
  },

  btc_bollinger_reversion: {
    strategyId: 'btc_bollinger_reversion',
    ranges: [
      { key: 'bbPeriod', values: [15, 20, 25] },
      { key: 'bbStdDev', values: [1.5, 2.0, 2.5] },
      { key: 'rsiOversold', values: [25, 30, 35] },
      { key: 'rsiOverbought', values: [65, 70, 75] },
    ],
  },

  btc_donchian_breakout: {
    strategyId: 'btc_donchian_breakout',
    ranges: [
      { key: 'donchianPeriod', values: [10, 15, 20, 30] },
      { key: 'atrStopMult', values: [1.5, 2.0, 2.5] },
      { key: 'atrTrailMult', values: [2.0, 2.5, 3.0, 3.5] },
      { key: 'volumeMultiplier', values: [1.5, 2.0, 2.5] },
    ],
  },

  alt_mean_reversion: {
    strategyId: 'alt_mean_reversion',
    ranges: [
      { key: 'zScoreEntry', values: [-1.5, -1.0, -0.7] },
      { key: 'zScoreExit', values: [-0.2, 0.0, 0.3] },
      { key: 'atrStopMult', values: [2.0, 2.7, 3.5] },
      { key: 'timeLimitCandles', values: [6, 8, 12] },
    ],
  },

  alt_detection: {
    strategyId: 'alt_detection',
    ranges: [
      { key: 'scoreThreshold', values: [0.5, 0.6, 0.7] },
      { key: 'takeProfitPct1', values: [3, 5, 7] },
      { key: 'takeProfitPct2', values: [8, 10, 15] },
      { key: 'stopLossPct', values: [2, 3, 5] },
    ],
    constraints: (p) => p.takeProfitPct1 < p.takeProfitPct2,
  },
}

// ─── 그리드 생성 ──────────────────────────────────────────────

/**
 * 전략에 대한 파라미터 그리드를 생성한다
 *
 * @returns ParamSet[] — 유효한 파라미터 조합 배열 (최대 MAX_GRID_SIZE개)
 *          스펙이 없는 전략은 빈 배열 반환
 */
export function generateGrid(strategyId: string): ParamSet[] {
  const spec = PARAM_SPECS[strategyId]
  if (!spec) return []

  const { ranges, constraints } = spec

  // 카르테시안 프로덕트 생성
  let combos: ParamSet[] = [{}]

  for (const range of ranges) {
    const expanded: ParamSet[] = []
    for (const combo of combos) {
      for (const value of range.values) {
        expanded.push({ ...combo, [range.key]: value })
      }
    }
    combos = expanded
  }

  // 제약 조건 필터링
  if (constraints) {
    combos = combos.filter(constraints)
  }

  // 최대 크기 제한 (균등 샘플링)
  if (combos.length > MAX_GRID_SIZE) {
    const step = combos.length / MAX_GRID_SIZE
    const sampled: ParamSet[] = []
    for (let i = 0; i < MAX_GRID_SIZE; i++) {
      sampled.push(combos[Math.floor(i * step)])
    }
    combos = sampled
  }

  return combos
}

/**
 * 등록된 전략 ID 목록 반환
 */
export function getExplorerStrategyIds(): string[] {
  return Object.keys(PARAM_SPECS)
}
