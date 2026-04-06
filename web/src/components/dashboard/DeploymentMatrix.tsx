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
    <div className="flex-1 min-w-0 overflow-y-auto">
      {/* 섹션 헤더 — 한국어 + 영문 */}
      <div className="px-4 py-2.5 border-b border-border bg-surface flex items-baseline justify-between sticky top-0 z-10">
        <span className="text-[12px] font-semibold text-text-secondary">전략 배치 현황</span>
        <span className="text-[12px] text-text-faint"><span className="font-mono">{slots.length}</span>개 자산</span>
      </div>

      {/* 데스크톱 테이블 컬럼 헤더 */}
      <div className="hidden sm:grid grid-cols-[80px_100px_80px_60px_1fr] px-4 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase border-b border-border-subtle">
        <span>STRAT</span>
        <span>ASSET</span>
        <span>STATE</span>
        <span className="text-right">EDGE</span>
        <span className="pl-4">RATIONALE</span>
      </div>

      {slots.map((slot) => {
        const style = getStateStyle(slot)
        return (
          <div
            key={slot.id}
            role="button"
            tabIndex={0}
            aria-label={`전략 ${slot.strategy.shortName} ${slot.asset} 상세 보기`}
            onClick={() => navigate(`/strategy/${slot.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/strategy/${slot.id}`) } }}
            className={`border-b border-border-subtle border-l-2 ${style.borderClass} hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-text-muted focus-visible:outline-none transition-colors duration-100 cursor-pointer`}
          >
            {/* 데스크톱: 그리드 행 */}
            <div className="hidden sm:grid grid-cols-[80px_100px_80px_60px_1fr] px-4 py-2 items-center">
              <span className="font-mono font-semibold text-[13px] text-text-primary truncate">
                {slot.strategy.shortName}
              </span>
              <span className="text-[13px] text-text-secondary truncate">
                {slot.asset}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dotClass}`} />
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
              <span className="pl-4 text-[12px] text-text-secondary truncate">
                {slot.rationale}
              </span>
            </div>

            {/* 모바일: 카드형 */}
            <div className="sm:hidden px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-[13px] text-text-primary">
                    {slot.strategy.shortName}
                  </span>
                  <span className="text-[12px] text-text-muted">{slot.asset}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} />
                    <span className={`text-[11px] font-medium ${
                      slot.tradeMode === 'live' ? 'text-profit' : 'text-text-muted'
                    }`}>
                      {style.label}
                    </span>
                  </span>
                  {slot.edgeScore !== null && (
                    <span className={`font-mono font-semibold text-[13px] ${
                      slot.edgeScore >= 70 ? 'text-profit' : 'text-text-secondary'
                    }`}>
                      {slot.edgeScore}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1 text-[12px] text-text-muted truncate">
                {slot.rationale}
              </div>
            </div>

            {/* 보조 행 — 데스크톱만 */}
            <div className="hidden sm:block px-4 pb-2 pl-8 text-[12px] text-text-muted">
              {slot.rationaleDetail}
            </div>
          </div>
        )
      })}

      {slots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
          <span className="text-[13px] text-text-secondary">배치된 전략이 없습니다</span>
          <span className="text-[12px] text-text-muted mt-1">연구 루프에서 전략이 검증되면 여기에 표시됩니다</span>
        </div>
      )}
    </div>
  )
}
