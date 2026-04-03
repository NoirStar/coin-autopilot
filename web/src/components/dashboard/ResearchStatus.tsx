import type { ResearchSummary, ResearchRun } from '@/types/orchestration'

const formatTime = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ResearchStatusProps {
  summary: ResearchSummary
}

export const ResearchStatus = ({ summary }: ResearchStatusProps) => {
  return (
    <div className="flex-1 min-w-0 border-t lg:border-t-0 lg:border-l border-border-subtle">
      <div className="px-4 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase border-b border-border-subtle">
        RESEARCH
      </div>

      {/* 요약 행 */}
      <div className="px-4 py-1.5 font-mono text-[11px] text-text-muted border-b border-border-subtle">
        <span className="text-profit">&#9679;</span>{' '}
        실행중 <span className="text-text-primary font-medium">{summary.running}</span>
        {' '} 대기 <span className="text-text-primary font-medium">{summary.queued}</span>
        {' '} 완료 <span className="text-text-primary font-medium">{summary.completed}</span>
      </div>

      {/* 최근 완료 */}
      <div className="divide-y divide-border-subtle">
        {summary.topCandidates.slice(0, 4).map((run) => (
          <ResearchRunRow key={run.id} run={run} />
        ))}
      </div>
    </div>
  )
}

const ResearchRunRow = ({ run }: { run: ResearchRun }) => {
  const winRateColor =
    run.winRate !== null && run.winRate >= 55 ? 'text-profit' : run.winRate !== null && run.winRate < 45 ? 'text-loss' : 'text-text-secondary'
  const returnColor =
    run.totalReturn !== null && run.totalReturn > 0 ? 'text-profit' : run.totalReturn !== null && run.totalReturn < 0 ? 'text-loss' : 'text-text-secondary'
  const mddColor = 'text-loss'

  return (
    <div className="px-4 py-1 font-mono text-[11px] text-text-muted">
      <span className="text-text-faint">{formatTime(run.completedAt)}</span>{' '}
      <span className="text-text-secondary font-medium">{run.strategy}</span>{' '}
      {run.asset}{' '}
      {run.winRate !== null && (
        <>
          승률 <span className={winRateColor}>{run.winRate}%</span>{' '}
        </>
      )}
      {run.maxDrawdown !== null && (
        <>
          MDD <span className={mddColor}>{run.maxDrawdown}%</span>{' '}
        </>
      )}
      {run.totalReturn !== null && run.totalReturn < 0 && (
        <span className="text-text-faint">— 탈락</span>
      )}
    </div>
  )
}
