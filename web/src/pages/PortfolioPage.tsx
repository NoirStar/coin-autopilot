import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Key,
  Loader2,
  FileText,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Settings,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { formatPercent } from '../lib/utils'

interface BalanceResponse {
  upbit: {
    configured: boolean
    krw: number
    positions: Array<{ symbol: string; qty: number; entryPrice: number; pnl: number }>
  }
  okx: {
    configured: boolean
    usd: number
    positions: Array<{ symbol: string; qty: number; entryPrice: number; pnl: number }>
  }
}

interface TradeRow {
  id: number
  exchange: string | null
  symbol: string
  direction: string
  entry_price: number
  exit_price: number | null
  quantity: number
  pnl: number | null
  pnl_pct: number | null
  strategy: string
  session_type: string
  closed_at: string
}

interface TradesResponse {
  data: TradeRow[]
  total: number
  limit: number
  offset: number
}

export function PortfolioPage() {
  const navigate = useNavigate()
  const [tradesPage, setTradesPage] = useState(0)
  const [daysFilter, setDaysFilter] = useState(0)
  const [exchangeFilter, setExchangeFilter] = useState('')
  const pageSize = 20

  const { data: balance, isLoading: balanceLoading, error: balanceError } = useQuery<BalanceResponse>({
    queryKey: ['portfolio-balance'],
    queryFn: () => api.getBalance() as Promise<BalanceResponse>,
  })

  const { data: tradesResponse, isLoading: tradesLoading } = useQuery<TradesResponse>({
    queryKey: ['portfolio-trades', tradesPage, daysFilter, exchangeFilter],
    queryFn: () => {
      const params: Record<string, string> = {
        limit: String(pageSize),
        offset: String(tradesPage * pageSize),
      }
      if (daysFilter > 0) params.days = String(daysFilter)
      if (exchangeFilter) params.exchange = exchangeFilter
      return api.getTrades(params) as Promise<TradesResponse>
    },
  })

  const trades = tradesResponse?.data ?? []
  const totalTrades = tradesResponse?.total ?? 0
  const totalPages = Math.ceil(totalTrades / pageSize)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">포트폴리오</h2>
        <p className="text-[12px] text-text-muted">거래소별 잔고와 거래 내역을 확인합니다</p>
      </div>

      {/* 거래소 잔고 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ExchangeCard
          name="업비트"
          type="현물"
          currency="KRW"
          configured={balance?.upbit.configured ?? false}
          balance={balance?.upbit.krw ?? 0}
          positions={balance?.upbit.positions ?? []}
          isLoading={balanceLoading}
          onGoToSettings={() => navigate('/settings')}
          formatBalance={(v) => `${v.toLocaleString('ko-KR')}원`}
        />
        <ExchangeCard
          name="OKX"
          type="선물"
          currency="USDT"
          configured={balance?.okx.configured ?? false}
          balance={balance?.okx.usd ?? 0}
          positions={balance?.okx.positions ?? []}
          isLoading={balanceLoading}
          onGoToSettings={() => navigate('/settings')}
          formatBalance={(v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
        />
      </div>

      {/* 거래 내역 */}
      <div className="card-surface rounded-md p-5">
        <div className="flex items-center justify-between">
          <h3 className="data-table-header">거래 내역</h3>
          <div className="flex items-center gap-2">
            <select
              value={exchangeFilter}
              onChange={(e) => { setExchangeFilter(e.target.value); setTradesPage(0) }}
              className="rounded border border-border bg-background px-2 py-1 text-[11px] text-text-secondary focus:outline-none"
            >
              <option value="">전체 거래소</option>
              <option value="upbit">업비트</option>
              <option value="okx">OKX</option>
            </select>
            <select
              value={daysFilter}
              onChange={(e) => { setDaysFilter(parseInt(e.target.value, 10)); setTradesPage(0) }}
              className="rounded border border-border bg-background px-2 py-1 text-[11px] text-text-secondary focus:outline-none"
            >
              <option value="0">전체 기간</option>
              <option value="7">최근 7일</option>
              <option value="30">최근 30일</option>
              <option value="90">최근 90일</option>
            </select>
          </div>
        </div>

        {tradesLoading ? (
          <div className="mt-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 skeleton-shimmer rounded" />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="py-10 text-center" style={{ border: '1px dashed var(--border)', borderRadius: '6px', marginTop: '16px' }}>
            <FileText className="mx-auto mb-2 h-8 w-8 text-text-faint" />
            <p className="text-[13px] font-medium text-text-secondary">거래 기록이 없습니다</p>
            <p className="mt-1 text-[11px] text-text-muted">가상매매 또는 실전매매에서 거래가 발생하면 여기에 표시됩니다</p>
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border-subtle text-left">
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-faint">시각</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-faint">거래소</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-faint">종목</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-text-faint">방향</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-faint">진입가</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-faint">청산가</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-faint">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id} className="border-t border-border-subtle hover:bg-surface-hover">
                      <td className="px-3 py-2 text-text-muted">{formatDate(trade.closed_at)}</td>
                      <td className="px-3 py-2 text-text-secondary">{trade.exchange ?? '—'}</td>
                      <td className="px-3 py-2 font-medium text-text-primary">{trade.symbol}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          trade.direction === 'long' ? 'bg-[var(--profit-bg)] text-profit' : 'bg-[var(--loss-bg)] text-loss'
                        }`}>
                          {trade.direction === 'long' ? '매수' : '매도'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-trading text-text-secondary">
                        {trade.entry_price?.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-trading text-text-secondary">
                        {trade.exit_price?.toLocaleString() ?? '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono-trading ${
                        (trade.pnl_pct ?? 0) >= 0 ? 'text-profit' : 'text-loss'
                      }`}>
                        {trade.pnl_pct != null ? formatPercent(trade.pnl_pct) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="mt-4 space-y-2 md:hidden">
              {trades.map((trade) => (
                <div key={trade.id} className="rounded-md bg-secondary p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text-primary">{trade.symbol}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        trade.direction === 'long' ? 'bg-[var(--profit-bg)] text-profit' : 'bg-[var(--loss-bg)] text-loss'
                      }`}>
                        {trade.direction === 'long' ? '매수' : '매도'}
                      </span>
                    </div>
                    <span className={`font-mono-trading text-[12px] ${
                      (trade.pnl_pct ?? 0) >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {trade.pnl_pct != null ? formatPercent(trade.pnl_pct) : '—'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-text-faint">{formatDate(trade.closed_at)}</p>
                </div>
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setTradesPage(Math.max(0, tradesPage - 1))}
                  disabled={tradesPage === 0}
                  className="rounded border border-border p-1.5 text-text-muted hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[11px] text-text-muted">
                  {tradesPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setTradesPage(Math.min(totalPages - 1, tradesPage + 1))}
                  disabled={tradesPage >= totalPages - 1}
                  className="rounded border border-border p-1.5 text-text-muted hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ExchangeCard({ name, type, currency, configured, balance, positions, isLoading, onGoToSettings, formatBalance }: {
  name: string
  type: string
  currency: string
  configured: boolean
  balance: number
  positions: Array<{ symbol: string; qty: number; entryPrice: number; pnl: number }>
  isLoading: boolean
  onGoToSettings: () => void
  formatBalance: (v: number) => string
}) {
  if (isLoading) {
    return (
      <div className="card-surface rounded-md p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-24 skeleton-shimmer rounded" />
          <div className="h-3 w-16 skeleton-shimmer rounded" />
        </div>
        <div className="h-8 w-40 skeleton-shimmer rounded" />
        <div className="mt-2 h-3 w-20 skeleton-shimmer rounded" />
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="card-surface rounded-md p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="data-table-header">{name} ({type})</h3>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-text-faint">미설정</span>
        </div>
        <div className="mt-4 text-center" style={{ border: '1px dashed var(--border)', borderRadius: '6px', padding: '20px' }}>
          <Key className="mx-auto mb-2 h-6 w-6 text-text-faint" />
          <p className="text-[12px] text-text-secondary">API 키를 설정하면 잔고를 확인할 수 있습니다</p>
          <button
            onClick={onGoToSettings}
            className="mt-3 flex items-center gap-1 mx-auto rounded-md border border-border px-3 py-1.5 text-[11px] text-text-muted hover:bg-secondary"
          >
            <Settings className="h-3 w-3" />
            설정으로 이동
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card-surface rounded-md p-4">
      <div className="flex items-center justify-between">
        <h3 className="data-table-header">{name} ({type})</h3>
        <span className="flex items-center gap-1 text-[10px] text-profit">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-profit status-active" />
          연결됨
        </span>
      </div>
      <div className="mt-2 font-mono-trading text-[24px] font-bold text-text-primary">
        {formatBalance(balance)}
      </div>
      {positions.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {positions.map((pos, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">{pos.symbol}</span>
              <span className="font-mono-trading text-text-muted">{pos.entryPrice.toLocaleString()}</span>
              <span className={`font-mono-trading ${pos.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatPercent(pos.pnl)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-text-faint">보유 코인: 없음</p>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${min}`
}
