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

const actionSummary: Record<string, string> = {
  ENTRY: '진입',
  EXIT: '청산',
  HOLD: '유지',
  SWAP: '전략 교체',
  STOP: '중지',
  WAIT: '대기 중',
}

interface DecisionLedgerProps {
  decisions: Decision[]
}

export const DecisionLedger = ({ decisions }: DecisionLedgerProps) => {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 py-2.5 border-b border-border bg-surface flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-text-secondary">시스템 판단 기록</span>
        <span className="font-mono text-[10px] text-text-faint">최근 {decisions.length}건</span>
      </div>
      <div>
        {decisions.map((dec) => (
          <div key={dec.id} className="px-4 py-2.5 border-b border-border-subtle hover:bg-surface-hover transition-colors">
            {/* 한글 요약 1줄 */}
            <div className="text-[12px] text-text-secondary mb-1">
              <span className="text-text-muted mr-1.5">{formatTime(dec.timestamp)}</span>
              <span className="font-medium text-text-primary">{dec.asset}</span>
              <span className="text-text-muted mx-1">·</span>
              <span className={`font-semibold ${actionColors[dec.action] ?? 'text-text-muted'}`}>
                {actionSummary[dec.action] ?? dec.action}
              </span>
              <span className="text-text-muted ml-1.5">{dec.rationale}</span>
            </div>
            {/* 머신 로그 (축약) */}
            <div className="font-mono text-[10px] text-text-faint">
              {dec.asset}/{dec.strategy} {dec.action}{' '}
              {Object.entries(dec.factors).map(([k, v]) => (
                <span key={k} className="mr-2">
                  {k}:{v}
                </span>
              ))}
            </div>
          </div>
        ))}

        {decisions.length === 0 && (
          <div className="px-4 py-8 text-center">
            <span className="text-[13px] text-text-secondary">아직 판단 기록이 없습니다</span>
            <br />
            <span className="text-[12px] text-text-muted">전략이 배치되면 여기에 실시간 로그가 쌓입니다</span>
          </div>
        )}
      </div>
    </div>
  )
}
