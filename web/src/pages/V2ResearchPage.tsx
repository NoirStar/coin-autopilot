import { useQuery } from '@tanstack/react-query'
import {
  FlaskConical,
  Loader2,
  AlertTriangle,
  Trophy,
  Clock,
  ArrowUpCircle,
} from 'lucide-react'
import { getApiBase } from '@/services/api'

// ─── 타입 ──────────────────────────────────────────────────────

interface ResearchRunMetrics {
  total_return: number
  max_drawdown: number
  win_rate: number
  sharpe: number
  profit_factor: number
  trade_count: number
}

interface ResearchRun {
  id: string
  strategy_id: string
  strategyName: string | null
  market_scope: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  promotion_status: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  metrics: ResearchRunMetrics | null
}

interface Candidate {
  strategy_id: string
  strategyName: string | null
  regime: string
  score: number
  sharpe: number
  mdd: number
  win_rate: number
  ranked_at: string
}

// ─── 유틸 ──────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: '완료', cls: 'bg-[#4ADE8012] text-[#4ADE80]' },
    running: { label: '실행중', cls: 'bg-[#60A5FA10] text-[#60A5FA]' },
    failed: { label: '실패', cls: 'bg-[#F8717112] text-[#F87171]' },
    queued: { label: '대기', cls: 'bg-[#27272A] text-[#A1A1AA]' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-[#27272A] text-[#A1A1AA]' }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[12px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

function promotionBadge(promotion: string | null) {
  if (!promotion) return <span className="text-[#52525B]">-</span>
  if (promotion === 'promoted_to_paper') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E8D5B010] px-2 py-0.5 text-[12px] font-medium text-[#E8D5B0]">
        <ArrowUpCircle className="h-3 w-3" />
        승격
      </span>
    )
  }
  if (promotion === 'below_threshold') {
    return (
      <span className="inline-block rounded-full bg-[#27272A] px-2 py-0.5 text-[12px] font-medium text-[#71717A]">
        미달
      </span>
    )
  }
  return <span className="text-[12px] text-[#71717A]">{promotion}</span>
}

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '-'
  return v.toFixed(decimals)
}

function pnlColor(v: number | null | undefined): string {
  if (v == null) return 'text-[#A1A1AA]'
  return v >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
}

function fmtDate(d: string | null): string {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── 컴포넌트 ──────────────────────────────────────────────────

export function V2ResearchPage() {
  const runsQuery = useQuery<{ data: ResearchRun[] }>({
    queryKey: ['v2-research-runs'],
    queryFn: () => fetch(`${getApiBase()}/api/v2/research/runs`).then((r) => r.json()),
    refetchInterval: 30_000,
  })

  const candidatesQuery = useQuery<{ data: Candidate[]; rankedAt: string | null }>({
    queryKey: ['v2-research-candidates'],
    queryFn: () => fetch(`${getApiBase()}/api/v2/research/candidates`).then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const runs = runsQuery.data?.data ?? []
  const candidates = candidatesQuery.data?.data ?? []
  const rankedAt = candidatesQuery.data?.rankedAt

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#FAFAFA]">연구 큐</h2>
        <p className="text-[13px] text-[#71717A]">전략 백테스트 실행 이력과 후보 랭킹</p>
      </div>

      {/* ── 연구 실행 이력 ──────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-[12px] font-semibold text-[#71717A]">실행 이력</h3>

        {runsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
          </div>
        ) : runsQuery.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-[#27272A] bg-[#111113] px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-[#F87171]" />
            <span className="text-[13px] text-[#A1A1AA]">실행 이력을 불러오지 못했습니다</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[#27272A] py-10">
            <FlaskConical className="mb-2 h-8 w-8 text-[#52525B]" />
            <p className="text-[13px] text-[#A1A1AA]">연구 실행 기록이 없습니다</p>
            <p className="mt-1 text-[12px] text-[#71717A]">연구 루프가 실행되면 이력이 표시됩니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#1C1C1F] bg-[#111113]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#1C1C1F]">
                  <th className="px-3 py-2 text-left text-[12px] font-semibold text-[#71717A]">전략</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-left text-[12px] font-semibold text-[#71717A]">상태</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">SHARPE</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">MDD</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">승률</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">거래수</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-center text-[12px] font-semibold text-[#71717A]">승격</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">시각</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-[#1C1C1F] transition-colors hover:bg-[#18181B]">
                    <td className="px-3 py-2 font-medium text-[#FAFAFA]">
                      {run.strategyName ?? run.strategy_id?.slice(0, 8) ?? '-'}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2">{statusBadge(run.status)}</td>
                    <td className={`border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums ${pnlColor(run.metrics?.sharpe)}`}>
                      {fmtNum(run.metrics?.sharpe)}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[#F87171]">
                      {run.metrics?.max_drawdown != null ? `-${fmtNum(run.metrics.max_drawdown, 1)}%` : '-'}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[#A1A1AA]">
                      {run.metrics?.win_rate != null ? `${fmtNum(run.metrics.win_rate, 1)}%` : '-'}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[#A1A1AA]">
                      {run.metrics?.trade_count ?? '-'}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-center">
                      {promotionBadge(run.promotion_status)}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] text-[#71717A]">
                      {fmtDate(run.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 후보 랭킹 ──────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold text-[#71717A]">후보 랭킹</h3>
          {rankedAt && (
            <span className="flex items-center gap-1 text-[11px] text-[#52525B]">
              <Clock className="h-3 w-3" />
              {fmtDate(rankedAt)}
            </span>
          )}
        </div>

        {candidatesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
          </div>
        ) : candidatesQuery.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-[#27272A] bg-[#111113] px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-[#F87171]" />
            <span className="text-[13px] text-[#A1A1AA]">후보 랭킹을 불러오지 못했습니다</span>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[#27272A] py-10">
            <Trophy className="mb-2 h-8 w-8 text-[#52525B]" />
            <p className="text-[13px] text-[#A1A1AA]">후보 전략이 없습니다</p>
            <p className="mt-1 text-[12px] text-[#71717A]">오케스트레이터가 랭킹을 생성하면 표시됩니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#1C1C1F] bg-[#111113]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#1C1C1F]">
                  <th className="px-3 py-2 text-center text-[12px] font-semibold text-[#71717A]">#</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-left text-[12px] font-semibold text-[#71717A]">전략</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-left text-[12px] font-semibold text-[#71717A]">레짐</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">SCORE</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">SHARPE</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">MDD</th>
                  <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold text-[#71717A]">승률</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={`${c.strategy_id}-${c.regime}`} className="border-b border-[#1C1C1F] transition-colors hover:bg-[#18181B]">
                    <td className="px-3 py-2 text-center font-mono text-[12px] tabular-nums text-[#52525B]">{i + 1}</td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 font-medium text-[#FAFAFA]">
                      {c.strategyName ?? c.strategy_id?.slice(0, 8) ?? '-'}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2">
                      <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-[12px] text-[#A1A1AA]">
                        {c.regime}
                      </span>
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[#FAFAFA]">
                      {fmtNum(c.score, 1)}
                    </td>
                    <td className={`border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums ${pnlColor(c.sharpe)}`}>
                      {fmtNum(c.sharpe)}
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[#F87171]">
                      -{fmtNum(c.mdd, 1)}%
                    </td>
                    <td className="border-l border-[#1C1C1F] px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[#A1A1AA]">
                      {fmtNum(c.win_rate, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
