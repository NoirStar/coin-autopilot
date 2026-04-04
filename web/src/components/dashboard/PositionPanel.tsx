import type { ActivePosition } from '@/types/orchestration'
import { formatPercent } from '@/lib/utils'

const formatDuration = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

interface PositionPanelProps {
  positions: ActivePosition[]
}

export const PositionPanel = ({ positions }: PositionPanelProps) => {
  const livePositions = positions.filter((p) => p.tradeMode === 'live')
  const paperPositions = positions.filter((p) => p.tradeMode === 'paper')

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 py-2.5 border-b border-border bg-surface flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-text-secondary">포지션 현황</span>
        <span className="font-mono text-[10px] text-text-faint">{positions.length}개 열림</span>
      </div>

      {positions.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <span className="text-[13px] text-text-secondary">열린 포지션이 없습니다</span>
          <br />
          <span className="text-[12px] text-text-muted">전략이 신호를 감지하면 자동으로 진입합니다</span>
        </div>
      ) : (
        <div>
          {livePositions.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[12px] font-semibold text-profit bg-profit/5 border-b border-border-subtle">
                실전 {livePositions.length}
              </div>
              {livePositions.map((pos) => (
                <PositionRow key={pos.id} position={pos} />
              ))}
            </>
          )}
          {paperPositions.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[12px] font-semibold text-text-muted bg-surface border-b border-border-subtle">
                모의 {paperPositions.length}
              </div>
              {paperPositions.map((pos) => (
                <PositionRow key={pos.id} position={pos} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const PositionRow = ({ position: pos }: { position: ActivePosition }) => {
  const pnlColor = pos.unrealizedPnlPct >= 0 ? 'text-profit' : 'text-loss'
  const sideLabel = pos.side === 'long' ? '매수' : pos.side === 'short' ? '매도' : '대기'
  const sideColor = pos.side === 'long' ? 'text-profit' : pos.side === 'short' ? 'text-loss' : 'text-text-muted'

  return (
    <div className="px-4 py-2.5 border-b border-border-subtle hover:bg-surface-hover transition-colors">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{pos.asset}</span>
          <span className={`text-[12px] font-semibold ${sideColor}`}>{sideLabel}</span>
          <span className="text-[11px] text-text-faint">{pos.strategy}</span>
        </div>
        <span className={`font-mono text-[13px] font-semibold tabular-nums ${pnlColor}`}>
          {pos.unrealizedPnlPct >= 0 ? '+' : ''}{formatPercent(pos.unrealizedPnlPct)}
        </span>
      </div>
      <div className="flex items-center gap-4 font-mono text-[11px] text-text-muted">
        <span>진입 {pos.entryPrice.toLocaleString()}</span>
        <span>현재 <span className="text-text-secondary">{pos.currentPrice.toLocaleString()}</span></span>
        <span>SL {pos.stopLoss.toLocaleString()}</span>
        <span className="ml-auto text-text-faint">{formatDuration(pos.holdingSince)}</span>
      </div>
    </div>
  )
}
