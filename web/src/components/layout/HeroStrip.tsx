import type { HeroSummary } from '@/types/orchestration'
import { formatKRW, formatPercent } from '@/lib/utils'

interface HeroStripProps {
  summary: HeroSummary
}

export const HeroStrip = ({ summary }: HeroStripProps) => {
  const pnlColor = summary.todayPnl >= 0 ? 'text-profit' : 'text-loss'
  const pnlSign = summary.todayPnl >= 0 ? '+' : ''

  return (
    <div className="bg-surface px-4 sm:px-5 py-4 sm:py-5 border-b border-border flex flex-wrap items-end gap-6 sm:gap-8 lg:gap-10">
      {/* EDGE 스코어 — 히어로. 이 숫자가 페이지에서 가장 커야 한다 */}
      <div>
        <div className="font-mono text-[10px] font-semibold text-text-muted tracking-widest uppercase mb-1">
          EDGE
        </div>
        <div className="font-mono text-[32px] sm:text-[40px] font-bold text-accent leading-none">
          {summary.edgeScore}
        </div>
      </div>

      {/* 구분선 */}
      <div className="hidden sm:block w-px h-10 bg-border-subtle" />

      {/* 핵심 지표 */}
      <div className="flex flex-wrap items-end gap-5 sm:gap-6">
        <Stat label="LIVE" value={String(summary.liveCount)} />
        <Stat label="PAPER" value={String(summary.paperCount)} />
        <Stat
          label="총 자산"
          value={formatKRW(summary.totalEquity)}
          className="hidden sm:block"
        />
        <Stat
          label="오늘"
          value={`${pnlSign}${formatKRW(summary.todayPnl)}`}
          valueColor={pnlColor}
          sub={`${pnlSign}${formatPercent(summary.todayPnlPct)}`}
          subColor={pnlColor}
        />
      </div>

      {/* 승인 대기 */}
      {summary.pendingApprovals > 0 && (
        <div className="ml-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-warning/10 text-warning">
            승인 대기 {summary.pendingApprovals}
          </span>
        </div>
      )}
    </div>
  )
}

const Stat = ({
  label,
  value,
  valueColor = 'text-text-primary',
  sub,
  subColor,
  className = '',
}: {
  label: string
  value: string
  valueColor?: string
  sub?: string
  subColor?: string
  className?: string
}) => (
  <div className={className}>
    <div className="text-[11px] font-semibold text-text-muted mb-0.5">{label}</div>
    <div className={`font-mono text-[15px] font-semibold ${valueColor}`}>
      {value}
      {sub && (
        <span className={`ml-1.5 text-[11px] font-medium ${subColor ?? 'text-text-muted'}`}>
          {sub}
        </span>
      )}
    </div>
  </div>
)
