/**
 * AI 클라이언트 — Anthropic / OpenAI 선택 사용
 *
 * AI_PROVIDER 환경변수로 벤더를 선택한다.
 * 두 SDK 모두 동일한 인터페이스(AiRequest → AiResponse)로 추상화.
 *
 * 환경변수:
 *   AI_PROVIDER        — 'anthropic' | 'openai' (기본: anthropic)
 *   ANTHROPIC_API_KEY  — Anthropic 사용 시 필수
 *   OPENAI_API_KEY     — OpenAI 사용 시 필수
 *   AI_MODEL           — 모델 ID 직접 지정 (선택)
 *   AI_MAX_TOKENS      — 최대 출력 토큰 (기본 2048)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// ─── 공통 인터페이스 ──────────────────────────────────────────

export interface AiRequest {
  system: string
  userMessage: string
  maxTokens?: number
  /** 타임아웃 (ms). 기본 60초 */
  timeoutMs?: number
}

export interface AiResponse {
  content: string
  provider: 'anthropic' | 'openai'
  modelId: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

type Provider = 'anthropic' | 'openai'

// ─── 기본 모델 ────────────────────────────────────────────────

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
}

const DEFAULT_MAX_TOKENS = 2048
const DEFAULT_TIMEOUT_MS = 60_000

// ─── 벤더별 클라이언트 ────────────────────────────────────────

let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null
let resolvedProvider: Provider | null = null
let initialized = false

function resolveProvider(): Provider | null {
  if (initialized) return resolvedProvider
  initialized = true

  const explicit = process.env.AI_PROVIDER as Provider | undefined

  if (explicit === 'openai' || (!explicit && process.env.OPENAI_API_KEY)) {
    if (!process.env.OPENAI_API_KEY) {
      console.log('[AI] AI_PROVIDER=openai인데 OPENAI_API_KEY 미설정 — AI 비활성화')
      return null
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    resolvedProvider = 'openai'
    console.log('[AI] OpenAI 클라이언트 초기화 완료')
    return resolvedProvider
  }

  if (explicit === 'anthropic' || (!explicit && process.env.ANTHROPIC_API_KEY)) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('[AI] AI_PROVIDER=anthropic인데 ANTHROPIC_API_KEY 미설정 — AI 비활성화')
      return null
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    resolvedProvider = 'anthropic'
    console.log('[AI] Anthropic 클라이언트 초기화 완료')
    return resolvedProvider
  }

  console.log('[AI] API 키 미설정 — AI 리뷰 비활성화')
  return null
}

/**
 * AI 리뷰 활성화 여부
 */
export function isAiEnabled(): boolean {
  return resolveProvider() !== null
}

/**
 * 현재 AI 제공자 반환 (비활성화 시 null)
 */
export function getAiProvider(): Provider | null {
  return resolveProvider()
}

/**
 * AI 호출 — 벤더에 관계없이 동일 인터페이스
 *
 * @returns 응답 또는 null (비활성화/오류 시)
 */
export async function callAi(request: AiRequest): Promise<AiResponse | null> {
  const provider = resolveProvider()
  if (!provider) return null

  const timeoutMs = request.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)

  const callFn = provider === 'anthropic' ? callAnthropic : callOpenAI

  // 타임아웃 레이스
  const result = await Promise.race([
    callFn(request),
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.error(`[AI] 호출 타임아웃 (${timeoutMs}ms)`)
        resolve(null)
      }, timeoutMs)
    }),
  ])

  return result
}

// ─── Anthropic 구현 ───────────────────────────────────────────

async function callAnthropic(request: AiRequest): Promise<AiResponse | null> {
  if (!anthropicClient) return null

  const model = process.env.AI_MODEL ?? DEFAULT_MODELS.anthropic
  const maxTokens = request.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? DEFAULT_MAX_TOKENS)
  const startMs = Date.now()

  try {
    const response = await anthropicClient.messages.create({
      model,
      max_tokens: maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.userMessage }],
    })

    const latencyMs = Date.now() - startMs
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    return {
      content: textContent,
      provider: 'anthropic',
      modelId: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs,
    }
  } catch (err) {
    console.error('[AI] Anthropic 호출 실패:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── OpenAI 구현 ─────────────────────────────────────────────

async function callOpenAI(request: AiRequest): Promise<AiResponse | null> {
  if (!openaiClient) return null

  const model = process.env.AI_MODEL ?? DEFAULT_MODELS.openai
  const maxTokens = request.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? DEFAULT_MAX_TOKENS)
  const startMs = Date.now()

  try {
    const response = await openaiClient.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.userMessage },
      ],
    })

    const latencyMs = Date.now() - startMs
    const choice = response.choices[0]
    const content = choice?.message?.content ?? ''

    return {
      content,
      provider: 'openai',
      modelId: response.model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      latencyMs,
    }
  } catch (err) {
    console.error('[AI] OpenAI 호출 실패:', err instanceof Error ? err.message : err)
    return null
  }
}
