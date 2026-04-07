/**
 * AI 연구 리뷰 엔진
 *
 * PRD §15 — AI는 "보조 분석자"로서:
 *   - 파라미터 탐색 범위 재제안
 *   - 전략군 제외/우선순위 변경 제안
 *   - 결과 요약과 해석
 *   - 재탐색 필요 전략군 추천
 *
 * 닫힌 루프:
 *   AI paramSuggestions → 새 그리드 생성 → 백테스트/검증 → 조건부 승격
 *
 * 비용 제어:
 *   - 전략별 쿨다운 (기본 6시간)
 *   - 동일 트리거 중복 방지
 *   - 일일 토큰 예산
 */

import { callAi, isAiEnabled, type AiResponse } from '../services/ai-client.js'
import { getConstraints } from './param-explorer.js'
import { supabase } from '../services/database.js'

// ─── 타입 ─────────────────────────────────────────────────────

export type TriggerReason =
  | 'ambiguous_ranking'
  | 'performance_collapse'
  | 'param_re_explore'
  | 'high_ev_high_mdd'
  | 'validation_wipeout'
  | 'manual_request'

export type ReviewType =
  | 'research_analysis'
  | 'param_proposal'
  | 'strategy_comparison'
  | 'failure_analysis'

export type ReviewStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

/** AI 리뷰 결과 구조 */
export interface AiAnalysis {
  strengths: string[]
  weaknesses: string[]
  risks: string[]
  paramSuggestions?: ParamSuggestion[]
  recommendation: string
  confidence: number
}

export interface ParamSuggestion {
  key: string
  currentRange: [number, number]
  suggestedRange: [number, number]
  reason: string
}

/** 리뷰 요청 입력 */
export interface ReviewInput {
  triggerReason: TriggerReason
  reviewType: ReviewType
  strategyId: string         // DB UUID
  researchRunId?: string     // DB UUID
  metrics: ReviewMetrics
  segments?: SegmentSummary[]
  comparisonCandidates?: CandidateSummary[]
  /** 검증 실패 시 실패 사유 목록 */
  failureReasons?: string[]
}

export interface ReviewMetrics {
  strategyName: string
  paramSet: Record<string, number>
  totalReturn: number
  maxDrawdown: number
  sharpe: number
  winRate: number
  expectedValue: number
  profitFactor: number
  tradeCount: number
  avgHoldHours: number
  costRatio: number
}

export interface SegmentSummary {
  name: string
  role: string
  totalReturn: number
  maxDrawdown: number
  expectedValue: number
  winRate: number
  tradeCount: number
  sharpe: number
}

export interface CandidateSummary {
  strategyName: string
  paramSet: Record<string, number>
  oosEv: number
  wfMedianEv: number
  sharpe: number
  maxDrawdown: number
  tradeCount: number
}

/** 리뷰 결과 */
export interface ReviewResult {
  reviewId: string
  status: ReviewStatus
  summary: string | null
  analysis: AiAnalysis | null
  modelId: string | null
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

// ─── 비용 제어 상수 ───────────────────────────────────────────

const COST_CONTROL = {
  /** 전략별 AI 호출 쿨다운 (시간) */
  cooldownHours: Number(process.env.AI_COOLDOWN_H ?? 6),
  /** 일일 최대 토큰 예산 (input + output) */
  dailyTokenBudget: Number(process.env.AI_DAILY_TOKEN_BUDGET ?? 100_000),
  /** 파이프라인당 최대 자동 재탐색 횟수 */
  maxReExplorePerRun: 1,
}

// ─── 트리거 조건 평가 ─────────────────────────────────────────

const TRIGGER_THRESHOLDS = {
  highMddThreshold: 15,
  ambiguousEvRatio: 0.15,
  minAmbiguousCandidates: 3,
  /** 이전 OOS EV 대비 이 비율 이상 하락하면 performance_collapse */
  collapseDropRatio: 0.5,
}

/**
 * 파이프라인 결과를 보고 AI 리뷰가 필요한지 판단
 *
 * @param candidates 검증 통과 후보 (비어있으면 wipeout 판단)
 * @param bestMetrics 최적 후보 메트릭 (통과 후보가 있을 때)
 * @param previousBestEv 이전 파이프라인의 최적 OOS EV (성과 급락 판단용)
 */
export function evaluateTrigger(
  candidates: CandidateSummary[],
  bestMetrics?: ReviewMetrics,
  previousBestEv?: number,
): TriggerReason | null {
  // 1. EV 양수 + MDD 과도
  if (bestMetrics && bestMetrics.expectedValue > 0 && bestMetrics.maxDrawdown > TRIGGER_THRESHOLDS.highMddThreshold) {
    return 'high_ev_high_mdd'
  }

  // 2. 성과 급락: 이전 최적 EV 대비 50% 이상 하락
  if (bestMetrics && previousBestEv != null && previousBestEv > 0) {
    if (bestMetrics.expectedValue < previousBestEv * (1 - TRIGGER_THRESHOLDS.collapseDropRatio)) {
      return 'performance_collapse'
    }
  }

  // 3. 상위 후보 간 비교가 애매
  if (candidates.length >= TRIGGER_THRESHOLDS.minAmbiguousCandidates) {
    const evs = candidates.map((c) => c.oosEv).sort((a, b) => b - a)
    const topEv = evs[0]
    if (topEv > 0) {
      const closeCount = evs.filter((ev) => ev >= topEv * (1 - TRIGGER_THRESHOLDS.ambiguousEvRatio)).length
      if (closeCount >= TRIGGER_THRESHOLDS.minAmbiguousCandidates) {
        return 'ambiguous_ranking'
      }
    }
  }

  return null
}

// ─── 비용 제어: 쿨다운 + 중복 방지 + 예산 ────────────────────

/**
 * 전략별 쿨다운 + 동일 트리거 중복 방지 + 일일 예산 확인
 *
 * @returns true면 호출 가능, false면 스킵
 */
export async function canCallAi(
  strategyId: string,
  triggerReason: TriggerReason,
): Promise<boolean> {
  if (!isAiEnabled()) return false

  const cooldownSince = new Date(Date.now() - COST_CONTROL.cooldownHours * 60 * 60 * 1000).toISOString()

  // 1. 전략별 쿨다운: 최근 N시간 이내 같은 전략 + 같은 트리거로 완료된 리뷰
  const { count: duplicateCount } = await supabase
    .from('ai_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('strategy_id', strategyId)
    .eq('trigger_reason', triggerReason)
    .in('status', ['pending', 'processing', 'completed'])
    .gte('created_at', cooldownSince)

  if ((duplicateCount ?? 0) > 0) {
    return false
  }

  // 2. 일일 토큰 예산
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data: todayReviews } = await supabase
    .from('ai_reviews')
    .select('input_tokens, output_tokens')
    .in('status', ['completed', 'processing'])
    .gte('created_at', todayStart.toISOString())

  const todayTokens = (todayReviews ?? []).reduce(
    (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0,
  )

  if (todayTokens >= COST_CONTROL.dailyTokenBudget) {
    console.log(`[AI리뷰] 일일 토큰 예산 초과 (${todayTokens}/${COST_CONTROL.dailyTokenBudget}) — 스킵`)
    return false
  }

  return true
}

// ─── 리뷰 실행 ────────────────────────────────────────────────

/**
 * AI 리뷰 실행
 *
 * 1. 비용 제어 확인 (쿨다운/중복/예산)
 * 2. DB에 pending 레코드 생성
 * 3. 프롬프트 구성
 * 4. AI 호출
 * 5. 결과 파싱 + DB 업데이트
 */
export async function executeReview(input: ReviewInput): Promise<ReviewResult> {
  // 수동 요청이 아니면 비용 제어 확인
  if (input.triggerReason !== 'manual_request') {
    const allowed = await canCallAi(input.strategyId, input.triggerReason)
    if (!allowed) {
      return emptyResult('skipped')
    }
  }

  // DB 레코드 생성
  const { data: reviewRow, error: insertErr } = await supabase
    .from('ai_reviews')
    .insert({
      research_run_id: input.researchRunId ?? null,
      strategy_id: input.strategyId,
      trigger_reason: input.triggerReason,
      review_type: input.reviewType,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !reviewRow) {
    console.error('[AI리뷰] DB 레코드 생성 실패:', insertErr?.message)
    return emptyResult('failed')
  }

  const reviewId = reviewRow.id

  // AI 비활성화 시 스킵
  if (!isAiEnabled()) {
    await updateReview(reviewId, {
      status: 'skipped',
      error_message: 'AI API 키 미설정',
    })
    return { ...emptyResult('skipped'), reviewId }
  }

  // 프롬프트 구성
  await updateReview(reviewId, { status: 'processing' })
  const { system, userMessage } = buildPrompt(input)

  // AI 호출
  const aiResponse = await callAi({ system, userMessage })

  if (!aiResponse) {
    await updateReview(reviewId, {
      status: 'failed',
      error_message: 'AI 호출 실패',
    })
    return { ...emptyResult('failed'), reviewId }
  }

  // 결과 파싱
  const analysis = parseAnalysis(aiResponse.content)
  const summary = extractSummary(aiResponse.content)

  await updateReview(reviewId, {
    status: 'completed',
    summary,
    analysis,
    model_id: aiResponse.modelId,
    input_tokens: aiResponse.inputTokens,
    output_tokens: aiResponse.outputTokens,
    latency_ms: aiResponse.latencyMs,
    completed_at: new Date().toISOString(),
  })

  // research_run에 리뷰 연결
  if (input.researchRunId) {
    await supabase
      .from('research_runs')
      .update({ ai_review_id: reviewId })
      .eq('id', input.researchRunId)
  }

  return {
    reviewId,
    status: 'completed',
    summary,
    analysis,
    modelId: aiResponse.modelId,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
    latencyMs: aiResponse.latencyMs,
  }
}

// ─── AI 제안 → 그리드 변환 ────────────────────────────────────

/** AI 재탐색 실행을 위한 최소 confidence */
const MIN_RE_EXPLORE_CONFIDENCE = 0.4

/**
 * AI 재탐색 게이트: confidence가 충분한지 판단
 */
export function shouldReExplore(analysis: AiAnalysis): boolean {
  if (!analysis.paramSuggestions || analysis.paramSuggestions.length === 0) return false
  return analysis.confidence >= MIN_RE_EXPLORE_CONFIDENCE
}

/**
 * AI의 paramSuggestions를 실제 파라미터 그리드로 변환
 *
 * suggestedRange [min, max]에서 5~7단계로 균등 분할.
 * 전략별 제약조건(fastEma < slowEma 등)을 적용하여 무의미한 조합 제거.
 *
 * @param suggestions AI가 제안한 파라미터 범위
 * @param baseParams 현재 최적 파라미터 (DEFAULT_PARAMS가 아님!)
 * @param strategyId 전략 ID (제약조건 조회용)
 * @returns 새 그리드 (빈 배열이면 적용 불가)
 */
export function suggestionsToGrid(
  suggestions: ParamSuggestion[],
  baseParams: Record<string, number>,
  strategyId?: string,
): Array<Record<string, number>> {
  if (suggestions.length === 0) return []

  const paramRanges: Array<{ key: string; values: number[] }> = []

  for (const sug of suggestions) {
    const [rawMin, rawMax] = sug.suggestedRange

    // 범위 방어: NaN, Infinity, 역전된 범위
    const min = Number.isFinite(rawMin) ? rawMin : 0
    const max = Number.isFinite(rawMax) ? rawMax : 0
    if (min >= max) continue

    // 정수/실수 판단: baseParams의 기존 값이 정수면 정수
    const baseVal = baseParams[sug.key]
    const isInteger = baseVal != null ? Number.isInteger(baseVal) : Number.isInteger(min)

    // 정수일 때: 가능한 값 개수 제한, 실수일 때: 5단계
    const maxSteps = isInteger ? Math.min(7, Math.floor(max - min) + 1) : 5
    const steps = Math.max(2, maxSteps)
    const values: number[] = []

    for (let i = 0; i < steps; i++) {
      const ratio = steps > 1 ? i / (steps - 1) : 0
      const val = min + (max - min) * ratio
      const rounded = isInteger ? Math.round(val) : Math.round(val * 10) / 10
      if (Number.isFinite(rounded)) {
        values.push(rounded)
      }
    }

    const unique = [...new Set(values)]
    if (unique.length > 0) {
      paramRanges.push({ key: sug.key, values: unique })
    }
  }

  if (paramRanges.length === 0) return []

  // 카르테시안 프로덕트 (baseParams를 베이스로)
  let combos: Array<Record<string, number>> = [{ ...baseParams }]

  for (const range of paramRanges) {
    const expanded: Array<Record<string, number>> = []
    for (const combo of combos) {
      for (const value of range.values) {
        expanded.push({ ...combo, [range.key]: value })
      }
    }
    combos = expanded
  }

  // 전략별 제약조건 적용
  if (strategyId) {
    const constraints = getConstraints(strategyId)
    if (constraints) {
      combos = combos.filter(constraints)
    }
  }

  if (combos.length === 0) return []

  // 최대 50개로 제한
  const maxSize = 50
  if (combos.length > maxSize) {
    const step = combos.length / maxSize
    const sampled: Array<Record<string, number>> = []
    for (let i = 0; i < maxSize; i++) {
      sampled.push(combos[Math.floor(i * step)])
    }
    combos = sampled
  }

  return combos
}

/**
 * 이전 파이프라인의 최적 OOS EV 조회 (성과 급락 판단용)
 */
export async function getPreviousBestEv(strategyUuid: string): Promise<number | undefined> {
  const { data } = await supabase
    .from('research_runs')
    .select('id')
    .eq('strategy_id', strategyUuid)
    .eq('status', 'completed')
    .eq('pipeline_mode', 'pipeline')
    .order('ended_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return undefined

  const { data: metrics } = await supabase
    .from('research_run_metrics')
    .select('expected_value')
    .eq('research_run_id', data.id)
    .single()

  return metrics?.expected_value ?? undefined
}

// ─── 프롬프트 빌더 ───────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 암호화폐 자동매매 시스템의 연구 분석 보조자입니다.
백테스트 결과와 검증 데이터를 분석하여 객관적인 평가를 제공합니다.

역할:
- 전략 성과의 강점/약점을 구조적으로 분석
- 과최적화 위험을 경고
- 파라미터 조정 범위를 제안
- 검증 구간 간 일관성을 평가

하지 않는 것:
- 실전 배치를 직접 승인하거나 권고하지 않음
- 백테스트 결과를 무시한 판단을 하지 않음
- 감정적이거나 과장된 표현을 사용하지 않음

응답 형식:
반드시 아래 JSON 구조로만 응답하세요. JSON 외의 텍스트는 포함하지 마세요.

{
  "summary": "1~3줄 요약",
  "strengths": ["강점1", "강점2"],
  "weaknesses": ["약점1", "약점2"],
  "risks": ["위험1"],
  "paramSuggestions": [
    {
      "key": "파라미터명",
      "currentRange": [최솟값, 최댓값],
      "suggestedRange": [제안_최솟값, 제안_최댓값],
      "reason": "조정 사유"
    }
  ],
  "recommendation": "권장 다음 행동",
  "confidence": 0.0~1.0
}`

function buildPrompt(input: ReviewInput): { system: string; userMessage: string } {
  const { metrics, segments, comparisonCandidates, triggerReason, reviewType, failureReasons } = input

  const parts: string[] = []

  parts.push(`## 리뷰 요청 사유: ${TRIGGER_LABELS[triggerReason]}`)
  parts.push(`리뷰 유형: ${REVIEW_TYPE_LABELS[reviewType]}`)
  parts.push('')

  // 실패 분석인 경우 실패 사유 제공
  if (failureReasons && failureReasons.length > 0) {
    parts.push('### 검증 실패 사유')
    for (const reason of failureReasons) {
      parts.push(`- ${reason}`)
    }
    parts.push('')
    parts.push('위 사유들을 분석하여 어떤 파라미터를 조정하면 검증을 통과할 수 있을지 제안해주세요.')
    parts.push('paramSuggestions에 구체적인 범위를 반드시 포함해주세요.')
    parts.push('')
  }

  parts.push(`## 전략: ${metrics.strategyName}`)
  parts.push(`파라미터: ${JSON.stringify(metrics.paramSet)}`)
  parts.push('')
  parts.push('### 전체 성과')
  parts.push(`| 지표 | 값 |`)
  parts.push(`|------|------|`)
  parts.push(`| 총수익 | ${metrics.totalReturn}% |`)
  parts.push(`| MDD | ${metrics.maxDrawdown}% |`)
  parts.push(`| Sharpe | ${metrics.sharpe} |`)
  parts.push(`| 승률 | ${metrics.winRate}% |`)
  parts.push(`| 기대값(EV) | ${metrics.expectedValue} |`)
  parts.push(`| Profit Factor | ${metrics.profitFactor} |`)
  parts.push(`| 거래 수 | ${metrics.tradeCount}건 |`)
  parts.push(`| 평균 보유 | ${metrics.avgHoldHours}시간 |`)
  parts.push(`| 비용 비중 | ${metrics.costRatio}% |`)

  if (segments && segments.length > 0) {
    parts.push('')
    parts.push('### 검증 구간별 결과')
    parts.push(`| 구간 | 역할 | 수익 | MDD | EV | 승률 | 거래 | Sharpe |`)
    parts.push(`|------|------|------|-----|-----|------|------|--------|`)
    for (const seg of segments) {
      parts.push(
        `| ${seg.name} | ${seg.role} | ${seg.totalReturn}% | ${seg.maxDrawdown}% | ` +
        `${seg.expectedValue} | ${seg.winRate}% | ${seg.tradeCount} | ${seg.sharpe} |`
      )
    }
  }

  if (comparisonCandidates && comparisonCandidates.length > 0) {
    parts.push('')
    parts.push('### 비교 후보')
    parts.push(`| 전략 | OOS EV | WF 중앙값 EV | Sharpe | MDD | 거래 |`)
    parts.push(`|------|--------|-------------|--------|-----|------|`)
    for (const c of comparisonCandidates) {
      parts.push(
        `| ${c.strategyName} ${JSON.stringify(c.paramSet)} | ${c.oosEv.toFixed(2)} | ` +
        `${c.wfMedianEv.toFixed(2)} | ${c.sharpe} | ${c.maxDrawdown}% | ${c.tradeCount} |`
      )
    }
  }

  return { system: SYSTEM_PROMPT, userMessage: parts.join('\n') }
}

const TRIGGER_LABELS: Record<TriggerReason, string> = {
  ambiguous_ranking: '상위 후보 간 비교 판단이 애매함',
  performance_collapse: '특정 전략군 성과가 급락',
  param_re_explore: '파라미터 재탐색 범위 조정 필요',
  high_ev_high_mdd: '기대값은 양수이지만 MDD가 과도함',
  validation_wipeout: '모든 후보가 검증에서 탈락 — 파라미터 재설계 필요',
  manual_request: '운영자 수동 요청',
}

const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  research_analysis: '연구 결과 분석',
  param_proposal: '파라미터 범위 재제안',
  strategy_comparison: '전략 간 비교 분석',
  failure_analysis: '검증 실패 분석 + 파라미터 재제안',
}

// ─── 응답 파싱 ────────────────────────────────────────────────

function parseAnalysis(content: string): AiAnalysis | null {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ??
                      content.match(/(\{[\s\S]*\})/)

    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[1])

    return {
      strengths: asStringArray(parsed.strengths),
      weaknesses: asStringArray(parsed.weaknesses),
      risks: asStringArray(parsed.risks),
      paramSuggestions: parseParamSuggestions(parsed.paramSuggestions),
      recommendation: String(parsed.recommendation ?? ''),
      confidence: clamp(Number(parsed.confidence ?? 0.5), 0, 1),
    }
  } catch {
    return null
  }
}

function extractSummary(content: string): string {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ??
                      content.match(/(\{[\s\S]*\})/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      if (parsed.summary) return String(parsed.summary)
    }
  } catch {
    // 파싱 실패 시 원본 텍스트 앞부분 사용
  }
  return content.slice(0, 500)
}

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

function parseParamSuggestions(val: unknown): ParamSuggestion[] | undefined {
  if (!Array.isArray(val) || val.length === 0) return undefined

  return val
    .filter((item) => item && typeof item === 'object' && 'key' in item)
    .map((item) => ({
      key: String(item.key),
      currentRange: asTuple(item.currentRange),
      suggestedRange: asTuple(item.suggestedRange),
      reason: String(item.reason ?? ''),
    }))
}

function asTuple(val: unknown): [number, number] {
  if (Array.isArray(val) && val.length >= 2) {
    return [Number(val[0]), Number(val[1])]
  }
  return [0, 0]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ─── DB 업데이트 헬퍼 ─────────────────────────────────────────

async function updateReview(
  reviewId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('ai_reviews')
    .update(fields)
    .eq('id', reviewId)

  if (error) {
    console.error('[AI리뷰] DB 업데이트 실패:', error.message)
  }
}

function emptyResult(status: ReviewStatus): ReviewResult {
  return {
    reviewId: '',
    status,
    summary: null,
    analysis: null,
    modelId: null,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  }
}
