import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  TrendingDown,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Radio,
  Clock,
  Radar,
} from 'lucide-react'
import { BtcCandleChart } from '../components/charts/BtcCandleChart'
import { supabase } from '../lib/supabase'
import { TermTooltip } from '../components/ui/term-tooltip'
import { useAuth } from '../hooks/useAuth'
import { OnboardingChecklist } from '../components/onboarding/OnboardingChecklist'

interface RegimeState {
  regime: 'risk_on' | 'risk_off'
  btc_close: number
  ema_200: number
  rsi_14: number
  atr_pct: number
  timestamp: string
}

interface Signal {
  id: number
  strategy: string
  symbol: string
  direction: string
  z_score: number | null
  rsi: number | null
  btc_regime: string
  created_at: string
}

interface BacktestPerformance {
  sharpe_ratio: number
  win_rate: number
  max_drawdown: number
  total_trades: number
  total_return: number
}

function useRegime() {
  return useQuery({
    queryKey: ['regime'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regime_states')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()
      if (error) throw error
      return data as RegimeState
    },
    refetchInterval: 4 * 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
  })
}

function useRecentSignals() {
  return useQuery({
    queryKey: ['recent-signals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signals')
        .select('id, strategy, symbol, direction, z_score, rsi, btc_regime, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return (data ?? []) as Signal[]
    },
    refetchInterval: 4 * 60 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  })
}

function useBacktestPerformance() {
  return useQuery({
    queryKey: ['backtest-performance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backtest_results')
        .select('sharpe_ratio, win_rate, max_drawdown, total_trades, total_return')
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (error) return null
      return data as BacktestPerformance
    },
    staleTime: 30 * 60 * 1000,
  })
}

function useActiveSignalCount() {
  return useQuery({
    queryKey: ['active-signal-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 4 * 60 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  })
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data: regime, isError: regimeError, refetch: refetchRegime } = useRegime()
  const { data: perf } = useBacktestPerformance()
  const { data: activeCount } = useActiveSignalCount()
  const { data: recentSignals } = useRecentSignals()

  // 온보딩 상태
  const [checklistDismissed, setChecklistDismissed] = useState(false)

  const onboardingComplete = localStorage.getItem('onboarding_complete') === 'true'
  const profileSelected = localStorage.getItem('profile_selected') === 'true'
  const backtestRun = (perf?.total_trades ?? 0) > 0
  const { data: paperSessionCount } = useQuery({
    queryKey: ['paper-session-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('paper_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'running')
      return count ?? 0
    },
    enabled: !!user,
    staleTime: 60_000,
  })
  const paperStarted = (paperSessionCount ?? 0) > 0

  return (
    <div className="space-y-5">
      {/* 온보딩 체크리스트 (WelcomeModal 제거됨) */}
      {user && !onboardingComplete && !checklistDismissed && (
        <OnboardingChecklist
          profileSelected={profileSelected}
          backtestRun={backtestRun}
          paperStarted={paperStarted}
          onDismiss={() => {
            setChecklistDismissed(true)
            localStorage.setItem('onboarding_complete', 'true')
          }}
        />
      )}

      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">대시보드</h2>
          <p className="text-[13px] text-text-muted">자산 현황과 매매 상태를 확인합니다</p>
        </div>
        {regimeError ? (
          <button onClick={() => refetchRegime()} className="flex items-center gap-1.5 text-[12px] text-loss hover:underline">
            <Activity className="h-3.5 w-3.5" />
            레짐 로드 실패 · 재시도
          </button>
        ) : regime ? (
          <RegimeBadge regime={regime} />
        ) : null}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={<TermTooltip term="sharpe">Sharpe Ratio</TermTooltip>}
          value={perf ? perf.sharpe_ratio.toFixed(2) : '--'}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <KpiCard
          title={<TermTooltip term="win_rate">승률</TermTooltip>}
          value={perf ? `${perf.win_rate.toFixed(1)}` : '--'}
          unit="%"
          sub={perf ? `${perf.total_trades}건` : undefined}
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <KpiCard
          title={<TermTooltip term="mdd">MDD</TermTooltip>}
          value={perf ? `-${perf.max_drawdown.toFixed(1)}` : '--'}
          unit="%"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          variant="loss"
        />
        <KpiCard
          title="활성 시그널"
          value={activeCount !== undefined ? String(activeCount) : '--'}
          unit="건"
          icon={<Radio className="h-3.5 w-3.5" />}
        />
      </div>

      {/* 코인 분석 현황 */}
      <ScanStatusWidget />

      {/* 차트 + 사이드 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" style={{ minHeight: '440px' }}>
        <BtcCandleChart />
        <SidePanel regime={regime} />
      </div>

      {/* 최근 시그널 피드 */}
      <SignalFeed signals={recentSignals ?? []} />
    </div>
  )
}

function KpiCard({ title, value, unit, sub, change, icon, variant }: {
  title: React.ReactNode
  value: string
  unit?: string
  sub?: string
  change?: number | null
  icon: React.ReactNode
  variant?: 'loss'
}) {
  return (
    <div className="card-surface group rounded-md p-4 transition-colors duration-200 hover:border-border">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icon}
        <p className="text-[12px] font-semibold">{title}</p>
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className={`font-mono-trading text-2xl font-bold tracking-tight ${
          variant === 'loss' ? 'text-loss' : 'text-text-primary'
        }`}>
          {value}
        </span>
        {unit && <span className="text-[12px] text-text-muted">{unit}</span>}
      </div>
      {change !== undefined && change !== null && (
        <div className={`mt-1.5 flex items-center gap-1 text-[12px] font-medium ${
          change >= 0 ? 'text-profit' : 'text-loss'
        }`}>
          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          <span className="ml-1 text-text-muted">vs 어제</span>
        </div>
      )}
      {sub && <div className="mt-0.5 text-[12px] text-text-muted">{sub}</div>}
    </div>
  )
}

function RegimeBadge({ regime }: { regime: RegimeState }) {
  const isOn = regime.regime === 'risk_on'
  const timeAgo = getTimeAgo(regime.timestamp)

  return (
    <div className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
      isOn
        ? 'border-profit bg-[var(--profit-bg)] text-profit'
        : 'border-loss bg-[var(--loss-bg)] text-loss'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isOn ? 'bg-profit' : 'bg-loss'}`} />
      <TermTooltip term="regime">
        {isOn ? 'RISK-ON' : 'RISK-OFF'}
      </TermTooltip>
      <span className="text-text-muted">{timeAgo}</span>
    </div>
  )
}

function SidePanel({ regime }: { regime: RegimeState | undefined }) {
  return (
    <div className="flex flex-col gap-3">
      {/* 레짐 */}
      <div className="card-surface rounded-md p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
          <Layers className="h-3 w-3" />
          BTC <TermTooltip term="regime">레짐</TermTooltip>
        </h3>
        {regime ? (
          <div className="space-y-2">
            <RegimeRow
              label={<TermTooltip term="ema">EMA(200)</TermTooltip>}
              value={regime.btc_close > regime.ema_200 ? 'Above' : 'Below'}
              pass={regime.btc_close > regime.ema_200}
            />
            <RegimeRow
              label={<TermTooltip term="rsi">RSI(14)</TermTooltip>}
              value={regime.rsi_14.toFixed(1)}
              pass={regime.rsi_14 >= 52 && regime.rsi_14 <= 70}
            />
            <RegimeRow
              label={<TermTooltip term="atr_pct">ATR%</TermTooltip>}
              value={`${regime.atr_pct.toFixed(2)}%`}
              pass={regime.atr_pct <= 4.5}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 skeleton-shimmer rounded-lg" />
            ))}
          </div>
        )}
      </div>

      {/* 자산 배분 */}
      <div className="card-surface flex-1 rounded-md p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
          <Target className="h-3 w-3" />
          자산 배분
        </h3>
        <div className="flex h-28 items-center justify-center text-[12px] text-text-muted">
          Auth 연동 후 활성화
        </div>
      </div>
    </div>
  )
}

function RegimeRow({ label, value, pass }: {
  label: React.ReactNode
  value: string
  pass: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
      <span className="text-[12px] text-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono-trading text-[13px] font-medium">{value}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${pass ? 'bg-profit' : 'bg-loss'}`} />
      </div>
    </div>
  )
}

function SignalFeed({ signals }: { signals: Signal[] }) {
  return (
    <div className="card-surface rounded-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
          <Radio className="h-3 w-3" />
          최근 시그널
        </h3>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[12px] text-text-muted">
          {signals.length}건
        </span>
      </div>
      {signals.length > 0 ? (
        <div className="space-y-1.5">
          {signals.map((sig) => (
            <div key={sig.id} className="flex items-center gap-3 rounded-md bg-surface px-3 py-2 text-[13px]">
              <span className="text-text-muted">{getTimeAgo(sig.created_at)}</span>
              <span className="font-medium text-text-primary">{sig.symbol}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
                sig.direction === 'buy'
                  ? 'bg-[var(--profit-bg)] text-profit'
                  : 'bg-[var(--loss-bg)] text-loss'
              }`}>
                {sig.direction === 'buy' ? '매수' : '매도'}
              </span>
              {sig.z_score != null && (
                <span className="font-mono-trading text-text-muted">z:{sig.z_score.toFixed(2)}</span>
              )}
              {sig.rsi != null && (
                <span className="font-mono-trading text-text-muted">RSI:{sig.rsi.toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-6">
          <div className="text-center">
            <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
              <Clock className="h-3.5 w-3.5 text-text-faint" />
            </div>
            <p className="text-[13px] text-text-muted">시그널 기록 없음</p>
            <p className="mt-0.5 text-[12px] text-text-muted">4시간마다 시그널이 생성됩니다</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ScanStatusWidget() {
  const queryClient = useQueryClient()
  // 탐지 페이지 캐시에서 마지막 스캔 결과 읽기
  const strategies = ['composite', 'oversold', 'momentum', 'volume'] as const
  let scanData: { totalScanned: number; detected: number; scannedAt: string; results: Array<{ symbol: string; score: number }> } | undefined

  for (const s of strategies) {
    const cached = queryClient.getQueryData<typeof scanData>(['detection-scan', s])
    if (cached && (!scanData || cached.scannedAt > scanData.scannedAt)) {
      scanData = cached
    }
  }

  if (!scanData) return null

  return (
    <div className="card-surface flex flex-wrap items-center gap-4 rounded-md px-4 py-3">
      <div className="flex items-center gap-1.5 text-text-muted">
        <Radar className="h-3.5 w-3.5" />
        <span className="text-[12px] font-semibold">코인 분석</span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="text-text-muted">스캔:</span>
        <span className="font-mono-trading text-text-primary">{scanData.totalScanned}개</span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="text-text-muted">감지:</span>
        <span className={`font-mono-trading ${scanData.detected > 0 ? 'text-profit' : 'text-text-primary'}`}>
          {scanData.detected}개
        </span>
      </div>
      {scanData.results.length > 0 && (
        <div className="flex items-center gap-1.5">
          {scanData.results.slice(0, 3).map((r) => (
            <span
              key={r.symbol}
              className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[12px] font-medium text-[var(--accent)]"
            >
              {r.symbol}
            </span>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-1 text-[12px] text-text-muted">
        <Clock className="h-3 w-3" />
        {getTimeAgo(scanData.scannedAt)}
      </div>
    </div>
  )
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
