import type { HeroSummary } from '@/types/orchestration'
import { formatKRW, formatPercent } from '@/lib/utils'

const riskFallback = { text: '안전', color: 'text-profit', bg: 'bg-profit/10' } as const

const riskLabels: Record<string, { text: string; color: string; bg: string }> = {
  normal: riskFallback,
  caution: { text: '주의', color: 'text-warning', bg: 'bg-warning/10' },
  warning: { text: '경고', color: 'text-warning', bg: 'bg-warning/10' },
  critical: { text: '위험', color: 'text-loss', bg: 'bg-loss/10' },
}

interface HeroStripProps {
  summary: HeroSummary
}

export const HeroStrip = ({ summary }: HeroStripProps) => {
  const { live, paper } = summary
  const risk = riskLabels[summary.riskLevel] ?? riskFallback

  return (
    <div className="bg-surface px-4 sm:px-5 py-4 sm:py-5 border-b border-border">
      {/* 1행: 승인 필요 + 위험도 */}
      {(summary.pendingApprovals > 0 || summary.riskLevel !== 'normal') && (
        <div className="flex items-center gap-3 mb-3">
          {summary.pendingApprovals > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-warning/10 text-warning">
              승인 대기 <span className="font-mono">{summary.pendingApprovals}</span>건
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${risk.bg} ${risk.color}`}>
            위험도: {risk.text}
          </span>
        </div>
      )}

      {/* 2행: 실전 */}
      <div className="flex flex-wrap items-end gap-5 sm:gap-7 lg:gap-9">
        <AccountBlock
          mode="live"
          label={live.active ? '실전' : '실전 (미활성)'}
          equity={live.totalEquity}
          pnl={live.todayPnl}
          pnlPct={live.todayPnlPct}
          count={live.count}
          muted={!live.active}
        />

        {/* 구분선 */}
        <div className="hidden sm:block w-px h-9 bg-border-subtle" />

        <AccountBlock
          mode="paper"
          label="모의"
          equity={paper.totalEquity}
          pnl={paper.todayPnl}
          pnlPct={paper.todayPnlPct}
          count={paper.count}
          muted={paper.count === 0 && paper.totalEquity === 0}
        />

        {/* 구분선 */}
        <div className="hidden sm:block w-px h-9 bg-border-subtle" />

        {/* EDGE */}
        <div className="hidden sm:block">
          <div className="text-[12px] font-semibold text-text-muted mb-0.5">
            시장 적합도
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[20px] font-bold text-accent leading-none">
              {summary.edgeScore}
            </span>
            <span className="text-[12px] text-text-faint">/100</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const AccountBlock = ({
  mode,
  label,
  equity,
  pnl,
  pnlPct,
  count,
  muted,
}: {
  mode: 'live' | 'paper'
  label: string
  equity: number
  pnl: number
  pnlPct: number
  count: number
  muted: boolean
}) => {
  const pnlColor = pnl >= 0 ? 'text-profit' : 'text-loss'
  const pnlSign = pnl >= 0 ? '+' : ''
  const textMute = muted ? 'text-text-faint' : 'text-text-primary'
  const isUsd = mode === 'paper'

  return (
    <div className="flex items-end gap-4 sm:gap-5">
      {/* 자산 */}
      <div>
        <div className="text-[12px] font-semibold text-text-muted mb-0.5">{label} 자산</div>
        <div className={`font-semibold text-[20px] ${textMute}`}>
          <span className="font-mono tabular-nums">{isUsd ? `$${equity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : formatKRW(equity)}</span>
        </div>
      </div>
      {/* 손익 */}
      <div>
        <div className="text-[12px] font-semibold text-text-muted mb-0.5">오늘 손익</div>
        <div className={`font-semibold text-[15px] ${muted ? 'text-text-faint' : pnlColor}`}>
          <span className="font-mono tabular-nums">{pnlSign}{isUsd ? `$${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatKRW(pnl)}</span>
          <span className={`ml-1.5 text-[12px] font-medium ${muted ? 'text-text-faint' : pnlColor}`}>
            <span className="font-mono tabular-nums">{pnlSign}{formatPercent(pnlPct)}</span>
          </span>
        </div>
      </div>
      {/* 포지션 수 */}
      <div>
        <div className="text-[12px] font-semibold text-text-muted mb-0.5">운용</div>
        <div className={`font-semibold text-[15px] ${textMute}`}>
          <span className="font-mono tabular-nums">{count}</span>개
        </div>
      </div>
    </div>
  )
}
