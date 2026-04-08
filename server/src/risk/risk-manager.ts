/**
 * V2 리스크 매니저 — Phase 7
 *
 * 실전 매매의 리스크를 실시간 모니터링한다.
 * 크론에서 주기적으로 runRiskCheck()를 호출하여
 * 일일 손실 한도와 서킷 브레이커를 확인한다.
 *
 * 트리거 시:
 * - 일일 손실 한도 → go_flat (당일 전량 청산, 다음날 재개)
 * - 서킷 브레이커 → 모든 포지션 즉시 청산 + critical 알림
 *
 * 기본값 (환경변수로 오버라이드 가능):
 * - DAILY_LOSS_LIMIT_PCT: 3%
 * - CIRCUIT_BREAKER_PCT: 10%
 */

import { supabase } from '../services/database.js'
import { fetchBalance, fetchOpenPositions } from '../exchange/okx-client.js'
import { closeAllPositions } from '../execution/execution-engine.js'
import type { RegimeState, DecisionType, DecisionStatus } from '../core/types.js'

// ─── 상수 ─────────────────────────────────────────────────────

/** 기본 일일 손실 한도 (%) */
const DEFAULT_DAILY_LOSS_LIMIT_PCT = 3

/** 기본 서킷 브레이커 한도 (%) */
const DEFAULT_CIRCUIT_BREAKER_PCT = 10

// ─── 리스크 파라미터 (환경변수 우선, DB 폴백) ────────────────

interface RiskParams {
  dailyLossLimitPct: number
  circuitBreakerPct: number
}

/** 캐시된 DB 리스크 파라미터 */
let cachedDbParams: RiskParams | null = null
/** 캐시 만료 시각 (5분 TTL) */
let cacheExpiresAt = 0
/** DB 캐시 TTL (ms) */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * 리스크 파라미터 로드: 환경변수 우선, DB 폴백
 *
 * 환경변수가 설정돼 있으면 DB 조회 없이 즉시 반환.
 * 환경변수가 없는 항목만 user_settings 테이블에서 가져온다.
 * DB 결과는 5분간 캐시하여 매 리스크 체크마다 쿼리하지 않는다.
 */
async function loadRiskParams(): Promise<RiskParams> {
  // 1. 환경변수 확인
  const envDaily = process.env.DAILY_LOSS_LIMIT_PCT
    ? parseFloat(process.env.DAILY_LOSS_LIMIT_PCT)
    : null
  const envCb = process.env.CIRCUIT_BREAKER_PCT
    ? parseFloat(process.env.CIRCUIT_BREAKER_PCT)
    : null

  // 유효하지 않은 값은 null 처리
  const fromEnv = {
    dailyLossLimitPct: (envDaily != null && !isNaN(envDaily) && envDaily > 0) ? envDaily : null,
    circuitBreakerPct: (envCb != null && !isNaN(envCb) && envCb > 0) ? envCb : null,
  }

  // 환경변수가 모두 설정돼 있으면 DB 조회 불필요
  if (fromEnv.dailyLossLimitPct != null && fromEnv.circuitBreakerPct != null) {
    return {
      dailyLossLimitPct: fromEnv.dailyLossLimitPct,
      circuitBreakerPct: fromEnv.circuitBreakerPct,
    }
  }

  // 2. 캐시가 유효하면 재사용
  const now = Date.now()
  if (cachedDbParams && now < cacheExpiresAt) {
    return {
      dailyLossLimitPct: fromEnv.dailyLossLimitPct ?? cachedDbParams.dailyLossLimitPct,
      circuitBreakerPct: fromEnv.circuitBreakerPct ?? cachedDbParams.circuitBreakerPct,
    }
  }

  // 3. DB 폴백 — user_settings에서 리스크 설정 조회
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('daily_max_loss_pct, mdd_stop_pct')
      .limit(1)
      .single()

    if (!error && data) {
      cachedDbParams = {
        dailyLossLimitPct: Number(data.daily_max_loss_pct) || DEFAULT_DAILY_LOSS_LIMIT_PCT,
        circuitBreakerPct: Number(data.mdd_stop_pct) || DEFAULT_CIRCUIT_BREAKER_PCT,
      }
      cacheExpiresAt = now + CACHE_TTL_MS
      console.log(
        `[V2리스크] DB 리스크 파라미터 로드: 일일한도=${cachedDbParams.dailyLossLimitPct}%, ` +
        `서킷브레이커=${cachedDbParams.circuitBreakerPct}%`,
      )
    } else {
      // DB 조회 실패 시 기본값 사용
      if (error) {
        console.warn('[V2리스크] user_settings 조회 실패, 기본값 사용:', error.message)
      }
      cachedDbParams = {
        dailyLossLimitPct: DEFAULT_DAILY_LOSS_LIMIT_PCT,
        circuitBreakerPct: DEFAULT_CIRCUIT_BREAKER_PCT,
      }
      // 실패 시 캐시 TTL을 짧게 (1분) 설정하여 재시도 빈도 확보
      cacheExpiresAt = now + 60_000
    }
  } catch (err) {
    console.error('[V2리스크] user_settings 조회 중 예외:', err)
    cachedDbParams = {
      dailyLossLimitPct: DEFAULT_DAILY_LOSS_LIMIT_PCT,
      circuitBreakerPct: DEFAULT_CIRCUIT_BREAKER_PCT,
    }
    cacheExpiresAt = now + 60_000
  }

  return {
    dailyLossLimitPct: fromEnv.dailyLossLimitPct ?? cachedDbParams.dailyLossLimitPct,
    circuitBreakerPct: fromEnv.circuitBreakerPct ?? cachedDbParams.circuitBreakerPct,
  }
}

/** 캐시 무효화 — 설정 변경 시 외부에서 호출 가능 */
export function invalidateRiskParamsCache(): void {
  cachedDbParams = null
  cacheExpiresAt = 0
  console.log('[V2리스크] 리스크 파라미터 캐시 무효화')
}

// ─── 리스크 체크 메인 ─────────────────────────────────────────

/**
 * 리스크 체크 크론 진입점
 *
 * 일일 손실 한도와 서킷 브레이커를 순차적으로 확인한다.
 * 서킷 브레이커가 먼저 트리거되면 일일 손실 한도는 건너뛴다
 * (어차피 전체 청산이므로).
 */
export async function runRiskCheck(): Promise<void> {
  if (process.env.LIVE_TRADING !== 'true') {
    console.log('[V2리스크] LIVE_TRADING=true가 아님, 스킵')
    return
  }

  console.log('[V2리스크] ═══ 리스크 체크 시작 ═══')

  try {
    // 리스크 파라미터 로드 (환경변수 우선, DB 폴백)
    const params = await loadRiskParams()

    // 서킷 브레이커 먼저 확인 (더 심각한 조건)
    const cbTriggered = await checkCircuitBreaker(params.circuitBreakerPct)

    if (cbTriggered) {
      // 서킷 브레이커 트리거 시 일일 손실 한도 체크 불필요
      console.log('[V2리스크] ═══ 리스크 체크 종료 (서킷 브레이커 트리거) ═══')
      return
    }

    // 일일 손실 한도 확인
    await checkDailyLossLimit(params.dailyLossLimitPct)

    console.log('[V2리스크] ═══ 리스크 체크 종료 ═══')
  } catch (err) {
    console.error('[V2리스크] 리스크 체크 중 오류:', err)
  }
}

// ─── 일일 손실 한도 ───────────────────────────────────────────

/**
 * 일일 실현+미실현 손실 한도 확인
 *
 * 오늘(UTC) 기준:
 *   1. 실현 손실 = 오늘 청산된 live_positions의 realized_pnl 합
 *   2. 미실현 손실 = 현재 오픈 포지션의 unrealized_pnl 합
 *   3. 총 일일 손실 = 실현 + 미실현
 *
 * 한도 초과 시:
 *   - risk_event 생성 (daily_loss_limit, warning)
 *   - go_flat 판단 생성 → 전량 청산
 *   - 알림 기록
 */
export async function checkDailyLossLimit(maxLossPct: number): Promise<boolean> {
  // 계좌 잔고 조회
  let totalEquity: number
  try {
    const balance = await fetchBalance()
    totalEquity = balance.total
  } catch (err) {
    console.error('[V2리스크] 잔고 조회 실패:', err)
    return false
  }

  if (totalEquity <= 0) {
    console.warn('[V2리스크] 잔고가 0 이하, 손실 체크 불가')
    return false
  }

  // 오늘(UTC) 시작 시각
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // 1. 오늘 실현 손실 합산 (청산된 포지션)
  const { data: closedPositions, error: closedErr } = await supabase
    .from('live_positions')
    .select('realized_pnl')
    .eq('status', 'closed')
    .gte('exit_time', todayStart.toISOString())

  if (closedErr) {
    console.error('[V2리스크] 청산 포지션 조회 실패:', closedErr.message)
    return false
  }

  const realizedLoss = (closedPositions ?? []).reduce((sum, pos) => {
    const pnl = Number(pos.realized_pnl ?? 0)
    return sum + Math.min(pnl, 0) // 손실만 합산 (음수)
  }, 0)

  // 2. 현재 오픈 포지션의 미실현 손실 합산
  const { data: openPositions, error: openErr } = await supabase
    .from('live_positions')
    .select('unrealized_pnl')
    .eq('status', 'open')

  if (openErr) {
    console.error('[V2리스크] 오픈 포지션 조회 실패:', openErr.message)
    return false
  }

  const unrealizedLoss = (openPositions ?? []).reduce((sum, pos) => {
    const pnl = Number(pos.unrealized_pnl ?? 0)
    return sum + Math.min(pnl, 0) // 손실만 합산 (음수)
  }, 0)

  // 3. 총 일일 손실률 계산
  const totalLoss = realizedLoss + unrealizedLoss
  const lossPct = Math.abs(totalLoss) / totalEquity * 100

  console.log(
    `[V2리스크] 일일 손실: 실현=${realizedLoss.toFixed(2)}, 미실현=${unrealizedLoss.toFixed(2)}, ` +
    `합계=${totalLoss.toFixed(2)} (${lossPct.toFixed(2)}% / 한도 ${maxLossPct}%)`,
  )

  // 한도 초과 확인
  if (lossPct >= maxLossPct) {
    console.warn(`[V2리스크] 일일 손실 한도 초과: ${lossPct.toFixed(2)}% >= ${maxLossPct}%`)

    // 리스크 이벤트 기록
    await createRiskEvent('daily_loss_limit', 'warning', {
      lossPct: Math.round(lossPct * 100) / 100,
      limitPct: maxLossPct,
      realizedLoss: Math.round(realizedLoss * 100) / 100,
      unrealizedLoss: Math.round(unrealizedLoss * 100) / 100,
      totalEquity: Math.round(totalEquity * 100) / 100,
    })

    // go_flat 판단 생성 및 전량 청산
    await triggerGoFlat(`일일 손실 한도 초과: ${lossPct.toFixed(2)}% >= ${maxLossPct}%`)

    // 알림 기록
    await createNotification(
      'daily_loss_limit',
      'warning',
      `일일 손실 한도 초과`,
      `일일 손실 ${lossPct.toFixed(2)}%로 한도 ${maxLossPct}%를 초과. 전량 청산 실행.`,
    )

    return true
  }

  return false
}

// ─── 서킷 브레이커 ────────────────────────────────────────────

/**
 * 서킷 브레이커 — 총 드로다운 한도 확인
 *
 * 전체 계좌 기준:
 *   1. 피크 에퀴티 조회 (equity_snapshots에서 live 소스 최대값)
 *   2. 현재 에퀴티 = 잔고 + 미실현 PnL
 *   3. 드로다운 = (피크 - 현재) / 피크
 *
 * 한도 초과 시:
 *   - risk_event 생성 (circuit_breaker, critical)
 *   - 모든 포지션 즉시 청산
 *   - critical 알림
 */
export async function checkCircuitBreaker(maxDrawdownPct: number): Promise<boolean> {
  // 현재 잔고 조회
  let totalEquity: number
  try {
    const balance = await fetchBalance()
    totalEquity = balance.total
  } catch (err) {
    console.error('[V2리스크] 잔고 조회 실패:', err)
    return false
  }

  // 미실현 손익 합산
  const { data: openPositions } = await supabase
    .from('live_positions')
    .select('unrealized_pnl')
    .eq('status', 'open')

  const unrealizedPnl = (openPositions ?? []).reduce((sum, pos) => {
    return sum + Number(pos.unrealized_pnl ?? 0)
  }, 0)

  const currentEquity = totalEquity + unrealizedPnl

  // 피크 에퀴티 조회 (live 소스 에퀴티 스냅샷 최대값)
  const { data: peakSnapshot } = await supabase
    .from('equity_snapshots')
    .select('total_equity')
    .eq('source', 'live')
    .order('total_equity', { ascending: false })
    .limit(1)
    .single()

  // 피크가 없으면 현재값을 피크로 간주 (첫 실행)
  const peakEquity = Math.max(
    Number(peakSnapshot?.total_equity ?? 0),
    currentEquity,
  )

  if (peakEquity <= 0) {
    console.warn('[V2리스크] 피크 에퀴티가 0 이하, 서킷 브레이커 체크 불가')
    return false
  }

  // 드로다운 계산
  const drawdownPct = ((peakEquity - currentEquity) / peakEquity) * 100

  console.log(
    `[V2리스크] 서킷 브레이커: 피크=$${peakEquity.toFixed(2)}, 현재=$${currentEquity.toFixed(2)}, ` +
    `드로다운=${drawdownPct.toFixed(2)}% / 한도 ${maxDrawdownPct}%`,
  )

  // 한도 초과 확인
  if (drawdownPct >= maxDrawdownPct) {
    console.error(
      `[V2리스크] 서킷 브레이커 트리거! 드로다운 ${drawdownPct.toFixed(2)}% >= ${maxDrawdownPct}%`,
    )

    // 리스크 이벤트 기록 (critical)
    await createRiskEvent('circuit_breaker', 'critical', {
      drawdownPct: Math.round(drawdownPct * 100) / 100,
      limitPct: maxDrawdownPct,
      peakEquity: Math.round(peakEquity * 100) / 100,
      currentEquity: Math.round(currentEquity * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    })

    // 모든 포지션 즉시 청산
    await closeAllPositions('circuit_breaker')

    // critical 알림
    await createNotification(
      'circuit_breaker',
      'critical',
      `서킷 브레이커 트리거`,
      `드로다운 ${drawdownPct.toFixed(2)}%로 한도 ${maxDrawdownPct}%를 초과. 모든 포지션 긴급 청산 실행.`,
    )

    return true
  }

  return false
}

// ─── 대시보드 API ─────────────────────────────────────────────

/** 서킷 브레이커 상태 캐시 — 거래소 API 호출 비용/지연 절감 */
type CbStatus = { currentLossPct: number; limitPct: number; triggered: boolean }
let cbCache: { data: CbStatus; expiresAt: number } | null = null
const CB_CACHE_TTL = 60_000 // 60초

/** 서킷 브레이커 상태 조회 (대시보드용, 60초 TTL 캐시) */
export async function getCircuitBreakerStatus(): Promise<CbStatus> {
  // 캐시가 유효하면 거래소 호출 없이 즉시 반환
  if (cbCache && Date.now() < cbCache.expiresAt) {
    return cbCache.data
  }

  const params = await loadRiskParams()
  const limitPct = params.circuitBreakerPct

  // 현재 잔고 조회
  let totalEquity = 0
  try {
    const balance = await fetchBalance()
    totalEquity = balance.total
  } catch {
    // 잔고 조회 실패 시 기본값 반환 (캐시하지 않음 — 다음 요청에서 재시도)
    return { currentLossPct: 0, limitPct, triggered: false }
  }

  // 미실현 손익 합산
  const { data: openPositions } = await supabase
    .from('live_positions')
    .select('unrealized_pnl')
    .eq('status', 'open')

  const unrealizedPnl = (openPositions ?? []).reduce((sum, pos) => {
    return sum + Number(pos.unrealized_pnl ?? 0)
  }, 0)

  const currentEquity = totalEquity + unrealizedPnl

  // 피크 에퀴티
  const { data: peakSnapshot } = await supabase
    .from('equity_snapshots')
    .select('total_equity')
    .eq('source', 'live')
    .order('total_equity', { ascending: false })
    .limit(1)
    .single()

  const peakEquity = Math.max(
    Number(peakSnapshot?.total_equity ?? 0),
    currentEquity,
  )

  const currentLossPct = peakEquity > 0
    ? Math.round(((peakEquity - currentEquity) / peakEquity) * 10000) / 100
    : 0

  const triggered = currentLossPct >= limitPct

  const result: CbStatus = { currentLossPct, limitPct, triggered }

  // 성공 시에만 캐시 저장
  cbCache = { data: result, expiresAt: Date.now() + CB_CACHE_TTL }

  return result
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────

/** go_flat 판단 생성 및 실행 */
async function triggerGoFlat(reason: string): Promise<void> {
  // 현재 레짐 조회
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
      reason_summary: reason,
      score_snapshot: {},
    })
    .select('id')
    .single()

  if (decErr || !decision) {
    console.error('[V2리스크] go_flat 판단 생성 실패:', decErr?.message)
    // 판단 생성 실패해도 청산은 시도
    await closeAllPositions('risk_go_flat')
    return
  }

  // 전량 청산 실행
  await closeAllPositions('risk_go_flat')

  // 판단 상태 완료 처리
  await supabase
    .from('orchestrator_decisions')
    .update({
      status: 'executed' satisfies DecisionStatus,
      executed_at: new Date().toISOString(),
    })
    .eq('id', decision.id)
}

/** risk_events에 리스크 이벤트 기록 */
async function createRiskEvent(
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('risk_events')
    .insert({
      event_type: eventType,
      severity,
      details,
    })

  if (error) {
    console.error('[V2리스크] 리스크 이벤트 저장 실패:', error.message)
  }
}

/** notifications에 알림 기록 */
async function createNotification(
  eventType: string,
  priority: 'info' | 'warning' | 'critical',
  summary: string,
  detail: string,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .insert({
      event_type: eventType,
      priority,
      channel: 'in_app',
      message_summary: summary,
      message_detail: detail,
    })

  if (error) {
    console.error('[V2리스크] 알림 저장 실패:', error.message)
  }
}
