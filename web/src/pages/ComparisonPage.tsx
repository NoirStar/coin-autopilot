import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  GitCompareArrows,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TriangleAlert,
} from 'lucide-react'
import { getApiBase } from '@/services/api'

// ─── 타입 ──────────────────────────────────────────────────────

interface BacktestMetrics {
  total_return: number
  max_drawdown: number
  win_rate: number
  sharpe: number
  trade_count: number
}

interface PaperMetrics {
  initialCapital: number
  currentEquity: number
  drawdown: number
  returnPct: number
  status: string
  startedAt: string
}

interface LiveMetrics {
  totalRealized: number
  totalUnrealized: number
  positionCount: number
}

interface StrategyComparison {
  strategyId: string
  name: string
  status: string
  backtest: BacktestMetrics | null
  paper: PaperMetrics | null
  live: LiveMetrics | null
}

// ─── 유틸 ──────────────────────────────────────────────────────

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '-'
  return v.toFixed(decimals)
}

function pnlColor(v: number | null | undefined): string {
  if (v == null) return 'text-[#A1A1AA]'
  return v >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
}

function calcDivergence(backtest: BacktestMetrics | null, paper: PaperMetrics | null): number | null {
  if (!backtest || !paper) return null
  const btReturn = backtest.total_return
  const ppReturn = paper.returnPct
  if (btReturn === 0) return null
  return Math.abs(((ppReturn - btReturn) / Math.abs(btReturn)) * 100)
}

/** 얇은 수평 비교 바 */
function MetricBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.min(Math.abs(value) / max * 100, 100)
  return (
    <div className="mt-0.5 h-[3px] w-full rounded-full bg-[#1C1C1F]">
      <div
        className="h-full rounded-full transition-all duration-200"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ─── 컴포넌트 ──────────────────────────────────────────────────

export function ComparisonPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const query = useQuery<{ data: StrategyComparison[] }>({
    queryKey: ['v2-strategies-comparison'],
    queryFn: () => fetch(`${getApiBase()}/api/v2/strategies/comparison`).then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const strategies = query.data?.data ?? []

  // 바 차트 스케일 계산
  const maxSharpe = Math.max(
    ...strategies.map((s) => Math.max(
      Math.abs(s.backtest?.sharpe ?? 0),
      Math.abs(s.paper?.returnPct != null ? (s.paper.returnPct / 10) : 0),
    )),
    1,
  )
  const maxMdd = Math.max(
    ...strategies.map((s) => Math.max(
      Math.abs(s.backtest?.max_drawdown ?? 0),
      Math.abs(s.paper?.drawdown ?? 0),
    )),
    1,
  )

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#FAFAFA]">전략 비교</h2>
        <p className="text-[13px] text-[#71717A]">백테스트, 페이퍼, 실전 성과를 한 눈에 비교</p>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
        </div>
      ) : query.isError ? (
        <div className="flex items-center gap-2 rounded-md border border-[#27272A] bg-[#111113] px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-[#F87171]" />
          <span className="text-[13px] text-[#A1A1AA]">비교 데이터를 불러오지 못했습니다</span>
        </div>
      ) : strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[#27272A] py-12">
          <GitCompareArrows className="mb-2 h-8 w-8 text-[#52525B]" />
          <p className="text-[13px] text-[#A1A1AA]">등록된 전략이 없습니다</p>
          <p className="mt-1 text-[12px] text-[#71717A]">전략이 등록되면 비교 데이터가 표시됩니다</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#1C1C1F] bg-[#111113]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#1C1C1F]">
                <th className="px-3 py-2 text-left text-[12px] font-semibold text-[#71717A]" />
                <th className="px-3 py-2 text-left text-[12px] font-semibold text-[#71717A]">전략</th>
                <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-wider text-[#71717A]">BT SHARPE</th>
                <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-wider text-[#71717A]">BT MDD</th>
                <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-wider text-[#71717A]">PAPER SHARPE</th>
                <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-wider text-[#71717A]">PAPER MDD</th>
                <th className="border-l border-[#1C1C1F] px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-wider text-[#71717A]">LIVE PnL</th>
                <th className="border-l border-[#1C1C1F] px-3 py-2 text-center text-[12px] font-semibold text-[#71717A]">괴리</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => {
                const divergence = calcDivergence(s.backtest, s.paper)
                const isExpanded = expandedId === s.strategyId
                const hasWarning = divergence != null && divergence > 30

                return (
                  <ComparisonRow
                    key={s.strategyId}
                    strategy={s}
                    divergence={divergence}
                    hasWarning={hasWarning}
                    isExpanded={isExpanded}
                    maxSharpe={maxSharpe}
                    maxMdd={maxMdd}
                    onToggle={() => toggleExpand(s.strategyId)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 행 컴포넌트 ───────────────────────────────────────────────

function ComparisonRow({
  strategy: s,
  divergence,
  hasWarning,
  isExpanded,
  maxSharpe,
  maxMdd,
  onToggle,
}: {
  strategy: StrategyComparison
  divergence: number | null
  hasWarning: boolean
  isExpanded: boolean
  maxSharpe: number
  maxMdd: number
  onToggle: () => void
}) {
  // 페이퍼에서 Sharpe 근사 (수익률/10을 프록시로 사용)
  const paperSharpeProxy = s.paper?.returnPct != null ? s.paper.returnPct / 10 : null

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[#1C1C1F] transition-colors hover:bg-[#18181B]"
        onClick={onToggle}
      >
        {/* 토글 */}
        <td className="w-8 px-2 py-2 text-[#52525B]">
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </td>

        {/* 전략명 */}
        <td className="px-3 py-2 font-medium text-[#FAFAFA]">{s.name}</td>

        {/* BT Sharpe */}
        <td className="border-l border-[#1C1C1F] px-3 py-2 text-right">
          <span className={`font-mono text-[13px] tabular-nums ${pnlColor(s.backtest?.sharpe)}`}>
            {fmtNum(s.backtest?.sharpe)}
          </span>
          {s.backtest?.sharpe != null && (
            <MetricBar value={s.backtest.sharpe} max={maxSharpe} color="#4ADE80" />
          )}
        </td>

        {/* BT MDD */}
        <td className="border-l border-[#1C1C1F] px-3 py-2 text-right">
          <span className="font-mono text-[13px] tabular-nums text-[#F87171]">
            {s.backtest?.max_drawdown != null ? `-${fmtNum(s.backtest.max_drawdown, 1)}%` : '-'}
          </span>
          {s.backtest?.max_drawdown != null && (
            <MetricBar value={s.backtest.max_drawdown} max={maxMdd} color="#F87171" />
          )}
        </td>

        {/* Paper Sharpe (proxy) */}
        <td className="border-l border-[#1C1C1F] px-3 py-2 text-right">
          <span className={`font-mono text-[13px] tabular-nums ${pnlColor(paperSharpeProxy)}`}>
            {paperSharpeProxy != null ? fmtNum(paperSharpeProxy) : '-'}
          </span>
          {paperSharpeProxy != null && (
            <MetricBar value={paperSharpeProxy} max={maxSharpe} color="#60A5FA" />
          )}
        </td>

        {/* Paper MDD */}
        <td className="border-l border-[#1C1C1F] px-3 py-2 text-right">
          <span className="font-mono text-[13px] tabular-nums text-[#F87171]">
            {s.paper?.drawdown != null ? `-${fmtNum(s.paper.drawdown, 1)}%` : '-'}
          </span>
          {s.paper?.drawdown != null && (
            <MetricBar value={s.paper.drawdown} max={maxMdd} color="#F87171" />
          )}
        </td>

        {/* Live PnL */}
        <td className="border-l border-[#1C1C1F] px-3 py-2 text-right">
          {s.live != null ? (
            <span className={`font-mono text-[13px] tabular-nums ${pnlColor(s.live.totalRealized + s.live.totalUnrealized)}`}>
              {(s.live.totalRealized + s.live.totalUnrealized) >= 0 ? '+' : ''}
              {fmtNum(s.live.totalRealized + s.live.totalUnrealized)}
            </span>
          ) : (
            <span className="font-mono text-[13px] tabular-nums text-[#52525B]">-</span>
          )}
        </td>

        {/* 괴리 */}
        <td className="border-l border-[#1C1C1F] px-3 py-2 text-center">
          {divergence != null ? (
            hasWarning ? (
              <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#FBBF2410] px-2 py-0.5 text-[12px] font-medium text-[#FBBF24]">
                <TriangleAlert className="h-3 w-3" />
                {fmtNum(divergence, 0)}%
              </span>
            ) : (
              <span className="font-mono text-[12px] tabular-nums text-[#A1A1AA]">{fmtNum(divergence, 0)}%</span>
            )
          ) : (
            <span className="text-[#52525B]">-</span>
          )}
        </td>
      </tr>

      {/* 확장 상세 */}
      {isExpanded && (
        <tr className="border-b border-[#1C1C1F] bg-[#0A0A0B]">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* 백테스트 상세 */}
              <DetailBlock title="백테스트">
                {s.backtest ? (
                  <dl className="space-y-1.5 text-[12px]">
                    <DetailRow label="총 수익률" value={`${s.backtest.total_return >= 0 ? '+' : ''}${fmtNum(s.backtest.total_return, 1)}%`} color={pnlColor(s.backtest.total_return)} />
                    <DetailRow label="SHARPE" value={fmtNum(s.backtest.sharpe)} color={pnlColor(s.backtest.sharpe)} />
                    <DetailRow label="MDD" value={`-${fmtNum(s.backtest.max_drawdown, 1)}%`} color="text-[#F87171]" />
                    <DetailRow label="승률" value={`${fmtNum(s.backtest.win_rate, 1)}%`} />
                    <DetailRow label="거래수" value={`${s.backtest.trade_count}`} />
                  </dl>
                ) : (
                  <p className="text-[12px] text-[#52525B]">데이터 없음</p>
                )}
              </DetailBlock>

              {/* 페이퍼 상세 */}
              <DetailBlock title="페이퍼">
                {s.paper ? (
                  <dl className="space-y-1.5 text-[12px]">
                    <DetailRow label="수익률" value={`${s.paper.returnPct >= 0 ? '+' : ''}${fmtNum(s.paper.returnPct, 1)}%`} color={pnlColor(s.paper.returnPct)} />
                    <DetailRow label="현재 자산" value={`$${s.paper.currentEquity.toLocaleString()}`} />
                    <DetailRow label="드로다운" value={`-${fmtNum(s.paper.drawdown, 1)}%`} color="text-[#F87171]" />
                    <DetailRow label="상태" value={s.paper.status} />
                    <DetailRow label="시작일" value={new Date(s.paper.startedAt).toLocaleDateString('ko-KR')} />
                  </dl>
                ) : (
                  <p className="text-[12px] text-[#52525B]">데이터 없음</p>
                )}
              </DetailBlock>

              {/* 실전 상세 */}
              <DetailBlock title="실전">
                {s.live ? (
                  <dl className="space-y-1.5 text-[12px]">
                    <DetailRow label="실현 PnL" value={`${s.live.totalRealized >= 0 ? '+' : ''}${fmtNum(s.live.totalRealized)}`} color={pnlColor(s.live.totalRealized)} />
                    <DetailRow label="미실현 PnL" value={`${s.live.totalUnrealized >= 0 ? '+' : ''}${fmtNum(s.live.totalUnrealized)}`} color={pnlColor(s.live.totalUnrealized)} />
                    <DetailRow label="포지션수" value={`${s.live.positionCount}`} />
                  </dl>
                ) : (
                  <p className="text-[12px] text-[#52525B]">데이터 없음</p>
                )}
              </DetailBlock>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#1C1C1F] bg-[#111113] p-3">
      <h4 className="mb-2 text-[12px] font-semibold text-[#71717A]">{title}</h4>
      {children}
    </div>
  )
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#71717A]">{label}</dt>
      <dd className={`font-mono tabular-nums ${color ?? 'text-[#A1A1AA]'}`}>{value}</dd>
    </div>
  )
}
