import type { Decision } from '@/types/orchestration'

const formatTime = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const actionColors: Record<string, string> = {
  ENTRY: 'text-profit',
  EXIT: 'text-loss',
  HOLD: 'text-text-secondary',
  SWAP: 'text-warning',
  STOP: 'text-loss',
  WAIT: 'text-text-muted',
}

interface DecisionLedgerProps {
  decisions: Decision[]
}

export const DecisionLedger = ({ decisions }: DecisionLedgerProps) => {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 py-2.5 font-mono text-[10px] font-semibold text-text-muted tracking-widest uppercase border-b border-border bg-surface">
        DECISION LOG
      </div>
      <div>
        {decisions.map((dec) => (
          <div key={dec.id} className="px-4 py-2 font-mono text-[11px] text-text-muted border-b border-border-subtle hover:bg-surface-hover transition-colors">
            <span className="text-text-faint mr-2">{formatTime(dec.timestamp)}</span>
            <span className="text-text-primary font-medium mr-2">
              {dec.asset}/{dec.strategy}
            </span>
            <span className={`font-semibold mr-3 ${actionColors[dec.action] ?? 'text-text-muted'}`}>
              {dec.action}
            </span>
            <span className="text-text-faint">
              {Object.entries(dec.factors).map(([k, v]) => (
                <span key={k} className="inline-block mr-2.5">
                  <span className="text-text-faint">{k}:</span>
                  <span className="text-text-secondary">{v}</span>
                </span>
              ))}
            </span>
          </div>
        ))}

        {decisions.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-text-faint text-center">
            아직 판단 기록이 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
