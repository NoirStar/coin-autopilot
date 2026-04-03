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
    <div className="flex-1 min-w-0">
      <div className="px-4 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase border-b border-border-subtle">
        DECISION LOG
      </div>
      <div className="divide-y divide-border-subtle">
        {decisions.map((dec) => (
          <div key={dec.id} className="px-4 py-1 font-mono text-[11px] text-text-muted">
            <span className="text-text-faint">{formatTime(dec.timestamp)}</span>{' '}
            <span className="text-text-secondary font-medium">
              {dec.asset}/{dec.strategy}
            </span>{' '}
            <span className={actionColors[dec.action] ?? 'text-text-muted'}>
              {dec.action}
            </span>{' '}
            {Object.entries(dec.factors).map(([k, v]) => (
              <span key={k}>
                {k}:<span className="text-text-secondary">{v}</span>{' '}
              </span>
            ))}
          </div>
        ))}

        {decisions.length === 0 && (
          <div className="px-4 py-4 text-[11px] text-text-faint text-center">
            판단 기록 없음
          </div>
        )}
      </div>
    </div>
  )
}
