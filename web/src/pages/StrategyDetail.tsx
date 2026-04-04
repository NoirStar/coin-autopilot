import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Activity, BarChart3, Clock, Shield } from 'lucide-react'
import { useOrchestrationStore } from '@/stores/orchestration-store'
import { formatPercent } from '@/lib/utils'

const modeLabels: Record<string, string> = {
  auto: '자동',
  manual: '수동',
  semi_auto: '반자동',
}

const formatDuration = (isoStart: string): string => {
  if (!isoStart) return '—'
  const ms = Date.now() - new Date(isoStart).getTime()
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}시간 ${mins}분`
  return `${mins}분`
}

export const StrategyDetail = () => {
  const { slotId } = useParams<{ slotId: string }>()
  const navigate = useNavigate()

  const { assetSlots, decisions } = useOrchestrationStore()

  const slot = assetSlots.find((s) => s.id === slotId)

  if (!slot) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="text-[13px] text-text-muted">전략 슬롯을 찾을 수 없습니다</span>
        <button
          onClick={() => navigate('/')}
          className="mt-3 text-[13px] text-info hover:underline"
        >
          대시보드로 돌아가기
        </button>
      </div>
    )
  }

  const relatedDecisions = decisions.filter(
    (d) => d.asset === slot.id || d.strategy === slot.strategy.shortName
  )

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-border-subtle">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          대시보드
        </button>
        <div className="flex items-center gap-3">
          <div
            className={`w-1 h-8 rounded-full ${
              slot.tradeMode === 'live' ? 'bg-profit' : 'bg-text-faint'
            }`}
          />
          <div>
            <h1 className="text-[20px] font-bold text-text-primary">
              {slot.strategy.name}
            </h1>
            <p className="text-[13px] text-text-muted">
              {slot.asset} · {slot.strategy.shortName} · {modeLabels[slot.operationMode] ?? slot.operationMode}
            </p>
          </div>
          {slot.edgeScore !== null && (
            <div className="ml-auto text-right">
              <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                EDGE
              </div>
              <div className={`font-mono text-[24px] font-bold leading-none ${
                slot.edgeScore >= 70 ? 'text-profit' : slot.edgeScore >= 40 ? 'text-text-secondary' : 'text-text-faint'
              }`}>
                {slot.edgeScore}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 상태 카드 그리드 */}
        <div className="grid grid-cols-4 gap-px bg-border-subtle mx-6 mt-5 border border-border-subtle rounded-md overflow-hidden">
          <StatCard
            icon={Activity}
            label="상태"
            value={slot.tradeMode === 'live' ? 'LIVE' : 'PAPER'}
            valueColor={slot.tradeMode === 'live' ? 'text-profit' : 'text-text-muted'}
          />
          <StatCard
            icon={BarChart3}
            label="포지션"
            value={slot.position ? (slot.position.side === 'long' ? 'LONG' : 'SHORT') : 'FLAT'}
            valueColor={
              slot.position?.side === 'long' ? 'text-profit' : slot.position?.side === 'short' ? 'text-loss' : 'text-text-muted'
            }
          />
          <StatCard
            icon={Clock}
            label="보유 시간"
            value={slot.position ? formatDuration(slot.position.holdingSince) : '—'}
          />
          <StatCard
            icon={Shield}
            label="신뢰도"
            value={slot.position ? `${(slot.position.confidence * 100).toFixed(0)}%` : '—'}
          />
        </div>

        {/* 포지션 상세 */}
        {slot.position && (
          <div className="mx-6 mt-4">
            <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
              POSITION
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PositionField label="진입가" value={slot.position.entryPrice.toLocaleString()} />
              <PositionField label="현재가" value={slot.position.currentPrice.toLocaleString()} />
              <PositionField label="손절가" value={slot.position.stopLoss.toLocaleString()} />
              <PositionField label="목표가" value={slot.position.takeProfit.toLocaleString()} />
              <PositionField
                label="미실현 손익"
                value={`${slot.position.unrealizedPnl >= 0 ? '+' : ''}${slot.position.unrealizedPnl.toLocaleString()}`}
                valueColor={slot.position.unrealizedPnl >= 0 ? 'text-profit' : 'text-loss'}
              />
              <PositionField
                label="수익률"
                value={formatPercent(slot.position.unrealizedPnlPct)}
                valueColor={slot.position.unrealizedPnlPct >= 0 ? 'text-profit' : 'text-loss'}
              />
            </div>
          </div>
        )}

        {/* 판단 이유 */}
        <div className="mx-6 mt-5">
          <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            RATIONALE
          </div>
          <div className="bg-surface border border-border-subtle rounded-md p-4">
            <p className="text-[13px] text-text-secondary">{slot.rationale}</p>
            <p className="font-mono text-[11px] text-text-muted mt-2">{slot.rationaleDetail}</p>
          </div>
        </div>

        {/* 관련 판단 로그 */}
        <div className="mx-6 mt-5 mb-6">
          <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            DECISION HISTORY
          </div>
          {relatedDecisions.length > 0 ? (
            <div className="border border-border-subtle rounded-md overflow-hidden divide-y divide-border-subtle">
              {relatedDecisions.map((dec) => {
                const time = new Date(dec.timestamp)
                const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
                const actionColors: Record<string, string> = {
                  ENTRY: 'text-profit', EXIT: 'text-loss', HOLD: 'text-text-secondary',
                  SWAP: 'text-warning', STOP: 'text-loss', WAIT: 'text-text-muted',
                }
                return (
                  <div key={dec.id} className="px-4 py-2 font-mono text-[11px] text-text-muted hover:bg-surface-hover transition-colors">
                    <span className="text-text-faint">{timeStr}</span>{' '}
                    <span className={actionColors[dec.action] ?? ''}>{dec.action}</span>{' '}
                    conf:<span className="text-text-secondary">{dec.confidence.toFixed(2)}</span>{' '}
                    {Object.entries(dec.factors).map(([k, v]) => (
                      <span key={k}>
                        {k}:<span className="text-text-secondary">{v}</span>{' '}
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[12px] text-text-muted py-4 text-center border border-dashed border-border rounded-md">
              판단 기록 없음
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  valueColor = 'text-text-primary',
}: {
  icon: typeof Activity
  label: string
  value: string
  valueColor?: string
}) => (
  <div className="bg-surface p-3">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon className="w-3 h-3 text-text-faint" />
      <span className="text-[12px] font-semibold text-text-muted">{label}</span>
    </div>
    <div className={`font-mono text-[15px] font-semibold ${valueColor}`}>{value}</div>
  </div>
)

const PositionField = ({
  label,
  value,
  valueColor = 'text-text-primary',
}: {
  label: string
  value: string
  valueColor?: string
}) => (
  <div className="bg-surface border border-border-subtle rounded-md px-3 py-2">
    <div className="text-[12px] font-semibold text-text-muted mb-0.5">{label}</div>
    <div className={`font-mono text-[13px] tabular-nums ${valueColor}`}>{value}</div>
  </div>
)
