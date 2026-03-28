import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  RefreshCw,
  Activity,
  BarChart3,
  Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { api } from '../services/api'
import { TermTooltip } from '../components/ui/term-tooltip'

// --- 타입 ---

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
  reasoning: Record<string, unknown>
  created_at: string
  is_active: boolean
}

interface Performance {
  strategy: string
  sharpe_ratio: number
  win_rate: number
  max_drawdown: number
  total_trades: number
  period_start: string
  period_end: string
}

// --- 데이터 페칭 ---

function useBtcPrice() {
  return useQuery({
    queryKey: ['btc-price'],
    queryFn: () => api.getBtcPrice(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
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

function useSignals() {
  return useQuery({
    queryKey: ['signals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Signal[]
    },
    refetchInterval: 4 * 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
  })
}

function usePerformance() {
  return useQuery({
    queryKey: ['performance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backtest_results')
        .select('strategy, sharpe_ratio, win_rate, max_drawdown, total_trades, period_start, period_end')
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Performance | null
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}

// --- 메인 ---

export function SignalsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">알트코인 매매 시그널</h1>
        <p className="text-[13px] text-text-muted">
          BTC 흐름 기반 알트코인 매수/매도 시그널. 4시간마다 갱신.
        </p>
      </div>

      <RegimeHero />
      <PerformanceSummary />
      <SignalList />

      <p className="text-center text-[12px] text-text-muted">
        이 시그널은 학습 및 참고 목적이며, 투자 조언이 아닙니다. 투자 판단은 본인 책임입니다.
      </p>
    </div>
  )
}

// --- 레짐 히어로 ---

function RegimeHero() {
  const { data: regime, isLoading, error } = useRegime()

  if (isLoading) return <RegimeHeroSkeleton />
  if (error || !regime) {
    return (
      <div className="card-surface flex items-center justify-center rounded-md p-8 text-[12px] text-text-muted">
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.
      </div>
    )
  }

  const isRiskOn = regime.regime === 'risk_on'
  const timeAgo = getTimeAgo(regime.timestamp)

  return (
    <div className={`card-surface rounded-md p-5 ${
      isRiskOn ? 'border-l-2 border-l-profit' : 'border-l-2 border-l-loss'
    }`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-md ${
            isRiskOn ? 'bg-[var(--profit-bg)]' : 'bg-[var(--loss-bg)]'
          }`}>
            {isRiskOn
              ? <TrendingUp className="h-4 w-4 text-profit" />
              : <ShieldAlert className="h-4 w-4 text-loss" />
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold">
                BTC <TermTooltip term="regime">레짐</TermTooltip>
              </span>
              <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${
                isRiskOn ? 'bg-[var(--profit-bg)] text-profit' : 'bg-[var(--loss-bg)] text-loss'
              }`}>
                {isRiskOn ? 'RISK-ON' : 'RISK-OFF'}
              </span>
            </div>
            <p className="text-[12px] text-text-muted">
              {isRiskOn
                ? '시장이 안정적입니다. 매수 시그널이 활성화됩니다.'
                : '시장 불확실성이 높습니다. 매수 시그널을 억제하고 있습니다.'}
            </p>
          </div>
        </div>
        <span className="text-[12px] text-text-muted">{timeAgo}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <IndicatorCard
          label={<TermTooltip term="ema">EMA(200)</TermTooltip>}
          value={regime.btc_close > regime.ema_200 ? 'Above' : 'Below'}
          detail={formatKrw(regime.ema_200)}
          positive={regime.btc_close > regime.ema_200}
          mono
        />
        <IndicatorCard
          label={<TermTooltip term="rsi">RSI(14)</TermTooltip>}
          value={regime.rsi_14.toFixed(1)}
          detail="52~70 안전"
          positive={regime.rsi_14 >= 52 && regime.rsi_14 <= 70}
          mono
        />
        <IndicatorCard
          label={<TermTooltip term="atr_pct">ATR%</TermTooltip>}
          value={`${regime.atr_pct.toFixed(2)}%`}
          detail="4.5% 이하 안전"
          positive={regime.atr_pct <= 4.5}
          mono
        />
        <BtcPriceCard />
      </div>
    </div>
  )
}

function IndicatorCard({ label, value, detail, positive, mono }: {
  label: React.ReactNode
  value: string
  detail: string
  positive: boolean | null
  mono?: boolean
}) {
  return (
    <div className="rounded-md bg-secondary p-2.5">
      <p className="mb-1 text-[12px] font-semibold text-text-muted">{label}</p>
      <p className={`text-[15px] font-bold ${
        positive === true ? 'text-profit' : positive === false ? 'text-loss' : 'text-text-primary'
      }`}>
        {mono ? <span className="font-mono-trading">{value}</span> : value}
      </p>
      {detail && <p className={`text-[12px] text-text-muted${mono ? ' font-mono-trading' : ''}`}>{detail}</p>}
    </div>
  )
}

function BtcPriceCard() {
  const { data } = useBtcPrice()
  const price = data?.price
  const changeRate = data?.changeRate ?? 0
  const isUp = changeRate >= 0

  return (
    <div className="rounded-md bg-secondary p-2.5">
      <p className="mb-1 text-[12px] font-semibold text-text-muted">BTC 가격</p>
      <p className="text-[15px] font-bold text-text-primary">
        <span className="font-mono-trading">{price ? formatKrw(price) : '—'}</span>
      </p>
      {price && (
        <p className={`font-mono-trading text-[12px] ${isUp ? 'text-profit' : 'text-loss'}`}>
          {isUp ? '+' : ''}{(changeRate * 100).toFixed(2)}%
        </p>
      )}
    </div>
  )
}

function RegimeHeroSkeleton() {
  return (
    <div className="card-surface rounded-md p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-9 w-9 skeleton-shimmer rounded-md" />
        <div className="space-y-1.5">
          <div className="h-4 w-28 skeleton-shimmer rounded" />
          <div className="h-3 w-44 skeleton-shimmer rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[72px] skeleton-shimmer rounded-md" />
        ))}
      </div>
    </div>
  )
}

// --- 성과 요약 ---

function PerformanceSummary() {
  const { data: perf, isLoading } = usePerformance()

  if (isLoading) {
    return (
      <div className="card-surface flex items-center gap-6 rounded-md px-4 py-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-3.5 w-20 skeleton-shimmer rounded" />
        ))}
      </div>
    )
  }

  if (!perf) return null

  return (
    <div className="card-surface flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-md px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[13px]">
        <BarChart3 className="h-3 w-3 text-text-faint" />
        <TermTooltip term="sharpe">Sharpe</TermTooltip>
        <span className="font-mono-trading font-medium text-text-primary">{perf.sharpe_ratio.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[13px]">
        <Activity className="h-3 w-3 text-text-faint" />
        <TermTooltip term="win_rate">승률</TermTooltip>
        <span className="font-mono-trading font-medium text-text-primary">{perf.win_rate.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-1.5 text-[13px]">
        <TrendingDown className="h-3 w-3 text-text-faint" />
        <TermTooltip term="mdd">MDD</TermTooltip>
        <span className="font-mono-trading font-medium text-loss">-{perf.max_drawdown.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-text-faint">
        <Clock className="h-3 w-3" />
        {perf.total_trades}건 | {perf.period_start} ~ {perf.period_end}
      </div>
    </div>
  )
}

// --- 시그널 ---

function SignalList() {
  const { data: signals, isLoading, error } = useSignals()
  const { data: regime } = useRegime()

  if (isLoading) return <SignalListSkeleton />
  if (error) {
    return (
      <div className="card-surface flex items-center justify-center rounded-md p-8 text-[12px] text-text-muted">
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        시그널을 불러올 수 없습니다.
      </div>
    )
  }

  if ((!signals || signals.length === 0) && regime?.regime === 'risk_off') {
    return (
      <div className="card-surface rounded-md p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-loss" />
        <p className="text-[13px] font-medium text-text-secondary">매수 시그널을 억제하고 있습니다</p>
        <p className="mt-1 text-[12px] text-text-muted">
          BTC 레짐이 Risk-Off 상태입니다. 레짐이 전환되면 시그널이 활성화됩니다.
        </p>
      </div>
    )
  }

  if (!signals || signals.length === 0) {
    return (
      <div className="card-surface rounded-md p-8 text-center">
        <Activity className="mx-auto mb-3 h-8 w-8 text-text-faint" />
        <p className="text-[13px] font-medium text-text-secondary">현재 활성 시그널이 없습니다</p>
        <p className="mt-1 text-[12px] text-text-muted">
          다음 분석에서 조건을 충족하는 알트코인이 있으면 시그널이 생성됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="card-surface overflow-hidden rounded-md">
      <div className="px-4 py-3">
        <h2 className="text-[12px] font-semibold text-text-faint">활성 시그널</h2>
      </div>

      {/* 데스크톱 */}
      <div className="hidden md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-t border-border-subtle text-left">
              <th className="px-4 py-2 text-[12px] font-semibold text-text-muted">종목</th>
              <th className="px-4 py-2 text-[12px] font-semibold text-text-muted">방향</th>
              <th className="px-4 py-2 text-[12px] font-semibold text-text-muted">
                <TermTooltip term="z_score">z-score</TermTooltip>
              </th>
              <th className="px-4 py-2 text-[12px] font-semibold text-text-muted">
                <TermTooltip term="rsi">RSI</TermTooltip>
              </th>
              <th className="px-4 py-2 text-[12px] font-semibold text-text-muted">시각</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 */}
      <div className="space-y-1.5 p-3 md:hidden">
        {signals.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </div>
    </div>
  )
}

function SignalRow({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="cursor-pointer border-t border-border-subtle transition-colors duration-100 hover:bg-surface-hover"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 font-medium text-text-primary">{signal.symbol}</td>
        <td className="px-4 py-2.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
            signal.direction === 'buy'
              ? 'bg-profit-bg text-profit'
              : 'bg-loss-bg text-loss'
          }`}>
            {signal.direction === 'buy' ? '매수' : '매도'}
          </span>
        </td>
        <td className="px-4 py-2.5 font-mono-trading text-text-secondary">{signal.z_score?.toFixed(2) ?? '-'}</td>
        <td className="px-4 py-2.5 font-mono-trading text-text-secondary">{signal.rsi?.toFixed(1) ?? '-'}</td>
        <td className="px-4 py-2.5 text-text-muted">{getTimeAgo(signal.created_at)}</td>
        <td className="px-4 py-2.5">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-text-faint" />
            : <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
          }
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-surface-hover px-4 py-3">
            <ReasoningPanel reasoning={signal.reasoning} />
          </td>
        </tr>
      )}
    </>
  )
}

function SignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="cursor-pointer rounded-md bg-surface p-3 transition-colors duration-100 hover:bg-surface-hover"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{signal.symbol}</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
            signal.direction === 'buy'
              ? 'bg-profit-bg text-profit'
              : 'bg-loss-bg text-loss'
          }`}>
            {signal.direction === 'buy' ? '매수' : '매도'}
          </span>
        </div>
        <span className="text-[12px] text-text-muted">{getTimeAgo(signal.created_at)}</span>
      </div>
      <div className="mt-1 flex gap-4 text-[12px] text-text-muted">
        <span>z: <span className="font-mono-trading text-text-secondary">{signal.z_score?.toFixed(2) ?? '-'}</span></span>
        <span>RSI: <span className="font-mono-trading text-text-secondary">{signal.rsi?.toFixed(1) ?? '-'}</span></span>
      </div>
      {expanded && (
        <div className="mt-2.5 border-t border-border-subtle pt-2.5">
          <ReasoningPanel reasoning={signal.reasoning} />
        </div>
      )}
    </div>
  )
}

function ReasoningPanel({ reasoning }: { reasoning: Record<string, unknown> }) {
  const checks = [
    { label: 'BTC 레짐', key: 'btc_regime', display: String(reasoning.btc_regime ?? '-'), pass: reasoning.btc_regime === 'risk_on' },
    { label: 'z-score', key: 'z_check', display: `${reasoning.z_score ?? '-'} (기준: ${reasoning.z_threshold ?? '-1.0'})`, pass: reasoning.z_check === true },
    { label: 'RSI', key: 'rsi_check', display: `${reasoning.rsi ?? '-'} (기준: ${reasoning.rsi_threshold ?? '78'} 이하)`, pass: reasoning.rsi_check === true },
  ]

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-text-muted">진입 근거</p>
      {checks.map((check) => (
        <div key={check.key} className="flex items-center gap-2 text-[13px]">
          {check.pass ? (
            <Check className="h-3.5 w-3.5 text-profit" />
          ) : (
            <X className="h-3.5 w-3.5 text-loss" />
          )}
          <span className="text-text-muted">{check.label}:</span>
          <span className="font-mono-trading text-text-secondary">{check.display}</span>
        </div>
      ))}
    </div>
  )
}

function SignalListSkeleton() {
  return (
    <div className="card-surface rounded-md p-4">
      <div className="mb-3 h-3.5 w-16 skeleton-shimmer rounded" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-1.5 h-10 skeleton-shimmer rounded-lg" />
      ))}
    </div>
  )
}

// --- 유틸 ---

function formatKrw(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
