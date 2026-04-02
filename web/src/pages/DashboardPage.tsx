import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import {
  Shield, Activity, ChevronRight, Layers, AlertTriangle,
  Inbox, RefreshCw, Briefcase, TrendingUp, Microscope,
  Zap, Radio, Clock, Eye, EyeOff,
} from 'lucide-react'
import { getApiBase } from '../services/api'

// ─── 타입 ──────────────────────────────────────────────────────────

interface DashboardData {
  regime: {
    regime: string
    btc_price: number
    ema200: number
    rsi14: number
    atr_pct: number
    recorded_at: string
  } | null
  slots: Slot[]
  circuitBreaker: {
    tripped: boolean
    reason: string | null
    trippedAt: string | null
    dailyLoss: number
    dailyLimit: number
  }
  activePositions: { paper: number; live: number }
  todayPnl: { realized: number; unrealized: number; total: number }
}

interface Slot {
  slot_id: string
  asset_key: string
  strategy_id: string
  status: string
}

interface EquitySnapshot {
  total_equity: number
  regime: string
  unrealized_pnl: number
  realized_pnl: number
  recorded_at: string
}

interface RegimeBand {
  regime: string
  btc_price: number
  recorded_at: string
}

interface Position {
  id: string
  asset_key: string
  side: string
  entry_price: number
  current_qty: number
  unrealized_pnl: number
  realized_pnl: number
  status: string
  source: string
  entry_time: string
  stop_price?: number
}

interface Decision {
  id: string
  slot_id: string
  decision_type: string
  status: string
  from_strategy_id: string | null
  to_strategy_id: string | null
  regime: string
  reason_summary: string
  created_at: string
  executed_at: string | null
}

interface ResearchRun {
  id: string
  strategy_id: string
  strategyName: string | null
  status: string
  promotion_status: string | null
  started_at: string | null
  ended_at: string | null
  metrics: {
    total_return: number
    max_drawdown: number
    win_rate: number
    sharpe: number
    trade_count: number
  } | null
}

interface RiskEvent {
  id: string
  event_type: string
  severity: string
  details: Record<string, unknown>
  resolved: boolean
  created_at: string
}

interface RiskStatus {
  circuitBreaker: DashboardData['circuitBreaker']
  recentEvents: RiskEvent[]
}

// ─── API ───────────────────────────────────────────────────────────

const v2 = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${getApiBase()}/api/v2${path}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}

// ─── 훅 ────────────────────────────────────────────────────────────

type DayRange = 7 | 30 | 90

const useDashboard = () =>
  useQuery({ queryKey: ['v2-dash'], queryFn: () => v2<DashboardData>('/dashboard'), refetchInterval: 60_000, staleTime: 30_000 })

const useEquity = (days: DayRange) =>
  useQuery({ queryKey: ['v2-eq', days], queryFn: () => v2<{ data: EquitySnapshot[] }>(`/equity?source=live&days=${days}`), staleTime: 60_000 })

const useRegimeBands = (days: DayRange) =>
  useQuery({ queryKey: ['v2-rb', days], queryFn: () => v2<{ data: RegimeBand[] }>(`/equity/regime-bands?days=${days}`), staleTime: 60_000 })

const usePositions = () =>
  useQuery({ queryKey: ['v2-pos'], queryFn: () => v2<{ paper: Position[]; live: Position[] }>('/positions?status=open'), refetchInterval: 30_000, staleTime: 15_000 })

const useDecisions = () =>
  useQuery({ queryKey: ['v2-dec'], queryFn: () => v2<{ data: Decision[] }>('/decisions?limit=10'), staleTime: 30_000 })

const useResearch = () =>
  useQuery({ queryKey: ['v2-research'], queryFn: () => v2<{ data: ResearchRun[] }>('/research/runs?limit=8'), staleTime: 60_000 })

const useRisk = () =>
  useQuery({ queryKey: ['v2-risk'], queryFn: () => v2<RiskStatus>('/risk/status'), staleTime: 30_000 })

// ─── 유틸 ──────────────────────────────────────────────────────────

const fmtPnl = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const pnlCls = (v: number) => v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-secondary'
const fmtTime = (ts: string) => {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const timeAgo = (ts: string) => {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}
const regimeLabel = (r: string) => r === 'risk_on' ? 'RISK-ON' : r === 'risk_off' ? 'RISK-OFF' : 'NEUTRAL'
const regimeCls = (r: string) =>
  r === 'risk_on' ? 'border-profit bg-[var(--profit-bg)] text-profit'
    : r === 'risk_off' ? 'border-loss bg-[var(--loss-bg)] text-loss'
      : 'border-[var(--border)] bg-[var(--surface-hover)] text-text-secondary'
const regimeBandFill = (r: string) =>
  r === 'risk_on' ? '#4ADE8008' : r === 'risk_off' ? '#F8717108' : '#71717A06'

// ─── 메인 ──────────────────────────────────────────────────────────

export const DashboardPage = () => {
  const [days, setDays] = useState<DayRange>(7)
  const [showShadow, setShowShadow] = useState(false)

  const dash = useDashboard()
  const equity = useEquity(days)
  const bands = useRegimeBands(days)
  const positions = usePositions()
  const decisions = useDecisions()
  const research = useResearch()
  const risk = useRisk()

  const pendingDecisions = (decisions.data?.data ?? []).filter(d => d.status === 'pending')

  return (
    <div className="min-h-0">
      {/* ── PRD 7.1: 상단 상태 바 ──────────────────────────────── */}
      <StatusBar data={dash.data} loading={dash.isLoading} pendingCount={pendingDecisions.length} />

      {/* ── PRD 7.2: 운용 요약 카드 ────────────────────────────── */}
      <SummaryCards data={dash.data} loading={dash.isLoading} />

      {/* ── 메인 2단 레이아웃 ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row">
        {/* 좌측: 오케스트레이션 보드 + 에퀴티 + 최근 판단 */}
        <div className="min-w-0 flex-1 border-b border-[var(--border-subtle)] lg:border-b-0 lg:border-r">
          {/* PRD 7.3: 오케스트레이션 보드 */}
          <OrchestrationBoard slots={dash.data?.slots ?? []} loading={dash.isLoading} error={dash.isError} refetch={dash.refetch} />

          {/* 에퀴티 커브 */}
          <EquityChart equity={equity} bands={bands} days={days} setDays={setDays} showShadow={showShadow} setShowShadow={setShowShadow} />

          {/* 최근 판단 이력 */}
          <Section title="최근 판단" icon={<Zap className="h-3.5 w-3.5" />}>
            <DecisionList decisions={decisions} />
          </Section>
        </div>

        {/* 우측: 포지션 + 연구 + 리스크/승인 */}
        <div className="w-full shrink-0 lg:w-[35%] lg:min-w-[340px]">
          {/* PRD 7.4: 포지션/세션 패널 */}
          <Section title="현재 배치" icon={<Briefcase className="h-3.5 w-3.5" />}>
            <PositionPanel positions={positions} />
          </Section>

          {/* PRD 7.5: 시장 상황 (레짐 상세) */}
          <Section title="시장 상황" icon={<Radio className="h-3.5 w-3.5" />}>
            <MarketPanel regime={dash.data?.regime ?? null} loading={dash.isLoading} />
          </Section>

          {/* PRD 7.6: 연구 루프 현황 */}
          <Section title="연구 루프" icon={<Microscope className="h-3.5 w-3.5" />}>
            <ResearchPanel research={research} />
          </Section>

          {/* PRD 7.7: 리스크/승인/AI 액션 센터 */}
          <Section title="리스크 / 승인" icon={<Shield className="h-3.5 w-3.5" />} count={pendingDecisions.length}>
            <RiskApprovalPanel risk={risk} pendingDecisions={pendingDecisions} />
          </Section>
        </div>
      </div>
    </div>
  )
}

// ─── PRD 7.1: 상단 상태 바 ─────────────────────────────────────────

const StatusBar = ({ data, loading, pendingCount }: {
  data: DashboardData | undefined
  loading: boolean
  pendingCount: number
}) => {
  const cb = data?.circuitBreaker
  const cbPct = cb ? Math.min((cb.dailyLoss / cb.dailyLimit) * 100, 100) : 0

  return (
    <div className="border-b border-[var(--border-subtle)] px-5 py-3">
      {/* 상단 행: 레짐 + KPI */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h2 className="text-[14px] font-semibold text-text-primary">운영실</h2>

        {data?.regime && (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${regimeCls(data.regime.regime)}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${data.regime.regime === 'risk_on' ? 'bg-profit' : data.regime.regime === 'risk_off' ? 'bg-loss' : 'bg-text-muted'}`} />
            {regimeLabel(data.regime.regime)}
          </span>
        )}

        {/* KPI 행 */}
        <div className="flex items-center gap-4 text-[12px]">
          <KpiChip label="오늘 PnL" value={loading ? '--' : `${fmtPnl(data?.todayPnl.total ?? 0)}%`} cls={pnlCls(data?.todayPnl.total ?? 0)} />
          <KpiChip label="활성 슬롯" value={loading ? '--' : `${(data?.slots ?? []).filter(s => s.status === 'active').length}`} />
          <KpiChip label="포지션" value={loading ? '--' : `${data?.activePositions.live ?? 0}실전 / ${data?.activePositions.paper ?? 0}페이퍼`} />
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 rounded bg-[var(--warning-bg)] px-2 py-0.5 text-[12px] font-semibold text-warning">
              <Inbox className="h-3 w-3" />
              승인 대기 {pendingCount}
            </span>
          )}
        </div>
      </div>

      {/* 서킷 브레이커 프로그레스 */}
      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
          <Shield className="h-3 w-3" />
          <span className="font-semibold">서킷 브레이커</span>
        </div>
        <div className="relative h-1.5 flex-1 rounded-full bg-[var(--surface-hover)]">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
              cb?.tripped ? 'bg-loss' : cbPct > 70 ? 'bg-warning' : 'bg-profit'
            }`}
            style={{ width: `${loading ? 0 : cbPct}%` }}
          />
        </div>
        <span className={`font-mono text-[11px] font-medium tabular-nums ${
          cb?.tripped ? 'text-loss' : cbPct > 70 ? 'text-warning' : 'text-text-muted'
        }`}>
          {loading ? '--' : `${cbPct.toFixed(0)}%`}
        </span>
        {cb?.tripped && (
          <span className="flex items-center gap-1 rounded border border-loss bg-[var(--loss-bg)] px-1.5 py-0.5 text-[11px] font-medium text-loss">
            <AlertTriangle className="h-3 w-3" /> 작동 중
          </span>
        )}
      </div>
    </div>
  )
}

const KpiChip = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-text-muted">{label}</span>
    <span className={`font-mono text-[12px] font-medium tabular-nums ${cls ?? 'text-text-primary'}`}>{value}</span>
  </div>
)

// ─── PRD 7.2: 운용 요약 카드 ────────────────────────────────────────

const SummaryCards = ({ data, loading }: { data: DashboardData | undefined; loading: boolean }) => {
  const cb = data?.circuitBreaker
  const dailyPct = cb ? Math.min((cb.dailyLoss / cb.dailyLimit) * 100, 100) : 0

  const items: { label: string; value: string; warn?: boolean }[] = [
    { label: '활성 전략', value: loading ? '--' : `${(data?.slots ?? []).filter(s => s.status === 'active').length}개` },
    { label: '페이퍼 포지션', value: loading ? '--' : `${data?.activePositions.paper ?? 0}개` },
    { label: '실전 포지션', value: loading ? '--' : `${data?.activePositions.live ?? 0}개` },
    { label: '일 손실 진행', value: loading ? '--' : `${dailyPct.toFixed(1)}%`, warn: dailyPct > 70 },
  ]

  return (
    <div className="grid grid-cols-2 border-b border-[var(--border-subtle)] sm:grid-cols-4">
      {items.map(item => (
        <div key={item.label} className="border-b border-r border-[var(--border-subtle)] px-4 py-3 last:border-r-0 sm:border-b-0">
          <p className="text-[12px] font-semibold text-text-muted">{item.label}</p>
          <p className={`mt-0.5 font-mono text-[18px] font-semibold tabular-nums ${item.warn ? 'text-warning' : 'text-text-primary'}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── PRD 7.3: 오케스트레이션 보드 ───────────────────────────────────

const OrchestrationBoard = ({ slots, loading, error, refetch }: {
  slots: Slot[]
  loading: boolean
  error: boolean
  refetch: () => void
}) => (
  <div className="border-b border-[var(--border-subtle)] px-5 py-4">
    <SectionHead title="오케스트레이션 보드" icon={<Layers className="h-3.5 w-3.5" />} />
    {loading ? <SkeletonRows count={3} /> : error ? (
      <ErrorBlock message="슬롯 로드 실패" onRetry={refetch} />
    ) : slots.length === 0 ? (
      <EmptyState icon={<Layers className="h-8 w-8" />} message="배치된 슬롯이 없습니다" sub="오케스트레이터가 전략을 배치하면 여기에 표시됩니다" />
    ) : (
      <div className="mt-3 space-y-0">
        {slots.map(slot => (
          <div key={slot.slot_id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0">
            <span className={`h-2 w-2 rounded-full ${slot.status === 'active' ? 'bg-profit' : 'bg-text-faint'}`} />
            <span className="text-[13px] font-medium text-text-primary">{slot.asset_key}</span>
            <span className="text-[12px] text-text-muted">{slot.strategy_id}</span>
            <span className={`ml-auto rounded px-1.5 py-0.5 text-[12px] font-medium ${
              slot.status === 'active' ? 'bg-[var(--profit-bg)] text-profit' : 'bg-[var(--surface-hover)] text-text-muted'
            }`}>
              {slot.status === 'active' ? '운용 중' : slot.status}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
          </div>
        ))}
      </div>
    )}
  </div>
)

// ─── 에퀴티 차트 ────────────────────────────────────────────────────

const EquityChart = ({ equity, bands, days, setDays, showShadow, setShowShadow }: {
  equity: ReturnType<typeof useEquity>
  bands: ReturnType<typeof useRegimeBands>
  days: DayRange
  setDays: (d: DayRange) => void
  showShadow: boolean
  setShowShadow: (v: boolean) => void
}) => {
  const eqData = equity.data?.data ?? []
  const bandData = bands.data?.data ?? []

  const bandRanges: { x1: string; x2: string; color: string }[] = []
  if (bandData.length > 1) {
    let start = 0
    for (let i = 1; i < bandData.length; i++) {
      const cur = bandData[i]
      const st = bandData[start]
      if (!cur || !st) continue
      if (cur.regime !== st.regime || i === bandData.length - 1) {
        bandRanges.push({ x1: st.recorded_at, x2: cur.recorded_at, color: regimeBandFill(st.regime) })
        start = i
      }
    }
  }

  return (
    <div className="border-b border-[var(--border-subtle)] px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <SectionHead title="에퀴티 커브" icon={<Activity className="h-3.5 w-3.5" />} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShadow(!showShadow)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors duration-100 ${
              showShadow ? 'border-[var(--border)] bg-[var(--surface-hover)] text-text-primary' : 'border-[var(--border-subtle)] text-text-muted hover:border-[var(--border)]'
            }`}
          >
            {showShadow ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            섀도우
          </button>
          <div className="flex rounded-md border border-[var(--border-subtle)]">
            {([7, 30, 90] as DayRange[]).map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-[12px] font-medium transition-colors duration-100 first:rounded-l-md last:rounded-r-md ${
                  days === d ? 'bg-[var(--surface-hover)] text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
              >{d}D</button>
            ))}
          </div>
        </div>
      </div>

      {equity.isLoading ? (
        <div className="flex h-[260px] items-center justify-center"><div className="h-full w-full skeleton-shimmer rounded-md" /></div>
      ) : equity.isError ? (
        <ErrorBlock message="에퀴티 데이터 로드 실패" onRetry={() => equity.refetch()} />
      ) : eqData.length === 0 ? (
        <EmptyState icon={<Activity className="h-8 w-8" />} message="에퀴티 데이터가 아직 없습니다" sub="운영을 시작하면 에퀴티 커브가 표시됩니다" />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={eqData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {bandRanges.map((b, i) => (
                <ReferenceArea key={i} x1={b.x1} x2={b.x2} fill={b.color} strokeOpacity={0} />
              ))}
              <XAxis dataKey="recorded_at" tickFormatter={fmtTime} tick={{ fontSize: 11, fill: '#71717A', fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#27272A' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#71717A', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
              <Tooltip contentStyle={{ background: '#111113', border: '1px solid #27272A', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono' }} labelFormatter={v => fmtTime(String(v ?? ''))} formatter={v => [`$${Number(v ?? 0).toLocaleString()}`, '에퀴티']} />
              {showShadow && <Area type="monotone" dataKey="unrealized_pnl" stroke="#52525B" strokeWidth={1} fill="none" dot={false} name="미실현" />}
              <Area type="monotone" dataKey="total_equity" stroke="#4ADE80" strokeWidth={2} fill="url(#eqGrad)" dot={false} name="에퀴티" />
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ADE80" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#4ADE80" stopOpacity={0} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── 최근 판단 ──────────────────────────────────────────────────────

const DecisionList = ({ decisions }: { decisions: ReturnType<typeof useDecisions> }) => {
  const list = (decisions.data?.data ?? []).slice(0, 5)

  if (decisions.isLoading) return <SkeletonRows count={3} />
  if (decisions.isError) return <ErrorBlock message="판단 이력 로드 실패" onRetry={() => decisions.refetch()} />
  if (list.length === 0) return <EmptyState icon={<Zap className="h-8 w-8" />} message="아직 판단 이력이 없습니다" />

  return (
    <div className="space-y-0">
      {list.map(d => (
        <div key={d.id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] font-medium ${regimeCls(d.regime)}`}>
            {regimeLabel(d.regime)}
          </span>
          <span className="flex-1 truncate text-[13px] text-text-primary">{d.reason_summary || d.decision_type}</span>
          <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${
            d.status === 'pending' ? 'bg-[var(--warning-bg)] text-warning'
              : d.status === 'executed' ? 'bg-[var(--profit-bg)] text-profit'
                : 'bg-[var(--surface-hover)] text-text-muted'
          }`}>
            {d.status === 'pending' ? '대기' : d.status === 'executed' ? '실행됨' : d.status}
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] text-text-muted tabular-nums">{timeAgo(d.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── PRD 7.4: 포지션/세션 패널 ──────────────────────────────────────

const PositionPanel = ({ positions }: { positions: ReturnType<typeof usePositions> }) => {
  const all = [...(positions.data?.live ?? []), ...(positions.data?.paper ?? [])]

  if (positions.isLoading) return <SkeletonRows count={2} />
  if (positions.isError) return <ErrorBlock message="포지션 로드 실패" onRetry={() => positions.refetch()} />
  if (all.length === 0) return <EmptyState icon={<Briefcase className="h-8 w-8" />} message="활성 포지션 없음" />

  return (
    <div className="space-y-0">
      {all.map(pos => (
        <div key={pos.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0">
          <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${
            pos.source === 'live' ? 'bg-[var(--info-bg)] text-info' : 'bg-[var(--surface-hover)] text-text-muted'
          }`}>
            {pos.source === 'live' ? '실전' : '페이퍼'}
          </span>
          <span className="text-[13px] font-medium text-text-primary">{pos.asset_key}</span>
          <span className={`text-[12px] font-medium ${pos.side === 'long' ? 'text-profit' : 'text-loss'}`}>
            {pos.side === 'long' ? 'LONG' : 'SHORT'}
          </span>
          <span className="ml-auto font-mono text-[13px] tabular-nums text-text-secondary">${pos.entry_price.toLocaleString()}</span>
          <span className={`font-mono text-[13px] font-medium tabular-nums ${pnlCls(pos.unrealized_pnl)}`}>
            {fmtPnl(pos.unrealized_pnl)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── PRD 7.5: 시장 상황 패널 ────────────────────────────────────────

const MarketPanel = ({ regime, loading }: {
  regime: DashboardData['regime']
  loading: boolean
}) => {
  if (loading) return <SkeletonRows count={4} />
  if (!regime) return <EmptyState icon={<Radio className="h-8 w-8" />} message="레짐 데이터 없음" />

  return (
    <div className="space-y-0">
      <DataRow label="BTC 가격" value={`$${regime.btc_price.toLocaleString()}`} />
      <DataRow label="EMA(200)" value={`$${regime.ema200.toLocaleString()}`} />
      <DataRow label="RSI(14)" value={regime.rsi14.toFixed(1)} warn={regime.rsi14 > 70 || regime.rsi14 < 30} />
      <DataRow label="ATR%" value={`${regime.atr_pct.toFixed(2)}%`} warn={regime.atr_pct > 5} />
      <DataRow label="업데이트" value={timeAgo(regime.recorded_at)} />
    </div>
  )
}

// ─── PRD 7.6: 연구 루프 현황 ────────────────────────────────────────

const ResearchPanel = ({ research }: { research: ReturnType<typeof useResearch> }) => {
  const runs = research.data?.data ?? []
  const running = runs.filter(r => r.status === 'running')
  const queued = runs.filter(r => r.status === 'queued')
  const completed = runs.filter(r => r.status === 'completed').slice(0, 3)

  if (research.isLoading) return <SkeletonRows count={3} />
  if (research.isError) return <ErrorBlock message="연구 데이터 로드 실패" onRetry={() => research.refetch()} />
  if (runs.length === 0) return <EmptyState icon={<Microscope className="h-8 w-8" />} message="연구 실행 이력 없음" sub="연구 루프가 시작되면 여기에 표시됩니다" />

  return (
    <div className="space-y-2">
      {/* 실행 중 / 대기 */}
      <div className="flex gap-3 text-[12px]">
        <span className="text-text-muted">실행 중 <span className="font-mono font-medium text-text-primary">{running.length}</span></span>
        <span className="text-text-muted">대기 <span className="font-mono font-medium text-text-primary">{queued.length}</span></span>
      </div>

      {/* 최근 완료 */}
      {completed.length > 0 && (
        <div className="space-y-0">
          {completed.map(run => (
            <div key={run.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
              <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${
                run.promotion_status === 'promoted_to_paper' ? 'bg-[var(--profit-bg)] text-profit' : 'bg-[var(--surface-hover)] text-text-muted'
              }`}>
                {run.promotion_status === 'promoted_to_paper' ? '승격' : '완료'}
              </span>
              <span className="flex-1 truncate text-[13px] text-text-primary">{run.strategyName ?? run.strategy_id}</span>
              {run.metrics && (
                <span className="font-mono text-[11px] text-text-muted tabular-nums">
                  S {run.metrics.sharpe.toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PRD 7.7: 리스크/승인/AI 액션 센터 ──────────────────────────────

const RiskApprovalPanel = ({ risk, pendingDecisions }: {
  risk: ReturnType<typeof useRisk>
  pendingDecisions: Decision[]
}) => {
  const events = (risk.data?.recentEvents ?? []).filter(e => !e.resolved).slice(0, 3)

  if (risk.isLoading) return <SkeletonRows count={2} />

  return (
    <div className="space-y-3">
      {/* 미해결 리스크 이벤트 */}
      {events.length > 0 && (
        <div className="space-y-0">
          {events.map(ev => (
            <div key={ev.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
              <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${ev.severity === 'critical' ? 'text-loss' : 'text-warning'}`} />
              <span className="flex-1 truncate text-[13px] text-text-primary">{ev.event_type}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                ev.severity === 'critical' ? 'bg-[var(--loss-bg)] text-loss' : 'bg-[var(--warning-bg)] text-warning'
              }`}>
                {ev.severity}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 승인 대기 */}
      {pendingDecisions.length > 0 ? (
        <div className="space-y-0">
          {pendingDecisions.map(d => (
            <div key={d.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
              <Clock className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="flex-1 truncate text-[13px] text-text-primary">{d.reason_summary || d.decision_type}</span>
              <span className="whitespace-nowrap font-mono text-[11px] text-text-muted tabular-nums">{timeAgo(d.created_at)}</span>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={<Shield className="h-8 w-8" />} message="리스크 이벤트 없음" />
      ) : null}
    </div>
  )
}

// ─── 공용 컴포넌트 ──────────────────────────────────────────────────

const Section = ({ title, icon, count, children }: {
  title: string; icon: React.ReactNode; count?: number; children: React.ReactNode
}) => (
  <div className="border-b border-[var(--border-subtle)] px-5 py-4">
    <SectionHead title={title} icon={icon} count={count} />
    <div className="mt-3">{children}</div>
  </div>
)

const SectionHead = ({ title, icon, count }: { title: string; icon: React.ReactNode; count?: number }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-text-muted">{icon}</span>
    <h3 className="text-[12px] font-semibold text-text-muted">{title}</h3>
    {count !== undefined && count > 0 && (
      <span className="ml-1 rounded-full bg-[var(--warning-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-warning tabular-nums">{count}</span>
    )}
  </div>
)

const DataRow = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
    <span className="text-[12px] text-text-muted">{label}</span>
    <span className={`font-mono text-[13px] font-medium tabular-nums ${warn ? 'text-warning' : 'text-text-primary'}`}>{value}</span>
  </div>
)

const SkeletonRows = ({ count }: { count: number }) => (
  <div className="mt-3 space-y-2">
    {Array.from({ length: count }).map((_, i) => <div key={i} className="h-7 skeleton-shimmer rounded" />)}
  </div>
)

const EmptyState = ({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[var(--border)] py-8">
    <span className="text-text-faint">{icon}</span>
    <p className="mt-2 text-[13px] text-text-secondary">{message}</p>
    {sub && <p className="mt-0.5 text-[12px] text-text-muted">{sub}</p>}
  </div>
)

const ErrorBlock = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="mt-3 flex items-center gap-2 rounded-md border border-loss bg-[var(--loss-bg)] px-3 py-2.5">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-loss" />
    <span className="text-[13px] text-loss">{message}</span>
    <button onClick={onRetry} className="ml-auto flex items-center gap-1 text-[12px] font-medium text-loss hover:underline">
      <RefreshCw className="h-3 w-3" /> 재시도
    </button>
  </div>
)
