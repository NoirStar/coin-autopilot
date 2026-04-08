import type { QueueItem, Approval, RiskAlert, AiAlert } from '@/types/orchestration'
import { AlertTriangle, Clock, ArrowRight, Brain } from 'lucide-react'

interface OperatorQueueProps {
  items: QueueItem[]
  aiAlerts?: AiAlert[]
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDismiss?: (id: string) => void
}

const formatTimeLeft = (expiresAt: string): string => {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return '만료됨'
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}시간 ${mins}분 남음`
  return `${mins}분 남음`
}

const approvalTypeLabels: Record<string, string> = {
  position_entry: '포지션 진입',
  strategy_swap: '전략 교체',
  risk_adjustment: '리스크 조정',
  session_promote: '세션 승격',
}

const triggerReasonLabels: Record<string, string> = {
  validation_wipeout: '검증 실패',
  high_ev_high_mdd: '높은 MDD',
  performance_collapse: '성과 급락',
  regime_shift: '레짐 전환',
  manual: '수동 요청',
}

export const OperatorQueue = ({ items, aiAlerts = [], onApprove, onReject, onDismiss }: OperatorQueueProps) => {
  const totalCount = items.length + aiAlerts.length

  return (
    <div className="w-full lg:w-[260px] shrink-0 border-t lg:border-t-0 lg:border-l border-border-subtle flex flex-col">
      {/* 헤더 */}
      <div className="px-4 py-2.5 border-b border-border bg-surface flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-secondary">
          확인 필요
        </span>
        {totalCount > 0 && (
          <span className="text-[12px] font-semibold text-warning">
            <span className="font-mono">{totalCount}</span>건
          </span>
        )}
      </div>

      {/* 아이템 */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => {
          if (item.kind === 'approval') {
            return <ApprovalCard key={item.data.id} approval={item.data} onApprove={onApprove} onReject={onReject} />
          }
          return <RiskCard key={item.data.id} alert={item.data} onDismiss={onDismiss} />
        })}

        {/* AI 분석 알림 */}
        {aiAlerts.length > 0 && (
          <>
            <div className="px-4 py-2 border-b border-border bg-surface">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                AI 분석
              </span>
            </div>
            {aiAlerts.map((alert) => (
              <AiAlertCard key={alert.id} alert={alert} />
            ))}
          </>
        )}

        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <span className="text-[13px] text-text-secondary">모든 항목 처리 완료</span>
            <span className="text-[12px] text-text-muted mt-1">확인이 필요한 항목이 없습니다</span>
          </div>
        )}
      </div>
    </div>
  )
}

const ApprovalCard = ({
  approval,
  onApprove,
  onReject,
}: {
  approval: Approval
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) => {
  const typeLabel = approvalTypeLabels[approval.type] ?? approval.type

  return (
    <div className="px-4 py-3 border-b border-border-subtle">
      {/* 유형 + 만료 */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-info">{typeLabel}</span>
        <span className="flex items-center gap-1 text-[12px] text-text-faint">
          <Clock className="w-3 h-3" />
          {formatTimeLeft(approval.expiresAt)}
        </span>
      </div>

      {/* 제목 */}
      <div className="text-[13px] font-semibold text-text-primary mb-1">
        {approval.title}
      </div>

      {/* 왜 요청됐는지 */}
      <div className="text-[12px] text-text-secondary mb-2">
        {approval.description}
      </div>

      {/* 승인/거부 시 변경점 */}
      <div className="bg-background rounded px-3 py-2 mb-2.5 space-y-1">
        <div className="flex items-start gap-2 text-[12px]">
          <span className="text-profit shrink-0">승인 시</span>
          <ArrowRight className="w-3 h-3 text-text-faint shrink-0 mt-0.5" />
          <span className="text-text-secondary">
            {approval.type === 'position_entry' && '해당 전략이 실제 포지션에 진입합니다'}
            {approval.type === 'risk_adjustment' && '손절가가 변경됩니다'}
            {approval.type === 'strategy_swap' && '현재 전략이 교체됩니다'}
            {approval.type === 'session_promote' && '페이퍼에서 실전으로 승격됩니다'}
          </span>
        </div>
        <div className="flex items-start gap-2 text-[12px]">
          <span className="text-text-muted shrink-0">거부 시</span>
          <ArrowRight className="w-3 h-3 text-text-faint shrink-0 mt-0.5" />
          <span className="text-text-muted">현재 상태가 유지됩니다</span>
        </div>
      </div>

      {/* 버튼 — 더 큰 터치 타겟 */}
      <div className="flex gap-2">
        <button
          onClick={() => onApprove?.(approval.id)}
          className="flex-1 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-profit/10 text-profit hover:bg-profit/20 transition-colors"
        >
          승인
        </button>
        <button
          onClick={() => onReject?.(approval.id)}
          className="flex-1 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-loss/10 text-loss hover:bg-loss/20 transition-colors"
        >
          거부
        </button>
      </div>
    </div>
  )
}

const RiskCard = ({
  alert,
  onDismiss,
}: {
  alert: RiskAlert
  onDismiss?: (id: string) => void
}) => {
  const pct = alert.threshold !== 0
    ? Math.round(Math.abs(alert.currentValue / alert.threshold) * 100)
    : 0

  return (
    <div className="px-4 py-3 border-b border-border-subtle">
      <div className="flex items-center gap-1.5 mb-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
        <span className="text-[13px] font-semibold text-warning">{alert.title}</span>
      </div>
      <div className="text-[12px] text-text-secondary mb-2">
        {alert.description}
      </div>

      {/* 진행 바 */}
      <div className="bg-background rounded-full h-1.5 mb-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-loss' : 'bg-warning'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[12px] text-text-muted mb-2">
        <span>현재 <span className="font-mono">{alert.currentValue}%</span></span>
        <span>한도 <span className="font-mono">{alert.threshold}%</span></span>
      </div>

      {onDismiss && (
        <button
          onClick={() => onDismiss(alert.id)}
          className="w-full px-3 py-1.5 text-[12px] font-medium rounded-md border border-border text-text-muted hover:text-text-secondary transition-colors"
        >
          확인했습니다
        </button>
      )}
    </div>
  )
}

const AiAlertCard = ({ alert }: { alert: AiAlert }) => {
  const reasonLabel = triggerReasonLabels[alert.triggerReason] ?? alert.triggerReason
  const confidencePct = Math.round(alert.confidence * 100)

  return (
    <div className="px-4 py-3 border-b border-border-subtle border-l-2 border-l-info bg-info/5">
      {/* 전략명 + 트리거 사유 */}
      <div className="flex items-center gap-1.5 mb-1">
        <Brain className="w-3.5 h-3.5 text-info shrink-0" />
        <span className="text-[12px] font-semibold text-text-primary truncate">
          {alert.strategyName}
        </span>
        <span className="ml-auto text-[11px] font-medium text-info shrink-0">
          {reasonLabel}
        </span>
      </div>

      {/* 요약 (1줄) */}
      <div className="text-[12px] text-text-secondary mb-2 line-clamp-2">
        {alert.summary}
      </div>

      {/* 신뢰도 뱃지 + 파라미터 제안 표시 */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
          confidencePct >= 70 ? 'bg-profit/10 text-profit' :
          confidencePct >= 40 ? 'bg-warning/10 text-warning' :
          'bg-text-muted/10 text-text-muted'
        }`}>
          신뢰도 {confidencePct}%
        </span>
        {alert.hasParamSuggestions && (
          <span className="text-[11px] text-info">
            파라미터 제안 포함
          </span>
        )}
      </div>

      {/* 상세 보기 안내 */}
      <span className="text-[11px] text-text-faint">
        연구 페이지에서 상세 보기
      </span>
    </div>
  )
}
