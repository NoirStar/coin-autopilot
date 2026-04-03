import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { formatPercent, formatNumber } from '@/lib/utils'
import { api } from '@/services/api'

interface ResearchRun {
  id: string
  strategy_name: string
  asset: string
  status: 'completed' | 'running' | 'failed' | 'queued'
  params: Record<string, unknown>
  total_return: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  win_rate: number | null
  total_trades: number | null
  started_at: string
  completed_at: string | null
}

interface ResearchCandidate {
  id: string
  strategy_name: string
  asset: string
  total_return: number
  sharpe_ratio: number
  max_drawdown: number
  win_rate: number
  total_trades: number
  promotion_status: 'none' | 'paper_candidate' | 'paper_running' | 'champion'
  completed_at: string
}

const statusConfig = {
  completed: { icon: CheckCircle2, label: '완료', color: 'text-profit', bg: 'bg-profit/10' },
  running: { icon: Loader2, label: '실행중', color: 'text-info', bg: 'bg-info/10' },
  failed: { icon: XCircle, label: '실패', color: 'text-loss', bg: 'bg-loss/10' },
  queued: { icon: Clock, label: '대기', color: 'text-text-muted', bg: 'bg-surface-hover' },
}

const promotionLabels: Record<string, { label: string; color: string; bg: string }> = {
  champion: { label: '챔피언', color: 'text-accent', bg: 'bg-accent/10' },
  paper_running: { label: '페이퍼 실행', color: 'text-info', bg: 'bg-info/10' },
  paper_candidate: { label: '페이퍼 후보', color: 'text-warning', bg: 'bg-warning/10' },
  none: { label: '', color: '', bg: '' },
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const ResearchPage = () => {
  const { data: runs, isLoading: runsLoading } = useQuery<ResearchRun[]>({
    queryKey: ['research-runs'],
    queryFn: () => api.request('/api/v2/research/runs'),
    refetchInterval: 30000,
  })

  const { data: candidates, isLoading: candidatesLoading } = useQuery<ResearchCandidate[]>({
    queryKey: ['research-candidates'],
    queryFn: () => api.request('/api/v2/research/candidates'),
    refetchInterval: 60000,
  })

  return (
    <div className="flex flex-col h-full">
      {/* 페이지 헤더 */}
      <div className="px-6 py-4 border-b border-border-subtle">
        <h1 className="text-[20px] font-bold text-text-primary">연구 & 백테스트</h1>
        <p className="text-[13px] text-text-muted mt-1">
          자동 연구 루프 실행 이력과 후보 전략 랭킹
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 실행 이력 */}
        <div className="px-6 pt-5 pb-2">
          <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            RESEARCH RUNS
          </div>

          {runsLoading ? (
            <LoadingState />
          ) : !runs || runs.length === 0 ? (
            <EmptyState message="실행된 연구가 없습니다" />
          ) : (
            <div className="border border-border-subtle rounded-md overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">STATUS</th>
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">STRATEGY</th>
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">ASSET</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">RETURN</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">SHARPE</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">MDD</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold text-text-muted">승률</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold text-text-muted">시작</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const cfg = statusConfig[run.status]
                    const Icon = cfg.icon
                    return (
                      <tr key={run.id} className="border-b border-border-subtle hover:bg-surface-hover transition-colors duration-100">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
                            <Icon className={`w-3 h-3 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[13px] font-medium text-text-primary">{run.strategy_name}</td>
                        <td className="px-3 py-2 text-[13px] text-text-secondary">{run.asset}</td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${
                          run.total_return !== null ? (run.total_return >= 0 ? 'text-profit' : 'text-loss') : 'text-text-faint'
                        }`}>
                          {run.total_return !== null ? formatPercent(run.total_return) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[13px] text-text-secondary tabular-nums">
                          {run.sharpe_ratio !== null ? formatNumber(run.sharpe_ratio) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${
                          run.max_drawdown !== null ? 'text-loss' : 'text-text-faint'
                        }`}>
                          {run.max_drawdown !== null ? formatPercent(run.max_drawdown) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${
                          run.win_rate !== null && run.win_rate >= 55 ? 'text-profit' : 'text-text-secondary'
                        }`}>
                          {run.win_rate !== null ? `${run.win_rate.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-text-faint">
                          {formatDate(run.started_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 후보 랭킹 */}
        <div className="px-6 pt-6 pb-6">
          <div className="font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase mb-3 pb-2 border-b border-border-subtle">
            CANDIDATES
          </div>

          {candidatesLoading ? (
            <LoadingState />
          ) : !candidates || candidates.length === 0 ? (
            <EmptyState message="후보 전략이 없습니다" />
          ) : (
            <div className="border border-border-subtle rounded-md overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">STRATEGY</th>
                    <th className="text-left px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">ASSET</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">RETURN</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">SHARPE</th>
                    <th className="text-right px-3 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase">MDD</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold text-text-muted">승률</th>
                    <th className="text-left px-3 py-2 text-[12px] font-semibold text-text-muted">승격</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const promo = promotionLabels[c.promotion_status] ?? promotionLabels.none ?? { label: '', bg: '', color: '' }
                    return (
                      <tr key={c.id} className="border-b border-border-subtle hover:bg-surface-hover transition-colors duration-100">
                        <td className="px-3 py-2 text-[13px] font-medium text-text-primary">{c.strategy_name}</td>
                        <td className="px-3 py-2 text-[13px] text-text-secondary">{c.asset}</td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${c.total_return >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {formatPercent(c.total_return)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[13px] text-text-secondary tabular-nums">
                          {formatNumber(c.sharpe_ratio)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[13px] text-loss tabular-nums">
                          {formatPercent(c.max_drawdown)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${c.win_rate >= 55 ? 'text-profit' : 'text-text-secondary'}`}>
                          {c.win_rate.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2">
                          {promo?.label && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${promo.bg} ${promo.color}`}>
                              {promo.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const LoadingState = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
    <span className="ml-2 text-[13px] text-text-muted">불러오는 중...</span>
  </div>
)

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-md">
    <FlaskConical className="w-8 h-8 text-text-faint mb-2" />
    <span className="text-[13px] text-text-secondary">{message}</span>
    <span className="text-[12px] text-text-muted mt-1">연구 루프가 실행되면 여기에 표시됩니다</span>
  </div>
)
