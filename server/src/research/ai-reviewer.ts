/**
 * AI 연구 리뷰 엔진
 *
 * PRD §15 — AI는 "보조 분석자"로서:
 *   - 파라미터 탐색 범위 재제안
 *   - 전략군 제외/우선순위 변경 제안
 *   - 결과 요약과 해석
 *   - 재탐색 필요 전략군 추천
 *
 * AI가 하지 않는 것:
 *   - 실전 배치 자동 승인
 *   - 백테스트 결과 무시 승격
 *   - 근거 없는 전략 생성
 *
 * 이벤트 기반: 조건 충족 시에만 호출하여 비용을 제한한다.
 */

import { callAi, isAiEnabled, type AiResponse } from '../services/ai-client.js'
import { supabase } from '../services/database.js'

// ─── 타입 ─────────────────────────────────────────────────────

export type TriggerReason =
  | 'ambiguous_ranking'
  | 'performance_collapse'
  | 'param_re_explore'
  | 'high_ev_high_mdd'
  | 'manual_request'

export type ReviewType =
  | 'research_analysis'
  | 'param_proposal'
  | 'strategy_comparison'

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
}

interface ReviewMetrics {
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

interface SegmentSummary {
  name: string
  role: string
  totalReturn: number
  maxDrawdown: number
  expectedValue: number
  winRate: number
  tradeCount: number
  sharpe: number
}

interface CandidateSummary {
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

// ─── 트리거 조건 평가 ─────────────────────────────────────────

/** 자동 트리거 조건 임계값 */
const TRIGGER_THRESHOLDS = {
  /** EV 양수인데 MDD가 이 값 이상이면 리뷰 요청 */
  highMddThreshold: 15,
  /** 상위 후보 간 OOS EV 차이가 이 비율 이내면 "애매함" 판정 */
  ambiguousEvRatio: 0.15,
  /** 최소 비교 후보 수 (이 이상이어야 ambiguous_ranking 트리거) */
  minAmbiguousCandidates: 3,
}

/**
 * 파이프라인 결과를 보고 AI 리뷰가 필요한지 판단
 *
 * @returns 트리거 사유 또는 null (리뷰 불필요)
 */
export function evaluateTrigger(
  candidates: CandidateSummary[],
  bestMetrics?: ReviewMetrics,
): TriggerReason | null {
  // 1. EV 양수 + MDD 과도
  if (bestMetrics && bestMetrics.expectedValue > 0 && bestMetrics.maxDrawdown > TRIGGER_THRESHOLDS.highMddThreshold) {
    return 'high_ev_high_mdd'
  }

  // 2. 상위 후보 간 비교가 애매
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

// ─── 리뷰 실행 ────────────────────────────────────────────────

/**
 * AI 리뷰 실행
 *
 * 1. DB에 pending 레코드 생성
 * 2. 프롬프트 구성
 * 3. AI 호출
 * 4. 결과 파싱 + DB 업데이트
 *
 * API 키가 없으면 status='skipped'으로 저장 후 반환.
 */
export async function executeReview(input: ReviewInput): Promise<ReviewResult> {
  // 1. DB 레코드 생성
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

  // 2. 프롬프트 구성
  await updateReview(reviewId, { status: 'processing' })
  const { system, userMessage } = buildPrompt(input)

  // 3. AI 호출
  const aiResponse = await callAi({ system, userMessage })

  if (!aiResponse) {
    await updateReview(reviewId, {
      status: 'failed',
      error_message: 'AI 호출 실패',
    })
    return { ...emptyResult('failed'), reviewId }
  }

  // 4. 결과 파싱
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
  const { metrics, segments, comparisonCandidates, triggerReason, reviewType } = input

  const parts: string[] = []

  // 트리거 사유
  parts.push(`## 리뷰 요청 사유: ${TRIGGER_LABELS[triggerReason]}`)
  parts.push(`리뷰 유형: ${REVIEW_TYPE_LABELS[reviewType]}`)
  parts.push('')

  // 메인 메트릭
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

  // 검증 구간
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

  // 비교 후보
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
  manual_request: '운영자 수동 요청',
}

const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  research_analysis: '연구 결과 분석',
  param_proposal: '파라미터 범위 재제안',
  strategy_comparison: '전략 간 비교 분석',
}

// ─── 응답 파싱 ────────────────────────────────────────────────

/**
 * AI 응답에서 JSON을 추출하고 AiAnalysis로 파싱
 *
 * JSON 파싱 실패 시에도 원본 텍스트를 summary로 저장하여
 * 정보를 유실하지 않는다.
 */
function parseAnalysis(content: string): AiAnalysis | null {
  try {
    // JSON 블록 추출 (```json ... ``` 또는 naked JSON)
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
