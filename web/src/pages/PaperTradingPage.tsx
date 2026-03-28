import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Play,
  Pause,
  Square,
  Plus,
  Loader2,
  Inbox,
  BarChart3,
  AlertTriangle,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import { TermTooltip } from '../components/ui/term-tooltip'
import { formatPercent } from '../lib/utils'

interface SessionResponse {
  data: PaperSessionRow[]
}

interface PaperSessionRow {
  id: number
  name: string
  strategy_id: number | null
  initial_capital: number
  current_equity: number
  status: 'running' | 'paused' | 'completed'
  total_return: number
  sharpe_ratio: number | null
  max_drawdown: number | null
  win_rate: number | null
  total_trades: number
  started_at: string
  ended_at: string | null
}

export function PaperTradingPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<number | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data: sessionsResponse, isLoading, error } = useQuery<SessionResponse>({
    queryKey: ['paper-sessions'],
    queryFn: () => api.getPaperSessions() as Promise<SessionResponse>,
    refetchInterval: 60_000,
  })

  const sessions = sessionsResponse?.data ?? []
  const runningSessions = sessions.filter((s) => s.status === 'running')
  const activeSession = sessions.find((s) => s.id === activeTab) ?? sessions[0] ?? null

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">가상매매</h2>
          <p className="text-[13px] text-text-muted">
            실시간 데이터로 전략을 검증합니다 (실제 주문 없음)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-muted">
            활성 세션: {runningSessions.length}/10
          </span>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-background hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" />
            새 세션
          </button>
        </div>
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="card-surface rounded-md p-8">
          <div className="flex items-center justify-center gap-2 text-[12px] text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            세션 불러오는 중...
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="card-surface flex items-center justify-center gap-2 rounded-md p-8 text-[12px] text-text-muted">
          <AlertTriangle className="h-4 w-4 text-loss" />
          세션을 불러올 수 없습니다
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['paper-sessions'] })}
            className="ml-2 text-[var(--accent)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 빈 상태 */}
      {!isLoading && !error && sessions.length === 0 && (
        <div className="card-surface rounded-md p-10 text-center" style={{ border: '1px dashed var(--border)' }}>
          <Play className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-[13px] font-medium text-text-secondary">첫 가상매매 세션을 시작하세요</p>
          <p className="mt-1 text-[12px] text-text-muted">
            전략을 선택하고 가상 자본으로 실시간 시뮬레이션을 진행합니다
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-background hover:brightness-110"
          >
            새 세션 만들기
          </button>
        </div>
      )}

      {/* 세션 탭 + 내용 */}
      {!isLoading && sessions.length > 0 && (
        <>
          {/* 탭 바 */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle pb-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setActiveTab(session.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-[12px] transition-colors ${
                  (activeTab === session.id || (!activeTab && session === sessions[0]))
                    ? 'bg-surface text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <StatusDot status={session.status} />
                {session.name}
              </button>
            ))}
            <button
              onClick={() => setShowCompare(!showCompare)}
              className={`ml-auto flex items-center gap-1 px-3 py-2 text-[12px] transition-colors ${
                showCompare ? 'text-[var(--accent)]' : 'text-text-faint hover:text-text-muted'
              }`}
            >
              <BarChart3 className="h-3 w-3" />
              비교 모드
            </button>
          </div>

          {/* 선택된 세션 */}
          {activeSession && !showCompare && (
            <SessionDetail session={activeSession} />
          )}

          {/* 비교 모드 */}
          {showCompare && <CompareTable sessions={sessions} />}
        </>
      )}

      {/* 세션 생성 모달 */}
      {showCreateModal && (
        <CreateSessionModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? 'bg-profit' : status === 'paused' ? 'bg-warning' : 'bg-text-faint'
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${color} ${status === 'running' ? 'status-active' : ''}`} />
  )
}

function SessionDetail({ session }: { session: PaperSessionRow }) {
  const queryClient = useQueryClient()

  const actionMutation = useMutation({
    mutationFn: (action: string) =>
      api.updatePaperSession(String(session.id), { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper-sessions'] })
    },
  })

  const pnlPct = session.initial_capital > 0
    ? ((session.current_equity - session.initial_capital) / session.initial_capital) * 100
    : 0

  const startedAgo = getTimeAgo(session.started_at)

  return (
    <div className="space-y-4">
      {/* 세션 요약 */}
      <div className="card-surface rounded-md p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-medium">{session.name}</h3>
            <p className="text-[12px] text-text-muted">
              시작: {startedAgo} | 초기: {formatKrwShort(session.initial_capital)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session.status === 'running' && (
              <button
                onClick={() => actionMutation.mutate('pause')}
                disabled={actionMutation.isPending}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-muted hover:bg-secondary"
              >
                <Pause className="h-3 w-3" />
                일시정지
              </button>
            )}
            {session.status === 'paused' && (
              <button
                onClick={() => actionMutation.mutate('resume')}
                disabled={actionMutation.isPending}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-profit hover:bg-[var(--profit-bg)]"
              >
                <Play className="h-3 w-3" />
                재개
              </button>
            )}
            {session.status !== 'completed' && (
              <button
                onClick={() => actionMutation.mutate('stop')}
                disabled={actionMutation.isPending}
                className="flex items-center gap-1 rounded-md border border-loss px-2.5 py-1 text-[12px] text-loss hover:bg-[var(--loss-bg)]"
              >
                <Square className="h-3 w-3" />
                종료
              </button>
            )}
          </div>
        </div>

        {/* KPI */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="현재 자산"
            value={formatKrwShort(session.current_equity)}
            sub={formatPercent(pnlPct)}
            positive={pnlPct >= 0}
          />
          <KpiCard
            label={<TermTooltip term="sharpe">Sharpe</TermTooltip>}
            value={session.sharpe_ratio?.toFixed(2) ?? '—'}
          />
          <KpiCard
            label={<TermTooltip term="mdd">MDD</TermTooltip>}
            value={session.max_drawdown != null ? `${session.max_drawdown.toFixed(1)}%` : '—'}
            positive={false}
          />
          <KpiCard
            label={<TermTooltip term="win_rate">승률</TermTooltip>}
            value={session.win_rate != null ? `${session.win_rate.toFixed(1)}%` : '—'}
            sub={`${session.total_trades}건`}
          />
        </div>
      </div>

      {/* 가상 포지션 */}
      <div className="card-surface rounded-md p-4">
        <h4 className="data-table-header mb-3">가상 포지션</h4>
        <div className="flex items-center justify-center py-6">
          <div className="text-center">
            <Inbox className="mx-auto mb-2 h-6 w-6 text-text-faint" />
            <p className="text-[13px] text-text-muted">아직 진입 조건을 충족한 종목이 없습니다</p>
            <p className="mt-0.5 text-[12px] text-text-muted">다음 4H 분석에서 시그널이 발생하면 자동 진입합니다</p>
          </div>
        </div>
      </div>

      {/* 체결 내역 */}
      <div className="card-surface rounded-md p-4">
        <h4 className="data-table-header mb-3">최근 체결</h4>
        <p className="py-4 text-center text-[13px] text-text-muted">
          체결 기록이 쌓이면 여기에 표시됩니다
        </p>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, positive }: {
  label: React.ReactNode
  value: string
  sub?: string
  positive?: boolean
}) {
  return (
    <div className="rounded-md bg-secondary p-3">
      <p className="text-[12px] font-semibold text-text-muted">{label}</p>
      <p className="mt-1 font-mono-trading text-[16px] font-bold text-text-primary">{value}</p>
      {sub && (
        <p className={`mt-0.5 font-mono-trading text-[12px] ${
          positive === true ? 'text-profit' : positive === false ? 'text-loss' : 'text-text-muted'
        }`}>
          {sub}
        </p>
      )}
    </div>
  )
}

function CompareTable({ sessions }: { sessions: PaperSessionRow[] }) {
  if (sessions.length < 2) {
    return (
      <div className="card-surface rounded-md p-8 text-center">
        <BarChart3 className="mx-auto mb-2 h-6 w-6 text-text-faint" />
        <p className="text-[12px] text-text-muted">2개 이상 세션이 필요합니다</p>
      </div>
    )
  }

  return (
    <div className="card-surface overflow-x-auto rounded-md">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <th className="px-4 py-2.5 text-[12px] font-semibold text-text-muted">세션</th>
            <th className="px-4 py-2.5 text-[12px] font-semibold text-text-muted">상태</th>
            <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-text-muted">수익률</th>
            <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-text-muted">
              <TermTooltip term="sharpe">Sharpe</TermTooltip>
            </th>
            <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-text-muted">
              <TermTooltip term="win_rate">승률</TermTooltip>
            </th>
            <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-text-muted">
              <TermTooltip term="mdd">MDD</TermTooltip>
            </th>
            <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-text-muted">거래</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const pnlPct = session.initial_capital > 0
              ? ((session.current_equity - session.initial_capital) / session.initial_capital) * 100
              : 0
            return (
              <tr key={session.id} className="border-t border-border-subtle hover:bg-surface-hover">
                <td className="px-4 py-2.5 font-medium text-text-primary">{session.name}</td>
                <td className="px-4 py-2.5">
                  <StatusDot status={session.status} />
                  <span className="ml-1.5 text-text-muted">{
                    session.status === 'running' ? '실행 중' :
                    session.status === 'paused' ? '일시정지' : '완료'
                  }</span>
                </td>
                <td className={`px-4 py-2.5 text-right font-mono-trading ${pnlPct >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatPercent(pnlPct)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono-trading text-text-secondary">
                  {session.sharpe_ratio?.toFixed(2) ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono-trading text-text-secondary">
                  {session.win_rate != null ? `${session.win_rate.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono-trading text-loss">
                  {session.max_drawdown != null ? `${session.max_drawdown.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono-trading text-text-secondary">
                  {session.total_trades}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CreateSessionModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [capital, setCapital] = useState(10_000_000)

  const createMutation = useMutation({
    mutationFn: () =>
      api.startPaperSession({ name, initialCapital: capital }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper-sessions'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">새 가상매매 세션</h3>
          <button onClick={onClose} className="text-text-faint hover:text-text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-text-muted">세션 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 평균회귀 테스트 #1"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-text-primary placeholder:text-text-faint focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-text-muted">초기 자본 (KRW)</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(parseInt(e.target.value, 10) || 0)}
              min={100_000}
              max={1_000_000_000}
              step={1_000_000}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono-trading text-[13px] text-text-primary focus:border-[var(--accent)] focus:outline-none"
            />
            <p className="mt-1 text-[12px] text-text-muted">
              {formatKrwShort(capital)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[12px] text-text-muted hover:bg-secondary"
          >
            취소
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-background hover:brightness-110 disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
          >
            {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            세션 시작
          </button>
        </div>

        {createMutation.isError && (
          <p className="mt-3 text-[12px] text-loss">세션 생성에 실패했습니다. 다시 시도해주세요.</p>
        )}
      </div>
    </div>
  )
}

function formatKrwShort(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`
  return value.toLocaleString('ko-KR') + '원'
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
