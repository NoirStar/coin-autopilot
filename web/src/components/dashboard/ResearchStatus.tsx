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
    <div className="flex-1 min-w-0 border-t lg:border-t-0 lg:border-l border-border-subtle overflow-y-auto">
      <div className="px-4 py-2.5 border-b border-border bg-surface flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-text-secondary">연구 현황</span>
      </div>

      {/* 요약 행 */}
      <div className="px-4 py-2.5 font-mono text-[12px] text-text-muted border-b border-border-subtle flex gap-4">
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-profit mr-1 align-middle" />
          실행중 <span className="text-text-primary font-semibold">{summary.running}</span>
        </span>
        <span>
          대기 <span className="text-text-primary font-semibold">{summary.queued}</span>
        </span>
        <span>
          완료 <span className="text-text-primary font-semibold">{summary.completed}</span>
        </span>
      </div>

      {/* 최근 완료 */}
      <div>
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

  return (
    <div className="px-4 py-2 font-mono text-[11px] text-text-muted border-b border-border-subtle hover:bg-surface-hover transition-colors">
      <span className="text-text-faint mr-2">{formatTime(run.completedAt)}</span>
      <span className="text-text-primary font-medium mr-2">{run.strategy}</span>
      <span className="mr-3">{run.asset}</span>
      {run.winRate !== null && (
        <span className="mr-2.5">
          승률 <span className={winRateColor}>{run.winRate}%</span>
        </span>
      )}
      {run.maxDrawdown !== null && (
        <span className="mr-2.5">
          MDD <span className="text-loss">{run.maxDrawdown}%</span>
        </span>
      )}
      {run.totalReturn !== null && run.totalReturn < 0 && (
        <span className="text-text-faint">탈락</span>
      )}
    </div>
  )
}
