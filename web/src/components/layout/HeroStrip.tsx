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
  const pnlColor = summary.todayPnl >= 0 ? 'text-profit' : 'text-loss'
  const pnlSign = summary.todayPnl >= 0 ? '+' : ''
  const risk = riskLabels[summary.riskLevel] ?? riskFallback

  return (
    <div className="bg-surface px-4 sm:px-5 py-4 sm:py-5 border-b border-border">
      {/* 1행: 승인 필요 + 위험도 — 행동이 필요한 것이 가장 먼저 */}
      {(summary.pendingApprovals > 0 || summary.riskLevel !== 'normal') && (
        <div className="flex items-center gap-3 mb-3">
          {summary.pendingApprovals > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-warning/10 text-warning">
              승인 대기 {summary.pendingApprovals}건
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${risk.bg} ${risk.color}`}>
            위험도: {risk.text}
          </span>
        </div>
      )}

      {/* 2행: 핵심 지표 */}
      <div className="flex flex-wrap items-end gap-5 sm:gap-7 lg:gap-9">
        {/* 총 자산 — "지금 돈이 어디에 들어가 있나"의 시작점 */}
        <Stat label="총 자산" value={formatKRW(summary.totalEquity)} large />

        {/* 오늘 손익 — 즉각적 관심사 */}
        <Stat
          label="오늘 손익"
          value={`${pnlSign}${formatKRW(summary.todayPnl)}`}
          valueColor={pnlColor}
          sub={`${pnlSign}${formatPercent(summary.todayPnlPct)}`}
          subColor={pnlColor}
          large
        />

        {/* 구분선 */}
        <div className="hidden sm:block w-px h-9 bg-border-subtle" />

        {/* 실행 상태 */}
        <Stat label="실전 운용" value={`${summary.liveCount}개`} />
        <Stat label="모의 운용" value={`${summary.paperCount}개`} />

        {/* EDGE — 설명 포함 */}
        <div className="hidden sm:block">
          <div className="text-[11px] font-semibold text-text-muted mb-0.5">
            시장 적합도
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[20px] font-bold text-accent leading-none">
              {summary.edgeScore}
            </span>
            <span className="text-[10px] text-text-faint">/100</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const Stat = ({
  label,
  value,
  valueColor = 'text-text-primary',
  sub,
  subColor,
  large = false,
  className = '',
}: {
  label: string
  value: string
  valueColor?: string
  sub?: string
  subColor?: string
  large?: boolean
  className?: string
}) => (
  <div className={className}>
    <div className="text-[11px] font-semibold text-text-muted mb-0.5">{label}</div>
    <div className={`font-mono font-semibold ${large ? 'text-[18px] sm:text-[20px]' : 'text-[15px]'} ${valueColor}`}>
      {value}
      {sub && (
        <span className={`ml-1.5 text-[11px] font-medium ${subColor ?? 'text-text-muted'}`}>
          {sub}
        </span>
      )}
    </div>
  </div>
)
