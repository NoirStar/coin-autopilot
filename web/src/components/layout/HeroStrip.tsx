import type { HeroSummary } from '@/types/orchestration'
import { formatKRW, formatPercent } from '@/lib/utils'

interface HeroStripProps {
  summary: HeroSummary
}

export const HeroStrip = ({ summary }: HeroStripProps) => {
  const pnlColor = summary.todayPnl >= 0 ? 'text-profit' : 'text-loss'
  const pnlSign = summary.todayPnl >= 0 ? '+' : ''

  return (
    <div className="flex items-baseline gap-8 px-4 py-3 border-b border-border-subtle flex-wrap">
      {/* EDGE 스코어 — 히어로 */}
      <div>
        <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">
          EDGE
        </div>
        <div className="font-mono text-[28px] font-bold text-accent leading-none">
          {summary.edgeScore}
        </div>
      </div>

      {/* 요약 스탯 */}
      <div className="font-mono text-[13px] text-text-secondary">
        <strong className="text-text-primary font-semibold">LIVE</strong>{' '}
        {summary.liveCount}
      </div>
      <div className="font-mono text-[13px] text-text-secondary">
        <strong className="text-text-primary font-semibold">PAPER</strong>{' '}
        {summary.paperCount}
      </div>
      <div className="font-mono text-[13px] text-text-secondary">
        총 자산{' '}
        <strong className="font-mono text-text-primary font-semibold">
          {formatKRW(summary.totalEquity)}
        </strong>
      </div>
      <div className="font-mono text-[13px] text-text-secondary">
        오늘{' '}
        <span className={`font-mono font-semibold ${pnlColor}`}>
          {pnlSign}{formatKRW(summary.todayPnl)}
        </span>
        <span className={`ml-1 text-[11px] ${pnlColor}`}>
          ({pnlSign}{formatPercent(summary.todayPnlPct)})
        </span>
      </div>

      {/* 승인 대기 배지 */}
      {summary.pendingApprovals > 0 && (
        <div className="ml-auto">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning/10 text-warning">
            승인 대기 {summary.pendingApprovals}
          </span>
        </div>
      )}
    </div>
  )
}
