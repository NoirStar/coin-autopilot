import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Key,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Loader2,
  Check,
  Trash2,
  Bell,
  Shield,
  Server,
} from 'lucide-react'
import { api } from '../services/api'
import { useSettingsStore } from '../stores/settings-store'
import { TermTooltip } from '../components/ui/term-tooltip'

interface UserSettings {
  risk_profile: string
  daily_max_loss_pct: number
  position_max_loss_pct: number
  mdd_warning_pct: number
  mdd_stop_pct: number
  upbit_configured: boolean
  okx_configured: boolean
  telegram_enabled: boolean
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  discord_enabled: boolean
  discord_webhook_url: string | null
  alert_on_signal: boolean
  alert_on_mdd: boolean
  alert_on_regime: boolean
  alert_on_execution: boolean
}

interface SettingsResponse {
  data: UserSettings
}

interface AgentStatusResponse {
  agentId: string
  state: string
  uptimeSeconds: number
  activePositions: number
  activeStrategies: number
  wsConnections: Record<string, boolean>
}

const DEFAULT_RISK = {
  daily_max_loss_pct: 2.0,
  position_max_loss_pct: 0.30,
  mdd_warning_pct: 15.0,
  mdd_stop_pct: 25.0,
}

export function SettingsPage() {
  const { setUpbitConfigured, setOkxConfigured } = useSettingsStore()

  const { data: settingsResponse, isLoading } = useQuery<SettingsResponse>({
    queryKey: ['user-settings'],
    queryFn: () => api.getSettings() as Promise<SettingsResponse>,
  })

  const { data: agentStatus } = useQuery<AgentStatusResponse>({
    queryKey: ['agent-status'],
    queryFn: () => api.getAgentStatus() as Promise<AgentStatusResponse>,
    refetchInterval: 30_000,
  })

  const settings = settingsResponse?.data

  useEffect(() => {
    if (settings) {
      setUpbitConfigured(settings.upbit_configured)
      setOkxConfigured(settings.okx_configured)
    }
  }, [settings, setUpbitConfigured, setOkxConfigured])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">설정</h2>
        <p className="text-[13px] text-text-muted">API 키, 리스크 파라미터, 알림을 관리합니다</p>
      </div>

      {/* 서버 상태 */}
      {agentStatus && (
        <div className="card-surface rounded-md p-4">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-text-faint" />
            <h3 className="data-table-header">서버 상태</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatusItem
              label="상태"
              value={agentStatus.state === 'running' ? '실행 중' : agentStatus.state}
              active={agentStatus.state === 'running'}
            />
            <StatusItem
              label="업타임"
              value={formatUptime(agentStatus.uptimeSeconds)}
            />
            <StatusItem
              label="활성 전략"
              value={String(agentStatus.activeStrategies)}
            />
            <StatusItem
              label="활성 포지션"
              value={String(agentStatus.activePositions)}
            />
          </div>
        </div>
      )}

      {/* API 키 관리 */}
      <ApiKeySection settings={settings} isLoading={isLoading} />

      {/* 리스크 파라미터 */}
      <RiskParameterSection settings={settings} isLoading={isLoading} />

      {/* 알림 설정 */}
      <AlertSection settings={settings} isLoading={isLoading} />

      {/* 위험 영역 */}
      <DangerZone />
    </div>
  )
}

function StatusItem({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-text-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
        {active && <span className="inline-block h-1.5 w-1.5 rounded-full bg-profit status-active" />}
        {value}
      </p>
    </div>
  )
}

function ApiKeySection({ settings, isLoading }: { settings: UserSettings | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="card-surface rounded-md p-5">
        <div className="mb-4 h-4 w-24 skeleton-shimmer rounded" />
        <div className="space-y-3">
          <div className="h-16 skeleton-shimmer rounded-lg" />
          <div className="h-16 skeleton-shimmer rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="card-surface rounded-md p-5">
      <div className="flex items-center gap-2">
        <Key className="h-3.5 w-3.5 text-text-faint" />
        <h3 className="data-table-header">API 키 관리</h3>
      </div>
      <div className="mt-4 space-y-3">
        <ApiKeyCard
          exchange="업비트"
          description="현물 매매 · KRW 마켓"
          configured={settings?.upbit_configured ?? false}
          permissions="읽기 + 거래"
        />
        <ApiKeyCard
          exchange="OKX"
          description="선물 매매 · USDT 무기한"
          configured={settings?.okx_configured ?? false}
          permissions="읽기 + 거래 (출금 권한 금지)"
        />
      </div>
      <p className="mt-4 text-[11px] text-text-muted">
        API 키는 서버에 암호화되어 저장됩니다. 출금 권한은 절대 부여하지 마세요.
      </p>
    </div>
  )
}

function ApiKeyCard({ exchange, description, configured, permissions }: {
  exchange: string
  description: string
  configured: boolean
  permissions: string
}) {
  const [showForm, setShowForm] = useState(false)
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-medium">{exchange}</h4>
          <p className="text-[11px] text-text-muted">{description}</p>
        </div>
        {configured ? (
          <span className="flex items-center gap-1 rounded-full bg-[var(--profit-bg)] px-2.5 py-0.5 text-[11px] font-medium text-profit">
            <Check className="h-2.5 w-2.5" />
            연결됨
          </span>
        ) : (
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-text-muted">미설정</span>
        )}
      </div>

      {!configured && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
        >
          <Key className="h-3 w-3" />
          API 키 등록
        </button>
      )}

      {showForm && (
        <div className="mt-3 space-y-2.5 border-t border-border-subtle pt-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Access Key</label>
            <input
              type="text"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="API 키를 입력하세요"
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-faint focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Secret Key</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="시크릿 키를 입력하세요"
                className="w-full rounded border border-border bg-background px-3 py-1.5 pr-8 text-[12px] text-text-primary placeholder:text-text-faint focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-text-muted">필요 권한: {permissions}</p>
          <div className="flex gap-2">
            <button className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-background hover:brightness-110">
              <Save className="h-3 w-3" />
              저장
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-3 py-1.5 text-[11px] text-text-muted hover:bg-secondary"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {configured && (
        <div className="mt-3 flex gap-2">
          <button className="text-[11px] text-text-muted hover:text-text-secondary">수정</button>
          <span className="text-text-faint">·</span>
          <button className="text-[11px] text-loss hover:underline">삭제</button>
        </div>
      )}
    </div>
  )
}

function RiskParameterSection({ settings, isLoading }: { settings: UserSettings | undefined; isLoading: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(DEFAULT_RISK)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setValues({
        daily_max_loss_pct: settings.daily_max_loss_pct,
        position_max_loss_pct: settings.position_max_loss_pct,
        mdd_warning_pct: settings.mdd_warning_pct,
        mdd_stop_pct: settings.mdd_stop_pct,
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => api.updateRiskProfile({
      dailyMaxLossPct: values.daily_max_loss_pct,
      positionMaxLossPct: values.position_max_loss_pct,
      mddWarningPct: values.mdd_warning_pct,
      mddStopPct: values.mdd_stop_pct,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      setEditing(false)
      setToast('설정이 저장되었습니다')
      setTimeout(() => setToast(null), 3000)
    },
    onError: () => {
      setToast('저장에 실패했습니다')
      setTimeout(() => setToast(null), 3000)
    },
  })

  if (isLoading) {
    return (
      <div className="card-surface rounded-md p-5">
        <div className="mb-4 h-4 w-28 skeleton-shimmer rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 skeleton-shimmer rounded" />
          ))}
        </div>
      </div>
    )
  }

  const params: Array<{
    key: keyof typeof DEFAULT_RISK
    label: string
    term: string
    min: number
    max: number
    step: number
    defaultVal: number
  }> = [
    { key: 'daily_max_loss_pct', label: '일일 최대 손실', term: '', min: 0.5, max: 10, step: 0.1, defaultVal: 2.0 },
    { key: 'position_max_loss_pct', label: '단일 포지션 손실', term: '', min: 0.1, max: 5, step: 0.01, defaultVal: 0.30 },
    { key: 'mdd_warning_pct', label: 'MDD 경고 한도', term: 'mdd', min: 5, max: 50, step: 1, defaultVal: 15.0 },
    { key: 'mdd_stop_pct', label: 'MDD 중단 한도', term: 'mdd', min: 10, max: 50, step: 1, defaultVal: 25.0 },
  ]

  return (
    <div className="card-surface rounded-md p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-text-faint" />
          <h3 className="data-table-header">리스크 파라미터</h3>
        </div>
        {toast && (
          <span className="flex items-center gap-1 text-[11px] text-profit">
            <Check className="h-3 w-3" />
            {toast}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {params.map((param) => (
          <div key={param.key} className="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <span className="text-[12px] text-text-muted">
              {param.term ? (
                <TermTooltip term={param.term}>{param.label}</TermTooltip>
              ) : (
                param.label
              )}
            </span>
            {editing ? (
              <input
                type="number"
                value={values[param.key]}
                min={param.min}
                max={param.max}
                step={param.step}
                onChange={(e) => setValues((prev) => ({ ...prev, [param.key]: parseFloat(e.target.value) }))}
                className="w-24 rounded border border-border bg-background px-2 py-1 text-right font-mono-trading text-[12px] text-text-primary focus:border-[var(--accent)] focus:outline-none"
              />
            ) : (
              <span className="font-mono-trading text-[13px] font-medium text-text-primary">
                {values[param.key]}%
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        {editing ? (
          <>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-background hover:brightness-110"
            >
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              저장
            </button>
            <button
              onClick={() => { setValues(DEFAULT_RISK); }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] text-text-muted hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" />
              기본값 복원
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1.5 text-[11px] text-text-muted hover:bg-secondary"
            >
              취소
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] text-text-muted hover:bg-secondary"
          >
            수정
          </button>
        )}
      </div>
    </div>
  )
}

function AlertSection({ settings, isLoading }: { settings: UserSettings | undefined; isLoading: boolean }) {
  const queryClient = useQueryClient()

  const alertMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.updateAlerts(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
    },
  })

  if (isLoading) {
    return (
      <div className="card-surface rounded-md p-5">
        <div className="mb-4 h-4 w-20 skeleton-shimmer rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 skeleton-shimmer rounded" />
          ))}
        </div>
      </div>
    )
  }

  const alertConditions = [
    { key: 'alertOnSignal', label: '시그널 발생', value: settings?.alert_on_signal ?? true },
    { key: 'alertOnMdd', label: 'MDD 경고', value: settings?.alert_on_mdd ?? true },
    { key: 'alertOnRegime', label: '레짐 전환', value: settings?.alert_on_regime ?? true },
    { key: 'alertOnExecution', label: '체결 알림', value: settings?.alert_on_execution ?? false },
  ]

  return (
    <div className="card-surface rounded-md p-5">
      <div className="flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-text-faint" />
        <h3 className="data-table-header">알림 설정</h3>
      </div>

      <div className="mt-4 space-y-3">
        <AlertChannelRow
          name="Telegram"
          enabled={settings?.telegram_enabled ?? false}
          onToggle={(v) => alertMutation.mutate({ telegramEnabled: v })}
        />
        <AlertChannelRow
          name="Discord"
          enabled={settings?.discord_enabled ?? false}
          onToggle={(v) => alertMutation.mutate({ discordEnabled: v })}
        />
      </div>

      <div className="mt-4 border-t border-border-subtle pt-4">
        <p className="mb-2.5 text-[12px] font-semibold text-text-muted">알림 조건</p>
        <div className="space-y-2">
          {alertConditions.map((condition) => (
            <label key={condition.key} className="flex items-center justify-between text-[12px]">
              <span className="text-text-secondary">{condition.label}</span>
              <ToggleSwitch
                checked={condition.value}
                onChange={(v) => alertMutation.mutate({ [condition.key]: v })}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function AlertChannelRow({ name, enabled, onToggle }: {
  name: string
  enabled: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-text-secondary">{name} 알림</span>
      <ToggleSwitch checked={enabled} onChange={onToggle} />
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-profit' : 'bg-[var(--border)]'
      }`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
        checked ? 'left-[18px]' : 'left-0.5'
      }`} />
    </button>
  )
}

function DangerZone() {
  const [showConfirm, setShowConfirm] = useState<string | null>(null)

  const actions = [
    { id: 'cache', label: '캐시 초기화', description: '로컬 캐시 데이터를 삭제합니다' },
    { id: 'paper', label: '가상매매 데이터 삭제', description: '모든 가상매매 세션과 기록을 삭제합니다' },
    { id: 'account', label: '계정 삭제', description: '모든 데이터가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.' },
  ]

  return (
    <div className="rounded-md border border-loss p-5">
      <h3 className="data-table-header text-loss">데이터 관리</h3>
      <div className="mt-4 space-y-2.5">
        {actions.map((action) => (
          <div key={action.id} className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-text-secondary">{action.label}</p>
              <p className="text-[11px] text-text-muted">{action.description}</p>
            </div>
            {showConfirm === action.id ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-loss">정말 삭제하시겠습니까?</span>
                <button
                  onClick={() => setShowConfirm(null)}
                  className="rounded border border-loss px-2 py-1 text-[11px] font-medium text-loss hover:bg-[var(--loss-bg)]"
                >
                  확인
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  className="rounded border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-secondary"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm(action.id)}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-text-muted hover:border-loss hover:text-loss"
              >
                <Trash2 className="h-3 w-3" />
                삭제
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 24) {
    const d = Math.floor(h / 24)
    return `${d}일 ${h % 24}시간`
  }
  return `${h}시간 ${m}분`
}
