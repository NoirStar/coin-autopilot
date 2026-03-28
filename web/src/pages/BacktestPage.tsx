import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Play,
  Loader2,
  BarChart3,
  Target,
  TrendingDown,
  Clock,
  ArrowUpRight,
  Activity,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TermTooltip } from '@/components/ui/term-tooltip'
import { API_BASE } from '@/services/api'

interface BacktestTradeResult {
  symbol: string
  direction: string
  entryPrice: number
  exitPrice: number
  entryTime: string
  exitTime: string
  pnlPct: number
  reason: string
  fees: number
}

interface BacktestResultData {
  id: string | null
  strategyId: string
  params: Record<string, number>
  timeframe: string
  periodStart: string
  periodEnd: string
  totalReturn: number
  cagr: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
  totalTrades: number
  avgHoldHours: number
  trades: BacktestTradeResult[]
  equityCurve: Array<{ t: string; equity: number }>
}

export function BacktestPage() {
  const [initialCapital, setInitialCapital] = useState(10_000_000)
  const [zScoreEntry, setZScoreEntry] = useState(-1.0)
  const [rsiMax, setRsiMax] = useState(78)
  const [atrStopMult, setAtrStopMult] = useState(2.7)
  const [maxPositions, setMaxPositions] = useState(5)
  const [btProgress, setBtProgress] = useState<{
    phase: string
    current: number
    total: number
    detail: string
  } | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      setBtProgress(null)
      const res = await fetch(`${API_BASE}/api/backtest/run/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: 'alt_mean_reversion',
          initialCapital,
          params: { zScoreEntry, rsiMax, atrStopMult, maxPositions },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? `API Error: ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result: BacktestResultData | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop()!
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'progress') {
                  setBtProgress(data)
                } else if (data.type === 'complete') {
                  result = data.result
                } else if (data.type === 'error') {
                  throw new Error(data.message)
                }
              } catch (e) {
                if (e instanceof Error && !e.message.includes('JSON')) throw e
              }
            }
          }
        }
      }

      setBtProgress(null)
      if (!result) throw new Error('백테스트 결과 없음')
      return result
    },
    gcTime: 30 * 60 * 1000,
  })

  const result = mutation.data

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">백테스팅</h2>
        <p className="text-[13px] text-text-muted">과거 데이터로 전략을 검증합니다</p>
      </div>

      {/* 설정 패널 */}
      <div className="card-surface rounded-md p-5">
        <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-text-muted">백테스트 설정</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InputField label="전략" value="BTC 레짐 + 알트 평균회귀" disabled />
          <InputField label="타임프레임" value="4H" disabled />
          <NumberInput
            label="초기 자본 (KRW)"
            value={initialCapital}
            onChange={setInitialCapital}
            min={100_000}
            max={1_000_000_000}
            step={1_000_000}
          />
          <NumberInput
            label={<TermTooltip term="z_score">z-score 진입 임계</TermTooltip>}
            value={zScoreEntry}
            onChange={setZScoreEntry}
            min={-3}
            max={0}
            step={0.1}
          />
          <NumberInput
            label="RSI 상한"
            value={rsiMax}
            onChange={setRsiMax}
            min={50}
            max={95}
            step={1}
          />
          <NumberInput
            label="ATR 손절 배수"
            value={atrStopMult}
            onChange={setAtrStopMult}
            min={1}
            max={5}
            step={0.1}
          />
          <NumberInput
            label="최대 동시 보유"
            value={maxPositions}
            onChange={setMaxPositions}
            min={1}
            max={10}
            step={1}
          />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {mutation.isPending ? '실행 중...' : '백테스트 실행'}
          </button>
        </div>
        {mutation.isPending && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                <span className="text-text-muted">{btProgress?.detail ?? '준비 중...'}</span>
              </div>
              {btProgress && (
                <span className="font-mono-trading text-text-muted">
                  {btProgress.current}/{btProgress.total}
                </span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: btProgress ? `${(btProgress.current / btProgress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 에러 */}
      {mutation.isError && (
        <div className="card-surface flex items-center gap-3 rounded-md border-loss p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-loss" />
          <div>
            <p className="text-[13px] font-medium text-text-secondary">백테스트 실행 실패</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {(mutation.error as Error)?.message ?? '알 수 없는 오류'}
            </p>
          </div>
          <button
            onClick={() => mutation.mutate()}
            className="ml-auto flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover"
          >
            <RotateCcw className="h-3 w-3" />
            재시도
          </button>
        </div>
      )}

      {/* 결과 */}
      {result ? (
        <BacktestResults result={result} />
      ) : !mutation.isPending && !mutation.isError ? (
        <div className="card-surface rounded-md p-8 text-center">
          <BarChart3 className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-[13px] font-medium text-text-secondary">
            백테스트를 실행하면 결과가 여기에 표시됩니다
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            설정을 조정하고 "백테스트 실행" 버튼을 클릭하세요
          </p>
        </div>
      ) : null}
    </div>
  )
}

function BacktestResults({ result }: { result: BacktestResultData }) {
  return (
    <div className="space-y-4">
      {/* KPI 바 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label={<TermTooltip term="sharpe">Sharpe</TermTooltip>}
          value={result.sharpeRatio.toFixed(2)}
          icon={<BarChart3 className="h-3 w-3" />}
        />
        <KpiCard
          label="승률"
          value={`${result.winRate.toFixed(1)}%`}
          sub={`${Math.round(result.totalTrades * result.winRate / 100)}/${result.totalTrades}`}
          icon={<Target className="h-3 w-3" />}
        />
        <KpiCard
          label={<TermTooltip term="mdd">MDD</TermTooltip>}
          value={`-${result.maxDrawdown.toFixed(1)}%`}
          variant="loss"
          icon={<TrendingDown className="h-3 w-3" />}
        />
        <KpiCard
          label="총 수익률"
          value={`${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(1)}%`}
          variant={result.totalReturn >= 0 ? 'profit' : 'loss'}
          icon={<Activity className="h-3 w-3" />}
        />
        <KpiCard
          label="CAGR"
          value={`${result.cagr >= 0 ? '+' : ''}${result.cagr.toFixed(1)}%`}
          variant={result.cagr >= 0 ? 'profit' : 'loss'}
          icon={<ArrowUpRight className="h-3 w-3" />}
        />
        <KpiCard
          label="평균 보유"
          value={`${result.avgHoldHours.toFixed(0)}h`}
          icon={<Clock className="h-3 w-3" />}
        />
      </div>

      {/* 에퀴티 커브 */}
      {result.equityCurve.length > 0 && (
        <div className="card-surface rounded-md p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            에퀴티 커브
          </h3>
          <div className="h-[280px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.equityCurve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e22" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t: string) => new Date(t).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                  stroke="#52525b"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#52525b"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{ background: '#111114', border: '1px solid #1e1e22', borderRadius: 6, fontSize: 11 }}
                  labelFormatter={(t) => new Date(String(t)).toLocaleString('ko-KR')}
                  formatter={(v) => [`₩${Number(v).toLocaleString('ko-KR')}`, '자산']}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#a78bfa"
                  fill="url(#equityGrad)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 거래 내역 */}
      <TradeHistory trades={result.trades} />
    </div>
  )
}

function TradeHistory({ trades }: { trades: BacktestTradeResult[] }) {
  const [sortBy, setSortBy] = useState<'time' | 'pnl'>('time')
  const sorted = [...trades].sort((a, b) =>
    sortBy === 'pnl'
      ? b.pnlPct - a.pnlPct
      : new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime()
  )

  const reasonLabels: Record<string, string> = {
    take_profit: 'z≥0 복귀',
    stop_loss: '손절',
    time_exit: '시간 만료',
    regime_stop: '레짐 전환',
    backtest_end: '종료 청산',
  }

  return (
    <div className="card-surface overflow-hidden rounded-md">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          거래 내역 ({trades.length}건)
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setSortBy('time')}
            className={`rounded-md px-2 py-1 text-[11px] ${
              sortBy === 'time' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-text-muted'
            }`}
          >
            시간순
          </button>
          <button
            onClick={() => setSortBy('pnl')}
            className={`rounded-md px-2 py-1 text-[11px] ${
              sortBy === 'pnl' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-text-muted'
            }`}
          >
            수익순
          </button>
        </div>
      </div>

      {/* 데스크톱 테이블 */}
      <div className="hidden md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-t border-border-subtle text-left">
              <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">시각</th>
              <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">종목</th>
              <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">진입가</th>
              <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">청산가</th>
              <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">PnL</th>
              <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">사유</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map((trade, i) => (
              <tr key={i} className="border-t border-border-subtle">
                <td className="px-4 py-2 text-text-muted">
                  {new Date(trade.exitTime).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </td>
                <td className="px-4 py-2 font-medium text-text-primary">{trade.symbol}</td>
                <td className="px-4 py-2 font-mono-trading text-text-secondary">
                  {formatPrice(trade.entryPrice)}
                </td>
                <td className="px-4 py-2 font-mono-trading text-text-secondary">
                  {formatPrice(trade.exitPrice)}
                </td>
                <td className={`px-4 py-2 font-mono-trading font-medium ${
                  trade.pnlPct >= 0 ? 'text-profit' : 'text-loss'
                }`}>
                  {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                </td>
                <td className="px-4 py-2 text-text-muted">
                  {reasonLabels[trade.reason] ?? trade.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length > 50 && (
          <div className="border-t border-border-subtle px-4 py-2 text-center text-[11px] text-text-muted">
            최근 50건 표시 (전체 {trades.length}건)
          </div>
        )}
      </div>

      {/* 모바일 카드 */}
      <div className="space-y-1 p-3 md:hidden">
        {sorted.slice(0, 30).map((trade, i) => (
          <div key={i} className="rounded-md bg-surface p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">{trade.symbol}</span>
                <span className="text-[11px] text-text-muted">
                  {reasonLabels[trade.reason] ?? trade.reason}
                </span>
              </div>
              <span className={`font-mono-trading text-[12px] font-medium ${
                trade.pnlPct >= 0 ? 'text-profit' : 'text-loss'
              }`}>
                {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1 flex gap-3 text-[11px] text-text-muted">
              <span>진입: {formatPrice(trade.entryPrice)}</span>
              <span>청산: {formatPrice(trade.exitPrice)}</span>
              <span>{new Date(trade.exitTime).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, variant }: {
  label: React.ReactNode
  value: string
  sub?: string
  icon: React.ReactNode
  variant?: 'profit' | 'loss'
}) {
  return (
    <div className="card-surface rounded-md p-3">
      <div className="flex items-center gap-1 text-text-muted">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-1.5 font-mono-trading text-lg font-bold ${
        variant === 'profit' ? 'text-profit' :
        variant === 'loss' ? 'text-loss' : 'text-text-primary'
      }`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>}
    </div>
  )
}

function InputField({ label, value, disabled }: {
  label: string
  value: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      <div className={`mt-1 rounded-md border border-border-subtle bg-surface px-3 py-2 text-[13px] ${
        disabled ? 'text-text-muted' : 'text-text-primary'
      }`}>
        {value}
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange, min, max, step }: {
  label: React.ReactNode
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v >= min && v <= max) onChange(v)
        }}
        min={min}
        max={max}
        step={step}
        className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 font-mono-trading text-[13px] text-text-primary outline-none transition-colors focus:border-primary"
      />
    </div>
  )
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 10000).toFixed(0)}만`
  if (price >= 10_000) return `${(price / 10000).toFixed(1)}만`
  if (price >= 100) return price.toLocaleString('ko-KR')
  return `$${price.toFixed(2)}`
}
