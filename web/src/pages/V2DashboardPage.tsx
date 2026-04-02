import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import {
  Shield, Activity, Clock, ChevronRight, Layers, AlertTriangle,
  BarChart3, Inbox, RefreshCw, Eye, EyeOff, Briefcase,
} from 'lucide-react'
import { getApiBase } from '../services/api'

// ─── 타입 정의 ────────────────────────────────────────────────────

interface EquitySnapshot {
  total_equity: number
  regime: string
  active_strategies: string[]
  unrealized_pnl: number
  realized_pnl: number
  recorded_at: string
}

interface RegimeBand {
  regime: string
  btc_price: number
  recorded_at: string
}

interface DashboardData {
  regime: {
    regime: string
    btc_price: number
    ema200: number
    rsi14: number
    atr_pct: number
    recorded_at: string
  } | null
  slots: Array<{
    slot_id: string
    asset_key: string
    strategy_id: string
    status: string
  }>
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

// ─── API 유틸 ─────────────────────────────────────────────────────

const v2Fetch = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${getApiBase()}/api/v2${path}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}

// ─── 훅 ───────────────────────────────────────────────────────────

type DayRange = 7 | 30 | 90

const useV2Dashboard = () =>
  useQuery({
    queryKey: ['v2-dashboard'],
    queryFn: () => v2Fetch<DashboardData>('/dashboard'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

const useEquity = (days: DayRange) =>
  useQuery({
    queryKey: ['v2-equity', days],
    queryFn: () => v2Fetch<{ data: EquitySnapshot[] }>(`/equity?source=live&days=${days}`),
    staleTime: 60_000,
  })

const useRegimeBands = (days: DayRange) =>
  useQuery({
    queryKey: ['v2-regime-bands', days],
    queryFn: () => v2Fetch<{ data: RegimeBand[] }>(`/equity/regime-bands?days=${days}`),
    staleTime: 60_000,
  })

const usePositions = () =>
  useQuery({
    queryKey: ['v2-positions-open'],
    queryFn: () => v2Fetch<{ paper: Position[]; live: Position[] }>('/positions?status=open'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

const useDecisions = () =>
  useQuery({
    queryKey: ['v2-decisions'],
    queryFn: () => v2Fetch<{ data: Decision[] }>('/decisions?limit=10'),
    staleTime: 30_000,
  })

// ─── 유틸 ─────────────────────────────────────────────────────────

const formatPnl = (v: number): string => {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

const pnlColor = (v: number): string =>
  v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-text-secondary'

const formatTime = (ts: string): string => {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const getTimeAgo = (ts: string): string => {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

const regimeLabel = (r: string): string => {
  if (r === 'risk_on') return 'RISK-ON'
  if (r === 'risk_off') return 'RISK-OFF'
  return 'NEUTRAL'
}

const regimeStyle = (r: string): string => {
  if (r === 'risk_on') return 'border-profit bg-[var(--profit-bg)] text-profit'
  if (r === 'risk_off') return 'border-loss bg-[var(--loss-bg)] text-loss'
  return 'border-[var(--border)] bg-[var(--surface-hover)] text-text-secondary'
}

const regimeBandColor = (r: string): string => {
  if (r === 'risk_on') return '#4ADE8008'
  if (r === 'risk_off') return '#F8717108'
  return '#71717A06'
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────

export const V2DashboardPage = () => {
  const [days, setDays] = useState<DayRange>(7)
  const [showShadow, setShowShadow] = useState(false)

  const dashboard = useV2Dashboard()
  const equity = useEquity(days)
  const regimeBands = useRegimeBands(days)
  const positions = usePositions()
  const decisions = useDecisions()

  const pendingDecisions = (decisions.data?.data ?? []).filter(d => d.status === 'pending')
  const recentDecisions = (decisions.data?.data ?? []).slice(0, 5)

  return (
    <div className="space-y-0">
      {/* 헤더 — 서킷 브레이커 + 레짐 */}
      <DashboardHeader dashboard={dashboard.data} isLoading={dashboard.isLoading} />

      {/* 메인 레이아웃: 70/30 */}
      <div className="flex flex-col gap-0 lg:flex-row">
        {/* 좌측 — 증명 워크스페이스 (70%) */}
        <div className="min-w-0 flex-1 border-b border-[var(--border-subtle)] lg:border-b-0 lg:border-r">
          <ProofChart
            equity={equity}
            regimeBands={regimeBands}
            days={days}
            setDays={setDays}
            showShadow={showShadow}
            setShowShadow={setShowShadow}
          />

          {/* 최근 판단 */}
          <div className="border-t border-[var(--border-subtle)] px-5 py-4">
            <SectionHeading title="최근 판단" icon={<BarChart3 className="h-3.5 w-3.5" />} />
            {decisions.isLoading ? (
              <SkeletonRows count={3} />
            ) : decisions.isError ? (
              <ErrorBlock message="판단 이력 로드 실패" onRetry={() => decisions.refetch()} />
            ) : recentDecisions.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-8 w-8" />} message="아직 판단 이력이 없습니다" />
            ) : (
              <div className="mt-3 space-y-0">
                {recentDecisions.map(d => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
                  >
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] font-medium ${regimeStyle(d.regime)}`}>
                      {regimeLabel(d.regime)}
                    </span>
                    <span className="flex-1 truncate text-[13px] text-text-primary">
                      {d.reason_summary || d.decision_type}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${
                      d.status === 'pending'
                        ? 'bg-[var(--warning-bg)] text-warning'
                        : d.status === 'executed'
                          ? 'bg-[var(--profit-bg)] text-profit'
                          : 'bg-[var(--surface-hover)] text-text-muted'
                    }`}>
                      {d.status === 'pending' ? '대기' : d.status === 'executed' ? '실행됨' : d.status}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[11px] text-text-muted tabular-nums">
                      {getTimeAgo(d.created_at)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측 — 커맨드 레일 (30%) */}
        <div className="w-full shrink-0 lg:w-[30%] lg:min-w-[320px]">
          <CommandRail
            dashboard={dashboard}
            positions={positions}
            pendingDecisions={pendingDecisions}
          />
        </div>
      </div>
    </div>
  )
}

// ─── 헤더 ─────────────────────────────────────────────────────────

const DashboardHeader = ({
  dashboard,
  isLoading,
}: {
  dashboard: DashboardData | undefined
  isLoading: boolean
}) => {
  const cb = dashboard?.circuitBreaker

  // RESET 카운트다운 (KST 09:00)
  const getResetCountdown = (): string => {
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const nextReset = new Date(kst)
    nextReset.setUTCHours(0, 0, 0, 0) // KST 09:00 = UTC 00:00
    if (kst.getUTCHours() >= 0) nextReset.setUTCDate(nextReset.getUTCDate() + 1)
    const diff = nextReset.getTime() - kst.getTime()
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    const s = Math.floor((diff % 60_000) / 1_000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const cbProgress = cb ? Math.min((cb.dailyLoss / cb.dailyLimit) * 100, 100) : 0
  const cbTripped = cb?.tripped ?? false

  return (
    <div className="border-b border-[var(--border-subtle)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {/* 타이틀 */}
        <h2 className="text-lg font-semibold text-text-primary">V2 운영실</h2>

        {/* 레짐 배지 */}
        {dashboard?.regime && (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${regimeStyle(dashboard.regime.regime)}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              dashboard.regime.regime === 'risk_on' ? 'bg-profit' : dashboard.regime.regime === 'risk_off' ? 'bg-loss' : 'bg-text-muted'
            }`} />
            {regimeLabel(dashboard.regime.regime)}
          </span>
        )}

        {/* RESET 카운트다운 */}
        <div className="flex items-center gap-1.5 text-[12px]">
          <Clock className="h-3 w-3 text-warning" />
          <span className="font-mono text-[12px] font-medium tracking-wider text-warning tabular-nums">
            RESET {getResetCountdown()}
          </span>
        </div>

        {/* 오늘 PnL */}
        {dashboard?.todayPnl && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-text-muted">오늘 PnL</span>
            <span className={`font-mono text-[13px] font-semibold tabular-nums ${pnlColor(dashboard.todayPnl.total)}`}>
              {formatPnl(dashboard.todayPnl.total)}%
            </span>
          </div>
        )}
      </div>

      {/* 서킷 브레이커 프로그레스 바 */}
      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
          <Shield className="h-3 w-3" />
          <span className="font-semibold">서킷 브레이커</span>
        </div>
        <div className="relative flex-1 h-1.5 rounded-full bg-[var(--surface-hover)]">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
              cbTripped ? 'bg-loss' : cbProgress > 70 ? 'bg-warning' : 'bg-profit'
            }`}
            style={{ width: `${isLoading ? 0 : cbProgress}%` }}
          />
        </div>
        <span className={`font-mono text-[11px] font-medium tabular-nums ${
          cbTripped ? 'text-loss' : cbProgress > 70 ? 'text-warning' : 'text-text-muted'
        }`}>
          {isLoading ? '--' : `${cbProgress.toFixed(0)}%`}
        </span>
        {cbTripped && (
          <span className="flex items-center gap-1 rounded border border-loss bg-[var(--loss-bg)] px-1.5 py-0.5 text-[11px] font-medium text-loss">
            <AlertTriangle className="h-3 w-3" />
            작동 중
          </span>
        )}
      </div>
    </div>
  )
}

// ─── 증명 차트 ────────────────────────────────────────────────────

const ProofChart = ({
  equity,
  regimeBands,
  days,
  setDays,
  showShadow,
  setShowShadow,
}: {
  equity: ReturnType<typeof useEquity>
  regimeBands: ReturnType<typeof useRegimeBands>
  days: DayRange
  setDays: (d: DayRange) => void
  showShadow: boolean
  setShowShadow: (v: boolean) => void
}) => {
  const equityData = equity.data?.data ?? []
  const bands = regimeBands.data?.data ?? []

  // 레짐 밴드 구간 계산
  const bandRanges: Array<{ x1: string; x2: string; color: string }> = []
  if (bands.length > 1) {
    let start = 0
    for (let i = 1; i < bands.length; i++) {
      if (bands[i].regime !== bands[start].regime || i === bands.length - 1) {
        bandRanges.push({
          x1: bands[start].recorded_at,
          x2: bands[i].recorded_at,
          color: regimeBandColor(bands[start].regime),
        })
        start = i
      }
    }
  }

  const dayOptions: DayRange[] = [7, 30, 90]

  return (
    <div className="px-5 py-4">
      {/* 차트 컨트롤 */}
      <div className="mb-3 flex items-center justify-between">
        <SectionHeading title="에퀴티 커브" icon={<Activity className="h-3.5 w-3.5" />} />
        <div className="flex items-center gap-2">
          {/* 섀도우 레이스 토글 */}
          <button
            onClick={() => setShowShadow(!showShadow)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors duration-100 ${
              showShadow
                ? 'border-[var(--border)] bg-[var(--surface-hover)] text-text-primary'
                : 'border-[var(--border-subtle)] text-text-muted hover:border-[var(--border)]'
            }`}
          >
            {showShadow ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            섀도우
          </button>

          {/* 기간 스위처 */}
          <div className="flex rounded-md border border-[var(--border-subtle)]">
            {dayOptions.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-[12px] font-medium transition-colors duration-100 first:rounded-l-md last:rounded-r-md ${
                  days === d
                    ? 'bg-[var(--surface-hover)] text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 차트 영역 */}
      {equity.isLoading ? (
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-full w-full skeleton-shimmer rounded-md" />
        </div>
      ) : equity.isError ? (
        <ErrorBlock message="에퀴티 데이터 로드 실패" onRetry={() => equity.refetch()} />
      ) : equityData.length === 0 ? (
        <EmptyState icon={<Activity className="h-8 w-8" />} message="에퀴티 데이터가 아직 없습니다" sub="운영을 시작하면 에퀴티 커브가 표시됩니다" />
      ) : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {/* 레짐 배경 밴드 */}
              {bandRanges.map((band, i) => (
                <ReferenceArea
                  key={i}
                  x1={band.x1}
                  x2={band.x2}
                  fill={band.color}
                  strokeOpacity={0}
                />
              ))}

              <XAxis
                dataKey="recorded_at"
                tickFormatter={(v: string) => formatTime(v)}
                tick={{ fontSize: 11, fill: '#71717A', fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: '#27272A' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#71717A', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickFormatter={(v: number) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  background: '#111113',
                  border: '1px solid #27272A',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono',
                }}
                labelFormatter={(v: string) => formatTime(v)}
                formatter={(value: number) => [`$${value.toLocaleString()}`, '에퀴티']}
              />

              {/* 섀도우 레이스 (비활성 전략 비교 — 토글 ON일 때) */}
              {showShadow && (
                <Area
                  type="monotone"
                  dataKey="unrealized_pnl"
                  stroke="#52525B"
                  strokeWidth={1}
                  fill="none"
                  dot={false}
                  name="미실현"
                />
              )}

              {/* 메인 에퀴티 라인 */}
              <Area
                type="monotone"
                dataKey="total_equity"
                stroke="#4ADE80"
                strokeWidth={2}
                fill="url(#equityGradient)"
                dot={false}
                name="에퀴티"
              />

              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
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

// ─── 커맨드 레일 ──────────────────────────────────────────────────

const CommandRail = ({
  dashboard,
  positions,
  pendingDecisions,
}: {
  dashboard: ReturnType<typeof useV2Dashboard>
  positions: ReturnType<typeof usePositions>
  pendingDecisions: Decision[]
}) => {
  const allPositions = [
    ...(positions.data?.live ?? []),
    ...(positions.data?.paper ?? []),
  ]

  return (
    <div className="flex flex-col">
      {/* 현재 상태 */}
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <SectionHeading title="시스템 상태" icon={<Layers className="h-3.5 w-3.5" />} />
        {dashboard.isLoading ? (
          <SkeletonRows count={3} />
        ) : dashboard.isError ? (
          <ErrorBlock message="상태 로드 실패" onRetry={() => dashboard.refetch()} />
        ) : dashboard.data ? (
          <div className="mt-3 space-y-2.5">
            {/* 레짐 상세 */}
            {dashboard.data.regime && (
              <>
                <StatusRow label="BTC 가격" value={`$${dashboard.data.regime.btc_price.toLocaleString()}`} />
                <StatusRow label="EMA(200)" value={`$${dashboard.data.regime.ema200.toLocaleString()}`} />
                <StatusRow label="RSI(14)" value={dashboard.data.regime.rsi14.toFixed(1)} />
                <StatusRow label="ATR%" value={`${dashboard.data.regime.atr_pct.toFixed(2)}%`} />
              </>
            )}
            {/* 슬롯 */}
            <StatusRow
              label="활성 슬롯"
              value={`${dashboard.data.slots.filter(s => s.status === 'active').length}개`}
            />
            {/* 포지션 수 */}
            <StatusRow
              label="활성 포지션"
              value={`실전 ${dashboard.data.activePositions.live} / 페이퍼 ${dashboard.data.activePositions.paper}`}
            />
          </div>
        ) : null}
      </div>

      {/* 현재 배치 (활성 포지션) */}
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <SectionHeading title="현재 배치" icon={<Briefcase className="h-3.5 w-3.5" />} />
        {positions.isLoading ? (
          <SkeletonRows count={2} />
        ) : positions.isError ? (
          <ErrorBlock message="포지션 로드 실패" onRetry={() => positions.refetch()} />
        ) : allPositions.length === 0 ? (
          <EmptyState icon={<Briefcase className="h-8 w-8" />} message="활성 포지션 없음" />
        ) : (
          <div className="mt-3 space-y-0">
            {allPositions.map(pos => (
              <div
                key={pos.id}
                className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
              >
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${
                  pos.source === 'live'
                    ? 'bg-[var(--info-bg)] text-info'
                    : 'bg-[var(--surface-hover)] text-text-muted'
                }`}>
                  {pos.source === 'live' ? '실전' : '페이퍼'}
                </span>
                <span className="text-[13px] font-medium text-text-primary">{pos.asset_key}</span>
                <span className={`text-[12px] font-medium ${
                  pos.side === 'long' ? 'text-profit' : 'text-loss'
                }`}>
                  {pos.side === 'long' ? 'LONG' : 'SHORT'}
                </span>
                <span className="ml-auto font-mono text-[13px] tabular-nums text-text-secondary">
                  ${pos.entry_price.toLocaleString()}
                </span>
                <span className={`font-mono text-[13px] font-medium tabular-nums ${pnlColor(pos.unrealized_pnl)}`}>
                  {formatPnl(pos.unrealized_pnl)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 승인 대기 */}
      <div className="px-5 py-4">
        <SectionHeading title="승인 대기" icon={<Inbox className="h-3.5 w-3.5" />} count={pendingDecisions.length} />
        {pendingDecisions.length === 0 ? (
          <EmptyState icon={<Inbox className="h-8 w-8" />} message="대기 중인 승인 없음" />
        ) : (
          <div className="mt-3 space-y-0">
            {pendingDecisions.map(d => (
              <div
                key={d.id}
                className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
              >
                <span className="rounded bg-[var(--warning-bg)] px-1.5 py-0.5 text-[12px] font-medium text-warning">
                  대기
                </span>
                <span className="flex-1 truncate text-[13px] text-text-primary">
                  {d.reason_summary || d.decision_type}
                </span>
                <span className="whitespace-nowrap font-mono text-[11px] text-text-muted tabular-nums">
                  {getTimeAgo(d.created_at)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 공용 서브 컴포넌트 ───────────────────────────────────────────

const SectionHeading = ({
  title,
  icon,
  count,
}: {
  title: string
  icon: React.ReactNode
  count?: number
}) => (
  <div className="flex items-center gap-1.5">
    <span className="text-text-muted">{icon}</span>
    <h3 className="text-[12px] font-semibold text-text-muted">{title}</h3>
    {count !== undefined && count > 0 && (
      <span className="ml-1 rounded-full bg-[var(--warning-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-warning tabular-nums">
        {count}
      </span>
    )}
  </div>
)

const StatusRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
    <span className="text-[12px] text-text-muted">{label}</span>
    <span className="font-mono text-[13px] font-medium text-text-primary tabular-nums">{value}</span>
  </div>
)

const SkeletonRows = ({ count }: { count: number }) => (
  <div className="mt-3 space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="h-7 skeleton-shimmer rounded" />
    ))}
  </div>
)

const EmptyState = ({
  icon,
  message,
  sub,
}: {
  icon: React.ReactNode
  message: string
  sub?: string
}) => (
  <div className="mt-3 flex flex-col items-center justify-center rounded-md border border-dashed border-[var(--border)] py-8">
    <span className="text-text-faint">{icon}</span>
    <p className="mt-2 text-[13px] text-text-secondary">{message}</p>
    {sub && <p className="mt-0.5 text-[12px] text-text-muted">{sub}</p>}
  </div>
)

const ErrorBlock = ({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) => (
  <div className="mt-3 flex items-center gap-2 rounded-md border border-loss bg-[var(--loss-bg)] px-3 py-2.5">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-loss" />
    <span className="text-[13px] text-loss">{message}</span>
    <button
      onClick={onRetry}
      className="ml-auto flex items-center gap-1 text-[12px] font-medium text-loss hover:underline"
    >
      <RefreshCw className="h-3 w-3" />
      재시도
    </button>
  </div>
)
