import { useNavigate } from 'react-router-dom'
import type { AssetSlot } from '@/types/orchestration'

const stateStyles: Record<string, { dotClass: string; borderClass: string; label: string }> = {
  live: { dotClass: 'bg-profit', borderClass: 'border-l-profit', label: 'LIVE' },
  paper: { dotClass: 'bg-text-faint', borderClass: 'border-l-text-faint', label: 'PAPER' },
  pending: { dotClass: 'bg-warning', borderClass: 'border-l-warning', label: 'PENDING' },
  stopped: { dotClass: 'bg-loss', borderClass: 'border-l-loss', label: 'STOPPED' },
}

const defaultStyle = { dotClass: 'bg-text-faint', borderClass: 'border-l-text-faint', label: 'PAPER' }

const getStateStyle = (slot: AssetSlot) => {
  if (slot.state === 'stopped') return stateStyles.stopped ?? defaultStyle
  if (slot.state === 'pending_approval') return stateStyles.pending ?? defaultStyle
  if (slot.tradeMode === 'live') return stateStyles.live ?? defaultStyle
  return stateStyles.paper ?? defaultStyle
}

interface DeploymentMatrixProps {
  slots: AssetSlot[]
}

export const DeploymentMatrix = ({ slots }: DeploymentMatrixProps) => {
  const navigate = useNavigate()

  return (
    <div className="flex-1 min-w-0">
      {/* 헤더 */}
      <div className="grid grid-cols-[80px_80px_70px_50px] lg:grid-cols-[80px_100px_80px_60px_1fr] px-4 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase border-b border-border-subtle">
        <span>STRAT</span>
        <span>ASSET</span>
        <span>STATE</span>
        <span className="text-right">EDGE</span>
        <span className="pl-4 hidden lg:block">RATIONALE</span>
      </div>

      {/* 행 */}
      {slots.map((slot) => {
        const style = getStateStyle(slot)
        return (
          <div
            key={slot.id}
            onClick={() => navigate(`/strategy/${slot.id}`)}
            className={`border-b border-border-subtle border-l-2 ${style.borderClass} hover:bg-surface-hover transition-colors duration-100 cursor-pointer`}
          >
            {/* 메인 행 */}
            <div className="grid grid-cols-[80px_80px_70px_50px] lg:grid-cols-[80px_100px_80px_60px_1fr] px-4 py-2 items-center">
              <span className="font-mono font-semibold text-[13px] text-text-primary truncate">
                {slot.strategy.shortName}
              </span>
              <span className="text-[13px] text-text-secondary truncate">
                {slot.asset}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} />
                <span className={`text-[12px] font-medium ${
                  slot.tradeMode === 'live' ? 'text-profit' : 'text-text-muted'
                }`}>
                  {style.label}
                </span>
              </span>
              <span className={`font-mono font-semibold text-[13px] text-right ${
                slot.edgeScore !== null && slot.edgeScore >= 70
                  ? 'text-profit'
                  : slot.edgeScore !== null && slot.edgeScore >= 40
                  ? 'text-text-secondary'
                  : 'text-text-faint'
              }`}>
                {slot.edgeScore ?? '—'}
              </span>
              <span className="pl-4 text-[12px] text-text-secondary truncate hidden lg:block">
                {slot.rationale}
              </span>
            </div>

            {/* 보조 행 (상세) */}
            <div className="px-4 pb-2 pl-8 font-mono text-[11px] text-text-muted">
              {slot.rationaleDetail}
            </div>
          </div>
        )
      })}

      {slots.length === 0 && (
        <div className="flex items-center justify-center py-12 text-[13px] text-text-muted border border-dashed border-border rounded-md m-4">
          배치된 전략이 없습니다
        </div>
      )}
    </div>
  )
}
