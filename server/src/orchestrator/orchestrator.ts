/**
 * V2 오케스트레이터 — "어떤 전략을 신뢰할지 결정하는 머신"
 *
 * 시스템의 핵심 두뇌. BTC 레짐에 따라 전략을 선택·배치·교체하고
 * 자본을 성과 비례로 배분한다.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    오케스트레이터 사이클                       │
 * │                                                             │
 * │  ┌──────────┐    ┌──────────────┐    ┌────────────────┐     │
 * │  │ 레짐 판정 │───▶│ 후보 전략 랭킹 │───▶│ 슬롯별 판단 생성 │     │
 * │  │(BTC 기반) │    │(연구 메트릭)  │    │(교체/배치/청산) │     │
 * │  └──────────┘    └──────────────┘    └───────┬────────┘     │
 * │                                              │              │
 * │                                              ▼              │
 * │  ┌──────────┐    ┌──────────────┐    ┌────────────────┐     │
 * │  │ 대시보드  │◀───│ 슬롯 상태 갱신 │◀───│ 판단 실행      │     │
 * │  │ API 제공  │    │(DB 기록)     │    │(페이퍼 세션)   │     │
 * │  └──────────┘    └──────────────┘    └────────────────┘     │
 * │                                                             │
 * │  규칙:                                                      │
 * │  - Risk-On  → LONG 전략 우선                                │
 * │  - Risk-Off → SHORT 전략 우선 (숏 리스크 50%)               │
 * │  - Neutral  → Risk-Off 폴백 (포지션 축소/헤지)              │
 * │  - 24시간 쿨다운 — 레짐 복귀해도 즉시 전환 안 함             │
 * │  - 모든 전략 미달 시 go_flat (전량 청산)                     │
 * │  - Top N (최대 3) 성과 비례 배분                             │
 * └─────────────────────────────────────────────────────────────┘
 */

import { supabase } from '../services/database.js'
import { detectAndSaveRegime } from '../data/regime-detector.js'
import { createSession, stopSession } from '../paper/paper-engine.js'
import type {
  RegimeState,
  DecisionType,
  DecisionStatus,
} from '../core/types.js'
import { VALIDATION_THRESHOLDS } from '../core/types.js'

// ─── 상수 ─────────────────────────────────────────────────────

/** 후보 랭킹 가중치 */
const WEIGHT = {
  sharpe: 0.4,
  winRate: 0.3,
  mddInverse: 0.3,
} as const

/** 최소 점수 — 이 이하이면 go_flat 대상 */
const MIN_CANDIDATE_SCORE = 0.3

/** 슬롯당 최대 전략 수 */
const MAX_SLOT_STRATEGIES = 3

/** 쿨다운 시간 (밀리초) */
const COOLDOWN_MS = VALIDATION_THRESHOLDS.orchestrator.cooldownHours * 60 * 60 * 1000

/** 숏 전략 리스크 비율 */
const SHORT_RISK_RATIO = VALIDATION_THRESHOLDS.orchestrator.shortRiskRatio

// ─── 내부 타입 ────────────────────────────────────────────────

/** 후보 전략 랭킹 결과 */
interface CandidateRanking {
  strategyDbId: string    // strategies.id (uuid)
  strategyId: string      // strategies.strategy_id (텍스트 키)
  direction: string       // "long", "short", "both"
  score: number
  sharpe: number
  mdd: number
  winRate: number
}

/** 자본 배분 결과 */
interface AllocationResult {
  strategyDbId: string
  strategyId: string
  allocationPct: number   // 0~100
}

/** 슬롯 상태 (대시보드용) */
interface SlotStatus {
  slotId: string
  assetKey: string
  slotType: string
  strategyId: string | null
  allocationPct: number
  regime: RegimeState | null
  status: string
  cooldownUntil: string | null
}

// ─── 메인 사이클 ──────────────────────────────────────────────

/**
 * 오케스트레이터 메인 사이클 (크론 진입점)
 *
 * 1. 레짐 판정
 * 2. 후보 전략 랭킹
 * 3. go_flat 체크
 * 4. 슬롯별 판단 생성 및 실행
 */
export async function runOrchestratorCycle(): Promise<void> {
  console.log('[오케스트레이터] ═══ 사이클 시작 ═══')

  try {
    // 1단계: 레짐 판정
    const regime = await detectAndSaveRegime()
    console.log(`[오케스트레이터] 현재 레짐: ${regime}`)

    // 2단계: 후보 전략 랭킹
    const rankings = await rankCandidates(regime)
    console.log(`[오케스트레이터] 후보 전략 ${rankings.length}개 랭킹 완료`)

    // 3단계: go_flat 체크 — 모든 전략이 기준 미달이면 전량 청산
    const shouldGoFlat = await checkGoFlat(rankings)
    if (shouldGoFlat) {
      console.log('[오케스트레이터] go_flat 실행 — 모든 전략 미달')
      console.log('[오케스트레이터] ═══ 사이클 종료 (go_flat) ═══')
      return
    }

    // 4단계: 슬롯별 판단 생성
    const slots = await loadActiveSlots()
    if (slots.length === 0) {
      console.log('[오케스트레이터] 활성 슬롯 없음 — 초기 배치 실행')
      await initialAssignment(rankings, regime)
      console.log('[오케스트레이터] ═══ 사이클 종료 (초기 배치) ═══')
      return
    }

    // 기존 슬롯 순회: 교체 필요성 판단
    for (const slot of slots) {
      try {
        await evaluateSlot(slot, rankings, regime)
      } catch (err) {
        console.error(`[오케스트레이터] 슬롯 ${slot.id} 평가 오류:`, err)
      }
    }

    console.log('[오케스트레이터] ═══ 사이클 종료 ═══')
  } catch (err) {
    console.error('[오케스트레이터] 사이클 치명적 오류:', err)
  }
}

// ─── 후보 랭킹 ───────────────────────────────────────────────

/**
 * 후보 전략 랭킹
 *
 * research_run_metrics에서 최근 완료된 연구 결과를 조회하고
 * 레짐에 맞는 방향의 전략만 필터링한 뒤 가중 점수를 계산한다.
 *
 * 점수 = sharpe * 0.4 + winRate * 0.3 + (1 - mdd) * 0.3
 */
export async function rankCandidates(regime: RegimeState): Promise<CandidateRanking[]> {
  // 최근 연구 결과 조회 (완료된 것만, 최근 30일)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: runs, error: runsErr } = await supabase
    .from('research_runs')
    .select(`
      id,
      strategy_id,
      status,
      strategies!inner(id, strategy_id, direction, status),
      research_run_metrics(sharpe, max_drawdown, win_rate, trade_count)
    `)
    .eq('status', 'completed')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })

  if (runsErr || !runs) {
    console.error('[오케스트레이터] 연구 결과 조회 오류:', runsErr?.message)
    return []
  }

  // 전략별 최신 메트릭 집계 (같은 전략의 여러 실행 중 최신 것)
  const strategyMetrics = new Map<string, {
    strategyDbId: string
    strategyId: string
    direction: string
    sharpe: number
    mdd: number
    winRate: number
  }>()

  for (const run of runs) {
    const strategy = run.strategies as unknown as {
      id: string
      strategy_id: string
      direction: string
      status: string
    }
    const metrics = run.research_run_metrics as unknown as Array<{
      sharpe: number | null
      max_drawdown: number | null
      win_rate: number | null
      trade_count: number | null
    }>

    // 퇴역 전략 제외
    if (strategy.status === 'retired') continue

    // 메트릭이 없으면 건너뜀
    if (!metrics || metrics.length === 0) continue
    const m = metrics[0]
    if (m.sharpe === null || m.max_drawdown === null || m.win_rate === null) continue

    // 최소 거래 수 미달 시 건너뜀
    if ((m.trade_count ?? 0) < VALIDATION_THRESHOLDS.researchToPaper.minTrades) continue

    // 전략별 최신 메트릭만 보존 (Map에 이미 있으면 건너뜀 — 최신순 정렬이므로)
    if (strategyMetrics.has(strategy.id)) continue

    strategyMetrics.set(strategy.id, {
      strategyDbId: strategy.id,
      strategyId: strategy.strategy_id,
      direction: strategy.direction,
      sharpe: m.sharpe,
      mdd: m.max_drawdown,
      winRate: m.win_rate,
    })
  }

  // 레짐별 방향 필터링
  const directionFilter = getDirectionFilter(regime)
  const filtered = [...strategyMetrics.values()].filter((s) =>
    directionFilter.includes(s.direction)
  )

  // 점수 계산 및 정렬
  const rankings: CandidateRanking[] = filtered.map((s) => {
    // 정규화: sharpe는 0~3 범위를 0~1로, winRate는 0~1 그대로, mdd는 0~1 범위
    const normalizedSharpe = Math.max(0, Math.min(s.sharpe / 3, 1))
    const normalizedWinRate = Math.max(0, Math.min(s.winRate, 1))
    const normalizedMddInverse = Math.max(0, 1 - Math.min(s.mdd, 1))

    const score =
      normalizedSharpe * WEIGHT.sharpe +
      normalizedWinRate * WEIGHT.winRate +
      normalizedMddInverse * WEIGHT.mddInverse

    return {
      strategyDbId: s.strategyDbId,
      strategyId: s.strategyId,
      direction: s.direction,
      score: Math.round(score * 10000) / 10000,
      sharpe: s.sharpe,
      mdd: s.mdd,
      winRate: s.winRate,
    }
  })

  // 점수 내림차순 정렬
  rankings.sort((a, b) => b.score - a.score)

  // DB에 랭킹 저장 (기존 랭킹은 이력으로 남김)
  if (rankings.length > 0) {
    const rows = rankings.map((r) => ({
      strategy_id: r.strategyDbId,
      regime,
      score: r.score,
      sharpe: r.sharpe,
      mdd: r.mdd,
      win_rate: r.winRate,
    }))

    const { error: insertErr } = await supabase
      .from('orchestrator_candidate_rankings')
      .insert(rows)

    if (insertErr) {
      console.error('[오케스트레이터] 랭킹 저장 오류:', insertErr.message)
    }
  }

  console.log(
    '[오케스트레이터] 후보 랭킹:',
    rankings.slice(0, 5).map((r) =>
      `${r.strategyId}(${r.score.toFixed(3)})`
    ).join(', '),
  )

  return rankings
}

// ─── 자본 배분 ───────────────────────────────────────────────

/**
 * 성과 비례 자본 배분
 *
 * Top N 후보에게 점수 비례로 자본을 배분한다.
 * 숏 전략은 롱의 50% 리스크 한도를 적용한다.
 */
export function allocateCapital(
  candidates: CandidateRanking[],
  totalCapital: number,
): AllocationResult[] {
  if (candidates.length === 0) return []

  // Top N 선택
  const topN = candidates.slice(0, MAX_SLOT_STRATEGIES)

  // 숏 전략에 리스크 비율 적용한 유효 점수 계산
  const effectiveScores = topN.map((c) => {
    const isShortOnly = c.direction === 'short'
    return {
      ...c,
      effectiveScore: isShortOnly ? c.score * SHORT_RISK_RATIO : c.score,
    }
  })

  // 유효 점수 합계
  const totalScore = effectiveScores.reduce((sum, c) => sum + c.effectiveScore, 0)
  if (totalScore <= 0) return []

  // 비례 배분
  const allocations: AllocationResult[] = effectiveScores.map((c) => {
    const pct = (c.effectiveScore / totalScore) * 100
    return {
      strategyDbId: c.strategyDbId,
      strategyId: c.strategyId,
      allocationPct: Math.round(pct * 100) / 100,
    }
  })

  console.log(
    '[오케스트레이터] 자본 배분:',
    allocations.map((a) => `${a.strategyId}=${a.allocationPct.toFixed(1)}%`).join(', '),
    `| 총 자본=${totalCapital.toLocaleString()}`,
  )

  return allocations
}

// ─── 판단 실행 (상태 머신) ────────────────────────────────────

/**
 * 판단 실행 상태 머신
 *
 * PENDING → EXECUTING → EXECUTED
 * EXECUTING에서 실패 시 → FAILED
 *
 * 전략 교체 시:
 *   1. 기존 전략의 페이퍼 세션 종료
 *   2. 새 전략의 페이퍼 세션 생성
 *   3. 슬롯 업데이트
 */
export async function executeDecision(decisionId: string): Promise<boolean> {
  // 판단 조회
  const { data: decision, error: fetchErr } = await supabase
    .from('orchestrator_decisions')
    .select('*')
    .eq('id', decisionId)
    .single()

  if (fetchErr || !decision) {
    console.error(`[오케스트레이터] 판단 ${decisionId} 조회 실패:`, fetchErr?.message)
    return false
  }

  // PENDING 또는 APPROVED 상태만 실행 가능
  if (decision.status !== 'pending' && decision.status !== 'approved') {
    console.warn(`[오케스트레이터] 판단 ${decisionId} 실행 불가 상태: ${decision.status}`)
    return false
  }

  // PENDING → EXECUTING
  await updateDecisionStatus(decisionId, 'executing')

  try {
    const decisionType = decision.decision_type as DecisionType

    switch (decisionType) {
      case 'strategy_assign':
        await handleStrategyAssign(decision)
        break
      case 'strategy_switch':
        await handleStrategySwitch(decision)
        break
      case 'strategy_retire':
        await handleStrategyRetire(decision)
        break
      case 'go_flat':
        await handleGoFlat(decision)
        break
      case 'rebalance':
        await handleRebalance(decision)
        break
      default:
        console.warn(`[오케스트레이터] 알 수 없는 판단 유형: ${decisionType}`)
    }

    // EXECUTING → EXECUTED
    await updateDecisionStatus(decisionId, 'executed')
    console.log(`[오케스트레이터] 판단 ${decisionId} 실행 완료 (${decisionType})`)
    return true
  } catch (err) {
    // EXECUTING → FAILED
    await updateDecisionStatus(decisionId, 'failed')
    console.error(`[오케스트레이터] 판단 ${decisionId} 실행 실패:`, err)
    return false
  }
}

// ─── go_flat 체크 ─────────────────────────────────────────────

/**
 * 전량 청산 조건 체크
 *
 * 모든 후보 전략의 점수가 최소 기준 미만이면
 * go_flat 판단을 생성하고 모든 활성 세션을 종료한다.
 */
export async function checkGoFlat(rankings: CandidateRanking[]): Promise<boolean> {
  // 후보가 아예 없거나 모든 점수가 기준 미달인 경우
  const qualified = rankings.filter((r) => r.score >= MIN_CANDIDATE_SCORE)

  if (qualified.length > 0) return false

  console.warn('[오케스트레이터] 모든 후보 전략 기준 미달 — go_flat 판단 생성')

  // 현재 레짐 조회 (최신 스냅샷)
  const { data: latestRegime } = await supabase
    .from('regime_snapshots')
    .select('regime')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()

  const regime = (latestRegime?.regime as RegimeState) ?? 'risk_off'

  // go_flat 판단 생성
  const { data: decision, error: decErr } = await supabase
    .from('orchestrator_decisions')
    .insert({
      decision_type: 'go_flat' satisfies DecisionType,
      status: 'pending' satisfies DecisionStatus,
      regime,
      reason_summary: `모든 후보 전략 점수 미달 (최고점: ${rankings.length > 0 ? rankings[0].score.toFixed(3) : '없음'}, 기준: ${MIN_CANDIDATE_SCORE})`,
      score_snapshot: rankings.length > 0
        ? Object.fromEntries(rankings.map((r) => [r.strategyId, r.score]))
        : {},
    })
    .select('id')
    .single()

  if (decErr || !decision) {
    console.error('[오케스트레이터] go_flat 판단 생성 오류:', decErr?.message)
    return true
  }

  // 즉시 실행
  await executeDecision(decision.id)
  return true
}

// ─── 슬롯 상태 조회 (대시보드 API) ───────────────────────────

/**
 * 현재 슬롯 배치 상태 반환 (대시보드용)
 */
export async function getSlotStatus(): Promise<SlotStatus[]> {
  const { data: slots, error } = await supabase
    .from('orchestrator_slots')
    .select(`
      id,
      asset_key,
      slot_type,
      strategy_id,
      allocation_pct,
      regime,
      status,
      cooldown_until
    `)
    .order('asset_key')

  if (error || !slots) {
    console.error('[오케스트레이터] 슬롯 조회 오류:', error?.message)
    return []
  }

  // 전략 이름 조회를 위해 strategy_id 목록 수집
  const strategyDbIds = slots
    .map((s) => s.strategy_id)
    .filter((id): id is string => id !== null)

  let strategyNameMap = new Map<string, string>()
  if (strategyDbIds.length > 0) {
    const { data: strategies } = await supabase
      .from('strategies')
      .select('id, strategy_id')
      .in('id', strategyDbIds)

    if (strategies) {
      strategyNameMap = new Map(strategies.map((s) => [s.id, s.strategy_id]))
    }
  }

  return slots.map((s) => ({
    slotId: s.id,
    assetKey: s.asset_key,
    slotType: s.slot_type,
    strategyId: s.strategy_id ? (strategyNameMap.get(s.strategy_id) ?? s.strategy_id) : null,
    allocationPct: s.allocation_pct,
    regime: s.regime as RegimeState | null,
    status: s.status,
    cooldownUntil: s.cooldown_until,
  }))
}

// ─── EDGE 스코어 계산 (대시보드용) ────────────────────────────

/**
 * EDGE 스코어: "현재 시장이 내 전략에 얼마나 유리한가" (0-100)
 *
 * 계산식:
 *   EDGE = weighted_avg( 전략적합도 * 시장적합도 )
 *
 *   전략 적합도 = 최근 연구 메트릭 기반 (승률, sharpe, MDD)
 *   시장 적합도 = 현재 레짐과 전략 최적 레짐 일치도
 *
 * 활성 슬롯이 없으면 null 반환.
 */
export async function calculateEdgeScore(): Promise<number | null> {
  // 활성 슬롯 조회
  const { data: activeSlots } = await supabase
    .from('orchestrator_slots')
    .select('strategy_id, allocation_pct, regime')
    .eq('status', 'active')

  if (!activeSlots || activeSlots.length === 0) return null

  // 현재 레짐 조회
  const { data: currentRegime } = await supabase
    .from('regime_snapshots')
    .select('regime')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single()

  const regime = currentRegime?.regime ?? 'neutral'

  // 각 슬롯의 전략 메트릭 조회
  const strategyIds = activeSlots
    .map((s) => s.strategy_id)
    .filter((id): id is string => id !== null)

  if (strategyIds.length === 0) return null

  // 전략별 최신 연구 메트릭
  const { data: runs } = await supabase
    .from('research_runs')
    .select('strategy_id, research_run_metrics(sharpe, max_drawdown, win_rate)')
    .in('strategy_id', strategyIds)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })

  // 전략별 최신 메트릭만 추출
  const metricsMap = new Map<string, { sharpe: number; mdd: number; winRate: number }>()
  for (const run of runs ?? []) {
    if (metricsMap.has(run.strategy_id)) continue
    const m = Array.isArray(run.research_run_metrics)
      ? run.research_run_metrics[0]
      : run.research_run_metrics
    if (m) {
      metricsMap.set(run.strategy_id, {
        sharpe: Number(m.sharpe ?? 0),
        mdd: Math.abs(Number(m.max_drawdown ?? 0)),
        winRate: Number(m.win_rate ?? 0),
      })
    }
  }

  // 전략 방향 조회
  const { data: strategies } = await supabase
    .from('strategies')
    .select('id, direction')
    .in('id', strategyIds)

  const directionMap = new Map<string, string>()
  for (const s of strategies ?? []) {
    directionMap.set(s.id, s.direction)
  }

  // 슬롯별 점수 계산
  let totalWeight = 0
  let weightedScore = 0

  for (const slot of activeSlots) {
    if (!slot.strategy_id) continue
    const metrics = metricsMap.get(slot.strategy_id)
    if (!metrics) continue

    // 전략 적합도 (0-100): sharpe, 승률, MDD 기반
    const sharpeScore = Math.min(metrics.sharpe / 2, 1) * 100   // sharpe 2.0 = 100점
    const winRateScore = metrics.winRate                          // 승률 그대로
    const mddScore = Math.max(0, 100 - metrics.mdd * 10)         // MDD -10% = 0점
    const strategyFitness = sharpeScore * 0.4 + winRateScore * 0.3 + mddScore * 0.3

    // 시장 적합도 (0-100): 레짐과 전략 방향 일치도
    const direction = directionMap.get(slot.strategy_id) ?? 'both'
    let marketFitness = 50 // 기본값
    if (regime === 'risk_on' && (direction === 'long' || direction === 'both')) marketFitness = 90
    else if (regime === 'risk_on' && direction === 'short') marketFitness = 20
    else if (regime === 'risk_off' && (direction === 'short' || direction === 'both')) marketFitness = 80
    else if (regime === 'risk_off' && direction === 'long') marketFitness = 30
    else if (regime === 'neutral') marketFitness = 50

    const slotScore = (strategyFitness * marketFitness) / 100
    const weight = Number(slot.allocation_pct) || 1
    weightedScore += slotScore * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return null

  return Math.round(weightedScore / totalWeight)
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────

/**
 * 슬롯 쿨다운 확인
 *
 * 마지막 전략 교체로부터 24시간이 지나지 않았으면 쿨다운 중
 */
function isInCooldown(slot: { cooldown_until: string | null }): boolean {
  if (!slot.cooldown_until) return false
  return new Date(slot.cooldown_until).getTime() > Date.now()
}

/**
 * 레짐에 맞는 전략 방향 필터
 *
 * Risk-On  → long 또는 both (롱 우선)
 * Risk-Off → short 또는 both (숏 우선)
 * Neutral  → Risk-Off와 동일 (포지션 축소/헤지)
 */
function getDirectionFilter(regime: RegimeState): string[] {
  switch (regime) {
    case 'risk_on':
      return ['long', 'both']
    case 'risk_off':
    case 'neutral':
      // Neutral은 Risk-Off로 폴백
      return ['short', 'both']
  }
}

/** 활성 슬롯 로드 */
async function loadActiveSlots(): Promise<Array<{
  id: string
  asset_key: string
  slot_type: string
  strategy_id: string | null
  allocation_pct: number
  regime: string | null
  status: string
  cooldown_until: string | null
}>> {
  const { data, error } = await supabase
    .from('orchestrator_slots')
    .select('*')
    .in('status', ['active', 'cooldown'])

  if (error || !data) {
    console.error('[오케스트레이터] 슬롯 로드 오류:', error?.message)
    return []
  }

  return data
}

/**
 * 슬롯 평가 — 현재 전략 vs 후보 비교
 *
 * 교체 조건:
 *   1. 쿨다운 중이면 건너뜀
 *   2. 현재 전략이 후보 목록에 없으면 교체
 *   3. 현재 전략보다 점수가 20% 이상 높은 후보가 있으면 교체
 */
async function evaluateSlot(
  slot: {
    id: string
    asset_key: string
    strategy_id: string | null
    status: string
    cooldown_until: string | null
  },
  rankings: CandidateRanking[],
  regime: RegimeState,
): Promise<void> {
  // 쿨다운 체크
  if (isInCooldown(slot)) {
    const remaining = new Date(slot.cooldown_until!).getTime() - Date.now()
    const hours = Math.ceil(remaining / (1000 * 60 * 60))
    console.log(`[오케스트레이터] 슬롯 ${slot.asset_key}: 쿨다운 중 (${hours}시간 남음)`)
    return
  }

  // 빈 슬롯이면 배치
  if (!slot.strategy_id) {
    const bestCandidate = rankings[0]
    if (bestCandidate && bestCandidate.score >= MIN_CANDIDATE_SCORE) {
      await createAndExecuteDecision({
        slotId: slot.id,
        decisionType: 'strategy_assign',
        fromStrategyId: null,
        toStrategyId: bestCandidate.strategyDbId,
        regime,
        reason: `빈 슬롯에 최고 후보 배치: ${bestCandidate.strategyId} (점수: ${bestCandidate.score.toFixed(3)})`,
        scoreSnapshot: Object.fromEntries(rankings.slice(0, 5).map((r) => [r.strategyId, r.score])),
      })
    }
    return
  }

  // 현재 전략의 랭킹 찾기
  const currentRanking = rankings.find((r) => r.strategyDbId === slot.strategy_id)
  const topCandidate = rankings[0]

  // 현재 전략이 랭킹에 없음 → 퇴역된 전략일 수 있음, 교체
  if (!currentRanking) {
    if (topCandidate && topCandidate.score >= MIN_CANDIDATE_SCORE) {
      await createAndExecuteDecision({
        slotId: slot.id,
        decisionType: 'strategy_switch',
        fromStrategyId: slot.strategy_id,
        toStrategyId: topCandidate.strategyDbId,
        regime,
        reason: `현재 전략 랭킹 탈락 — ${topCandidate.strategyId}로 교체 (점수: ${topCandidate.score.toFixed(3)})`,
        scoreSnapshot: Object.fromEntries(rankings.slice(0, 5).map((r) => [r.strategyId, r.score])),
      })
    }
    return
  }

  // 현재 전략 vs Top 후보 비교 — 20% 이상 차이나면 교체
  if (
    topCandidate &&
    topCandidate.strategyDbId !== slot.strategy_id &&
    topCandidate.score >= MIN_CANDIDATE_SCORE &&
    topCandidate.score > currentRanking.score * 1.2
  ) {
    await createAndExecuteDecision({
      slotId: slot.id,
      decisionType: 'strategy_switch',
      fromStrategyId: slot.strategy_id,
      toStrategyId: topCandidate.strategyDbId,
      regime,
      reason: `성과 격차 교체: ${currentRanking.strategyId}(${currentRanking.score.toFixed(3)}) → ${topCandidate.strategyId}(${topCandidate.score.toFixed(3)})`,
      scoreSnapshot: Object.fromEntries(rankings.slice(0, 5).map((r) => [r.strategyId, r.score])),
    })
    return
  }

  console.log(
    `[오케스트레이터] 슬롯 ${slot.asset_key}: 현재 전략 유지 ` +
    `(${currentRanking.strategyId}, 점수: ${currentRanking.score.toFixed(3)})`,
  )
}

/**
 * 초기 슬롯 배치 — 슬롯이 없을 때 Top N 전략을 새로 배치
 */
async function initialAssignment(
  rankings: CandidateRanking[],
  regime: RegimeState,
): Promise<void> {
  const qualified = rankings.filter((r) => r.score >= MIN_CANDIDATE_SCORE)
  if (qualified.length === 0) {
    console.log('[오케스트레이터] 초기 배치할 자격 있는 후보 없음')
    return
  }

  // 자본 배분 계산
  const allocations = allocateCapital(qualified, 100) // 비율만 계산

  for (const alloc of allocations) {
    // 슬롯 생성
    const { data: slot, error: slotErr } = await supabase
      .from('orchestrator_slots')
      .insert({
        asset_key: 'BTC-USDT',  // 초기에는 BTC 단일 자산
        slot_type: 'primary',
        strategy_id: alloc.strategyDbId,
        allocation_pct: alloc.allocationPct,
        regime,
        status: 'active',
      })
      .select('id')
      .single()

    if (slotErr || !slot) {
      console.error('[오케스트레이터] 슬롯 생성 오류:', slotErr?.message)
      continue
    }

    // 판단 로그 기록
    await createAndExecuteDecision({
      slotId: slot.id,
      decisionType: 'strategy_assign',
      fromStrategyId: null,
      toStrategyId: alloc.strategyDbId,
      regime,
      reason: `초기 배치: ${alloc.strategyId} (배분: ${alloc.allocationPct.toFixed(1)}%, 점수: ${rankings.find((r) => r.strategyDbId === alloc.strategyDbId)?.score.toFixed(3) ?? '?'})`,
      scoreSnapshot: Object.fromEntries(rankings.slice(0, 5).map((r) => [r.strategyId, r.score])),
    })
  }
}

// ─── 판단 처리 핸들러 ────────────────────────────────────────

/** 전략 배치 처리 — 새 페이퍼 세션 생성 */
async function handleStrategyAssign(decision: Record<string, unknown>): Promise<void> {
  const toStrategyId = decision.to_strategy_id as string
  const slotId = decision.slot_id as string

  // 새 페이퍼 세션 생성
  const sessionId = await createSession(toStrategyId)
  if (!sessionId) {
    throw new Error(`페이퍼 세션 생성 실패: 전략 ${toStrategyId}`)
  }

  // 슬롯 업데이트
  await supabase
    .from('orchestrator_slots')
    .update({
      strategy_id: toStrategyId,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId)

  console.log(`[오케스트레이터] 전략 배치 완료: 슬롯 ${slotId} ← 전략 ${toStrategyId} (세션: ${sessionId})`)
}

/** 전략 교체 처리 — 기존 세션 종료 + 새 세션 생성 + 쿨다운 설정 */
async function handleStrategySwitch(decision: Record<string, unknown>): Promise<void> {
  const fromStrategyId = decision.from_strategy_id as string
  const toStrategyId = decision.to_strategy_id as string
  const slotId = decision.slot_id as string

  // 기존 전략의 활성 페이퍼 세션 종료
  const { data: activeSessions } = await supabase
    .from('paper_sessions')
    .select('id')
    .eq('strategy_id', fromStrategyId)
    .eq('status', 'running')

  for (const session of activeSessions ?? []) {
    await stopSession(session.id)
    console.log(`[오케스트레이터] 기존 세션 종료: ${session.id} (전략: ${fromStrategyId})`)
  }

  // 새 전략의 페이퍼 세션 생성
  const newSessionId = await createSession(toStrategyId)
  if (!newSessionId) {
    throw new Error(`새 페이퍼 세션 생성 실패: 전략 ${toStrategyId}`)
  }

  // 쿨다운 시간 계산
  const cooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString()

  // 슬롯 업데이트 (쿨다운 설정)
  await supabase
    .from('orchestrator_slots')
    .update({
      strategy_id: toStrategyId,
      status: 'cooldown',
      cooldown_until: cooldownUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId)

  console.log(
    `[오케스트레이터] 전략 교체 완료: ${fromStrategyId} → ${toStrategyId}` +
    ` (슬롯: ${slotId}, 쿨다운: 24시간)`,
  )
}

/** 전략 퇴역 처리 — 세션 종료 + 슬롯 비움 */
async function handleStrategyRetire(decision: Record<string, unknown>): Promise<void> {
  const fromStrategyId = decision.from_strategy_id as string
  const slotId = decision.slot_id as string

  // 활성 세션 종료
  const { data: activeSessions } = await supabase
    .from('paper_sessions')
    .select('id')
    .eq('strategy_id', fromStrategyId)
    .eq('status', 'running')

  for (const session of activeSessions ?? []) {
    await stopSession(session.id)
  }

  // 슬롯 비움
  await supabase
    .from('orchestrator_slots')
    .update({
      strategy_id: null,
      allocation_pct: 0,
      status: 'empty',
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId)

  console.log(`[오케스트레이터] 전략 퇴역: ${fromStrategyId} (슬롯: ${slotId})`)
}

/** go_flat 처리 — 모든 활성 세션 종료 + 모든 슬롯 flat */
async function handleGoFlat(_decision: Record<string, unknown>): Promise<void> {
  // 모든 running 세션 종료
  const { data: runningSessions } = await supabase
    .from('paper_sessions')
    .select('id')
    .eq('status', 'running')

  let closedCount = 0
  for (const session of runningSessions ?? []) {
    const ok = await stopSession(session.id)
    if (ok) closedCount++
  }

  // 모든 슬롯을 flat 상태로
  await supabase
    .from('orchestrator_slots')
    .update({
      strategy_id: null,
      allocation_pct: 0,
      status: 'flat',
      updated_at: new Date().toISOString(),
    })
    .in('status', ['active', 'cooldown'])

  console.log(`[오케스트레이터] go_flat 실행 완료 — 세션 ${closedCount}개 종료, 모든 슬롯 flat`)
}

/** 자본 재배분 처리 — 기존 슬롯의 배분 비율만 변경 */
async function handleRebalance(decision: Record<string, unknown>): Promise<void> {
  const scoreSnapshot = decision.score_snapshot as Record<string, number> | null
  if (!scoreSnapshot) return

  // 현재 활성 슬롯 조회
  const { data: activeSlots } = await supabase
    .from('orchestrator_slots')
    .select('id, strategy_id')
    .eq('status', 'active')

  if (!activeSlots || activeSlots.length === 0) return

  // 슬롯별 전략의 점수를 기반으로 재배분
  const totalScore = Object.values(scoreSnapshot).reduce((sum, s) => sum + s, 0)
  if (totalScore <= 0) return

  for (const slot of activeSlots) {
    if (!slot.strategy_id) continue

    // strategy_id(uuid)에서 전략 텍스트 키 조회
    const { data: strategy } = await supabase
      .from('strategies')
      .select('strategy_id')
      .eq('id', slot.strategy_id)
      .single()

    const strategyKey = strategy?.strategy_id
    const score = strategyKey ? (scoreSnapshot[strategyKey] ?? 0) : 0
    const newPct = totalScore > 0 ? (score / totalScore) * 100 : 0

    await supabase
      .from('orchestrator_slots')
      .update({
        allocation_pct: Math.round(newPct * 100) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', slot.id)
  }

  console.log('[오케스트레이터] 자본 재배분 완료')
}

// ─── 공통 유틸 ───────────────────────────────────────────────

/** 판단 상태 업데이트 */
async function updateDecisionStatus(
  decisionId: string,
  status: DecisionStatus,
): Promise<void> {
  const update: Record<string, unknown> = { status }
  if (status === 'executed' || status === 'failed') {
    update.executed_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('orchestrator_decisions')
    .update(update)
    .eq('id', decisionId)

  if (error) {
    console.error(`[오케스트레이터] 판단 상태 업데이트 오류 (${decisionId} → ${status}):`, error.message)
  }
}

/** 승인 없이 즉시 실행하는 판단 유형 (긴급/시스템 판단) */
const AUTO_EXECUTE_TYPES: DecisionType[] = ['go_flat', 'rebalance']

/** 판단 생성 — 유형에 따라 즉시 실행 또는 승인 대기 */
async function createAndExecuteDecision(params: {
  slotId: string
  decisionType: DecisionType
  fromStrategyId: string | null
  toStrategyId: string | null
  regime: RegimeState
  reason: string
  scoreSnapshot: Record<string, number>
}): Promise<void> {
  const autoExecute = AUTO_EXECUTE_TYPES.includes(params.decisionType)

  const { data: decision, error: decErr } = await supabase
    .from('orchestrator_decisions')
    .insert({
      slot_id: params.slotId,
      decision_type: params.decisionType,
      status: 'pending' satisfies DecisionStatus,
      from_strategy_id: params.fromStrategyId,
      to_strategy_id: params.toStrategyId,
      regime: params.regime,
      reason_summary: params.reason,
      score_snapshot: params.scoreSnapshot,
    })
    .select('id')
    .single()

  if (decErr || !decision) {
    console.error('[오케스트레이터] 판단 생성 오류:', decErr?.message)
    return
  }

  if (autoExecute) {
    // go_flat, rebalance는 긴급 판단 — 즉시 실행
    console.log(`[오케스트레이터] 판단 생성 + 즉시 실행: ${params.decisionType} (${decision.id})`)
    await executeDecision(decision.id)
  } else {
    // strategy_assign, strategy_switch, strategy_retire는 승인 대기
    console.log(`[오케스트레이터] 판단 생성 → 승인 대기: ${params.decisionType} (${decision.id})`)
  }
}
