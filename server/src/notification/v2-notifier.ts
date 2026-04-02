/**
 * V2 알림 시스템 (Phase 6)
 *
 * 오케스트레이터 판단, 리스크 이벤트, 일일 리포트 등
 * 모든 V2 알림의 중앙 허브.
 *
 * 알림 흐름:
 *   이벤트 발생 → notify() → DB 저장 + 채널 디스패치 (텔레그램/디스코드)
 *
 * 외부 호출은 fetch()만 사용 (추가 라이브러리 없음)
 */

import { supabase } from '../services/database.js'
import type {
  NotificationPriority,
  NotificationChannel,
  RegimeState,
  DecisionType,
  RiskEventType,
  OrchestratorDecision,
} from '../core/types.js'

// ─── 상수 ──────────────────────────────────────────────────────

const TELEGRAM_API = 'https://api.telegram.org'

/** 우선순위별 이모지 접두사 (텔레그램/디스코드 공용) */
const PRIORITY_PREFIX: Record<NotificationPriority, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

/** 레짐 한글 라벨 */
const REGIME_LABEL: Record<RegimeState, string> = {
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  neutral: 'Neutral',
}

/** 판단 유형 한글 라벨 */
const DECISION_LABEL: Record<DecisionType, string> = {
  strategy_assign: '전략 배치',
  strategy_switch: '전략 교체',
  strategy_retire: '전략 퇴역',
  go_flat: '전량 청산',
  rebalance: '자본 재배분',
}

// ─── 알림 파라미터 타입 ─────────────────────────────────────────

interface NotifyParams {
  eventType: string
  priority: NotificationPriority
  channel: NotificationChannel
  targetRef?: string
  messageSummary: string
  messageDetail?: string
}

// ─── 핵심 알림 함수 ─────────────────────────────────────────────

/**
 * 알림 저장 및 채널 디스패치
 *
 * 1. v2_notifications 테이블에 기록
 * 2. 지정된 채널로 메시지 전송 (논블로킹)
 */
export async function notify(params: NotifyParams): Promise<void> {
  const {
    eventType,
    priority,
    channel,
    targetRef,
    messageSummary,
    messageDetail,
  } = params

  // DB 저장
  try {
    const { error } = await supabase.from('v2_notifications').insert({
      event_type: eventType,
      priority,
      channel,
      target_ref: targetRef ?? null,
      message_summary: messageSummary,
      message_detail: messageDetail ?? null,
    })

    if (error) {
      console.error('[알림] DB 저장 실패:', error.message)
    }
  } catch (err) {
    console.error('[알림] DB 저장 오류:', err)
  }

  // 채널 디스패치 (논블로킹 — 에러 발생해도 throw 안 함)
  switch (channel) {
    case 'telegram':
      await sendTelegram(messageSummary, messageDetail)
      break
    case 'discord':
      await sendDiscord(messageSummary, messageDetail)
      break
    case 'in_app':
      // in_app은 DB 저장으로 완료 — 프론트엔드가 폴링
      break
  }
}

// ─── 텔레그램 전송 ──────────────────────────────────────────────

/**
 * 텔레그램 메시지 전송
 *
 * 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * 논블로킹 — 실패 시 로그만 남기고 throw하지 않음
 */
async function sendTelegram(summary: string, detail?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.warn('[알림-텔레그램] 환경변수 미설정 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)')
    return
  }

  // HTML 형식 메시지 조합
  const text = detail
    ? `<b>${summary}</b>\n\n${detail}`
    : `<b>${summary}</b>`

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[알림-텔레그램] 전송 실패: ${res.status} ${body}`)
    } else {
      console.log('[알림-텔레그램] 전송 완료')
    }
  } catch (err) {
    console.error('[알림-텔레그램] 전송 오류:', err)
  }
}

// ─── 디스코드 전송 ──────────────────────────────────────────────

/**
 * 디스코드 웹훅 전송
 *
 * 환경변수: DISCORD_WEBHOOK_URL
 * 논블로킹 — 실패 시 로그만 남기고 throw하지 않음
 */
async function sendDiscord(summary: string, detail?: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[알림-디스코드] 환경변수 미설정 (DISCORD_WEBHOOK_URL)')
    return
  }

  // 디스코드 Embed 형식
  const content = detail
    ? `**${summary}**\n${detail}`
    : `**${summary}**`

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'TechPulse V2',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[알림-디스코드] 전송 실패: ${res.status} ${body}`)
    } else {
      console.log('[알림-디스코드] 전송 완료')
    }
  } catch (err) {
    console.error('[알림-디스코드] 전송 오류:', err)
  }
}

// ─── 오케스트레이터 판단 알림 ───────────────────────────────────

/**
 * 오케스트레이터 판단 알림
 *
 * 전략 교체/배치/퇴역 등 판단 발생 시 텔레그램으로 알림
 * 형식: "레짐: {regime} | 판단: {decisionType} | {from} → {to} | 이유: {reason}"
 */
export async function notifyOrchestratorDecision(
  decision: OrchestratorDecision
): Promise<void> {
  const regimeLabel = REGIME_LABEL[decision.regime]
  const decisionLabel = DECISION_LABEL[decision.decisionType]
  const from = decision.fromStrategyId ?? '없음'
  const to = decision.toStrategyId ?? '없음'

  const summary = `레짐: ${regimeLabel} | 판단: ${decisionLabel} | ${from} → ${to} | 이유: ${decision.reasonSummary}`

  // 점수 스냅샷을 상세 메시지로 포함
  const scoreEntries = Object.entries(decision.scoreSnapshot)
  const detailLines = scoreEntries.length > 0
    ? scoreEntries.map(([key, val]) => `  ${key}: ${val}`).join('\n')
    : undefined

  await notify({
    eventType: 'orchestrator_decision',
    priority: 'warning',
    channel: 'telegram',
    targetRef: decision.id,
    messageSummary: `${PRIORITY_PREFIX.warning} ${summary}`,
    messageDetail: detailLines
      ? `점수 스냅샷:\n${detailLines}`
      : undefined,
  })
}

// ─── 일일 리포트 ────────────────────────────────────────────────

/**
 * 일일 자동 리포트 (매일 자정 KST 크론)
 *
 * 포함 내용:
 * - 현재 레짐 상태
 * - 활성 전략 및 배분 비율
 * - 오늘 PnL (v2_equity_snapshots)
 * - 주요 이벤트 (전략 교체, 리스크 알림)
 *
 * 텔레그램 + 디스코드 동시 전송
 */
export async function sendDailyReport(): Promise<void> {
  console.log('[알림] 일일 리포트 생성 시작')

  try {
    // 1. 현재 레짐 조회 (가장 최근 스냅샷)
    const { data: regimeRow } = await supabase
      .from('v2_regime_snapshots')
      .select('regime, btc_price, ema200, rsi14, atr_pct')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    const regime = regimeRow
      ? REGIME_LABEL[regimeRow.regime as RegimeState]
      : '알 수 없음'
    const btcPrice = regimeRow
      ? Number(regimeRow.btc_price).toLocaleString('ko-KR')
      : '-'

    // 2. 활성 슬롯 및 전략 조회
    const { data: slots } = await supabase
      .from('v2_orchestrator_slots')
      .select(`
        asset_key,
        allocation_pct,
        status,
        v2_strategies(strategy_id, name)
      `)
      .eq('status', 'active')

    const strategyLines = (slots ?? []).map((s) => {
      const strategyData = s.v2_strategies as unknown as { strategy_id: string; name: string } | { strategy_id: string; name: string }[] | null
      const strategy = Array.isArray(strategyData) ? strategyData[0] : strategyData
      const name = strategy?.name ?? strategy?.strategy_id ?? '미배정'
      return `  ${s.asset_key} — ${name} (${s.allocation_pct}%)`
    })

    // 3. 오늘 PnL 계산 (v2_equity_snapshots에서 오늘 첫/마지막 비교)
    const todayStart = getTodayStartKST()
    const { data: equityRows } = await supabase
      .from('v2_equity_snapshots')
      .select('total_equity, unrealized_pnl, realized_pnl, recorded_at')
      .eq('source', 'live')
      .gte('recorded_at', todayStart)
      .order('recorded_at', { ascending: true })

    let pnlLine = '  데이터 없음'
    if (equityRows && equityRows.length >= 2) {
      const first = equityRows[0]
      const last = equityRows[equityRows.length - 1]
      const equityChange = Number(last.total_equity) - Number(first.total_equity)
      const pnlPct = Number(first.total_equity) > 0
        ? ((equityChange / Number(first.total_equity)) * 100).toFixed(2)
        : '0.00'
      const sign = equityChange >= 0 ? '+' : ''
      pnlLine = `  자산변동: ${sign}${equityChange.toLocaleString('ko-KR')} (${sign}${pnlPct}%)`
      pnlLine += `\n  실현PnL: ${Number(last.realized_pnl).toLocaleString('ko-KR')}`
      pnlLine += `\n  미실현PnL: ${Number(last.unrealized_pnl).toLocaleString('ko-KR')}`
    } else if (equityRows && equityRows.length === 1) {
      const row = equityRows[0]
      pnlLine = `  현재 자산: ${Number(row.total_equity).toLocaleString('ko-KR')}`
    }

    // 4. 오늘 주요 이벤트 (판단 + 리스크)
    const { data: decisions } = await supabase
      .from('v2_orchestrator_decisions')
      .select('decision_type, reason_summary, created_at')
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false })
      .limit(5)

    const decisionLines = (decisions ?? []).map((d) => {
      const label = DECISION_LABEL[d.decision_type as DecisionType] ?? d.decision_type
      const time = new Date(d.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      return `  [${time}] ${label}: ${d.reason_summary}`
    })

    const { data: riskEvents } = await supabase
      .from('v2_risk_events')
      .select('event_type, severity, details, created_at')
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false })
      .limit(5)

    const riskLines = (riskEvents ?? []).map((r) => {
      const time = new Date(r.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      return `  [${time}] ${PRIORITY_PREFIX[r.severity as NotificationPriority]} ${r.event_type}`
    })

    // 5. 리포트 메시지 조합
    const dateStr = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    const summary = `TechPulse V2 일일 리포트 — ${dateStr}`

    const detailSections = [
      `[레짐] ${regime} | BTC ${btcPrice}`,
      '',
      '[활성 전략]',
      strategyLines.length > 0 ? strategyLines.join('\n') : '  없음',
      '',
      '[오늘 PnL]',
      pnlLine,
      '',
      '[주요 판단]',
      decisionLines.length > 0 ? decisionLines.join('\n') : '  없음',
      '',
      '[리스크 이벤트]',
      riskLines.length > 0 ? riskLines.join('\n') : '  없음',
    ]

    const detail = detailSections.join('\n')

    // 텔레그램 + 디스코드 동시 전송
    await Promise.all([
      notify({
        eventType: 'daily_report',
        priority: 'info',
        channel: 'telegram',
        messageSummary: `${PRIORITY_PREFIX.info} ${summary}`,
        messageDetail: detail,
      }),
      // 디스코드는 별도 DB 기록 없이 직접 전송 (중복 방지)
      sendDiscord(`${PRIORITY_PREFIX.info} ${summary}`, detail),
    ])

    console.log('[알림] 일일 리포트 전송 완료')
  } catch (err) {
    console.error('[알림] 일일 리포트 생성 오류:', err)
  }
}

// ─── 리스크 이벤트 알림 ─────────────────────────────────────────

/** 리스크 이벤트 입력 타입 */
interface RiskEventInput {
  eventType: RiskEventType
  details: Record<string, unknown>
}

/** 리스크 이벤트 → 알림 우선순위 매핑 */
const RISK_PRIORITY: Record<RiskEventType, NotificationPriority> = {
  circuit_breaker: 'critical',
  daily_loss_limit: 'critical',
  drawdown_limit: 'warning',
  regime_change: 'warning',
  position_divergence: 'warning',
}

/** 리스크 이벤트 한글 라벨 */
const RISK_LABEL: Record<RiskEventType, string> = {
  circuit_breaker: '서킷 브레이커 발동',
  daily_loss_limit: '일일 손실 한도 도달',
  drawdown_limit: 'MDD 한도 도달',
  regime_change: '레짐 변경',
  position_divergence: '포지션 불일치 감지',
}

/**
 * 리스크 이벤트 알림
 *
 * circuit_breaker, daily_loss_limit → critical 우선순위
 * 나머지 → warning 우선순위
 *
 * 텔레그램으로 즉시 전송
 */
export async function notifyRiskEvent(event: RiskEventInput): Promise<void> {
  const priority = RISK_PRIORITY[event.eventType]
  const label = RISK_LABEL[event.eventType]
  const prefix = PRIORITY_PREFIX[priority]

  const summary = `${prefix} [리스크] ${label}`

  // 상세 정보 포맷팅
  const detailEntries = Object.entries(event.details)
  const detail = detailEntries.length > 0
    ? detailEntries.map(([key, val]) => `  ${key}: ${String(val)}`).join('\n')
    : undefined

  await notify({
    eventType: `risk_${event.eventType}`,
    priority,
    channel: 'telegram',
    messageSummary: summary,
    messageDetail: detail,
  })
}

// ─── 유틸리티 ───────────────────────────────────────────────────

/**
 * 오늘 자정 KST (UTC+9) ISO 문자열 반환
 * 일일 리포트에서 "오늘" 범위 필터에 사용
 */
function getTodayStartKST(): string {
  const now = new Date()
  // KST = UTC + 9시간
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)
  // KST 기준 자정을 UTC로 변환
  const kstMidnight = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
  )
  const utcMidnight = new Date(kstMidnight.getTime() - kstOffset)
  return utcMidnight.toISOString()
}
