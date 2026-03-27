import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  Scale,
  Zap,
  Power,
  Save,
  RotateCcw,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Settings2,
  Lock,
} from 'lucide-react'
import { api } from '../services/api'
import { useStrategyStore } from '../stores/strategy-store'
import { TermTooltip } from '../components/ui/term-tooltip'
import type { RiskProfile } from '../types/trading'

interface StrategyData {
  id: string
  name: string
  type: string
  params: Record<string, unknown>
  risk_profile: string
  is_active: boolean
  mode: string
  exchange: string
  implemented?: boolean
}

interface StrategyListResponse {
  data: StrategyData[]
}

const DEFAULT_PARAMS: Record<string, number> = {
  zScoreEntry: -1.0,
  zScoreExit: 0.0,
  rsiMax: 78,
  maxPositions: 5,
  atrStopMult: 2.7,
  timeLimitCandles: 8,
}

const PARAM_CONFIG: Array<{
  key: string
  label: string
  term: string
  min: number
  max: number
  step: number
  unit: string
}> = [
  { key: 'zScoreEntry', label: 'z-score 진입', term: 'z_score', min: -3, max: 0, step: 0.1, unit: '' },
  { key: 'zScoreExit', label: 'z-score 청산', term: 'z_score', min: -1, max: 2, step: 0.1, unit: '' },
  { key: 'rsiMax', label: 'RSI 상한', term: 'rsi', min: 50, max: 95, step: 1, unit: '' },
  { key: 'maxPositions', label: '최대 동시 보유', term: '', min: 1, max: 10, step: 1, unit: '종목' },
  { key: 'atrStopMult', label: 'ATR 손절 배수', term: 'atr', min: 1, max: 5, step: 0.1, unit: 'x' },
  { key: 'timeLimitCandles', label: '시간 청산', term: '', min: 1, max: 50, step: 1, unit: '캔들' },
]

const PROFILE_CONFIG: Array<{
  value: RiskProfile
  name: string
  description: string
  leverage: string
  maxPositions: number
  mdd: string
  icon: typeof Shield
}> = [
  {
    value: 'conservative',
    name: '안전',
    description: '현물만, 낮은 레버리지, 제한된 동시 보유',
    leverage: '1x',
    maxPositions: 3,
    mdd: '10%',
    icon: Shield,
  },
  {
    value: 'moderate',
    name: '중립',
    description: '현물+선물, 적정 레버리지, 균형 잡힌 리스크',
    leverage: '1~2x',
    maxPositions: 5,
    mdd: '15%',
    icon: Scale,
  },
  {
    value: 'aggressive',
    name: '공격',
    description: '적극적 레버리지, 다중 전략, 높은 리스크 허용',
    leverage: '2~3x',
    maxPositions: 8,
    mdd: '25%',
    icon: Zap,
  },
]

export function StrategyPage() {
  const queryClient = useQueryClient()
  const { selectedProfile, setSelectedProfile } = useStrategyStore()

  const { data: strategyResponse, isLoading, error } = useQuery<StrategyListResponse>({
    queryKey: ['strategies'],
    queryFn: () => api.getStrategies() as Promise<StrategyListResponse>,
  })

  const strategies = strategyResponse?.data ?? []

  const profileMutation = useMutation({
    mutationFn: (profile: RiskProfile) =>
      api.updateRiskProfile({ riskProfile: profile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] })
    },
  })

  const handleProfileSelect = (profile: RiskProfile) => {
    setSelectedProfile(profile)
    profileMutation.mutate(profile)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">전략 관리</h2>
        <p className="text-[12px] text-text-muted">매매 전략과 투자 성향을 설정합니다</p>
      </div>

      {/* 투자 성향 선택 */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">
          <TermTooltip term="risk_profile">투자 성향</TermTooltip>
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PROFILE_CONFIG.map((profile) => {
            const Icon = profile.icon
            const isActive = selectedProfile === profile.value
            return (
              <button
                key={profile.value}
                onClick={() => handleProfileSelect(profile.value)}
                className={`rounded-md border p-4 text-left transition-colors ${
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                    : 'border-border-subtle hover:border-border hover:bg-surface-hover'
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[var(--accent)]' : 'text-text-muted'}`} />
                  <h4 className="text-[13px] font-semibold">{profile.name}</h4>
                  {isActive && (
                    <span className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                      선택됨
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted">{profile.description}</p>
                <div className="mt-3 flex gap-4 text-[11px] text-text-secondary">
                  <span>레버리지: <strong>{profile.leverage}</strong></span>
                  <span>최대 보유: <strong>{profile.maxPositions}</strong></span>
                  <span>
                    <TermTooltip term="mdd">MDD</TermTooltip> 한도: <strong>{profile.mdd}</strong>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 전략 목록 */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">전략 목록</h3>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 skeleton-shimmer rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-text-muted">
            <AlertTriangle className="h-4 w-4 text-loss" />
            설정을 불러올 수 없습니다
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['strategies'] })}
              className="ml-2 text-[var(--accent)] hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {strategies.map((strategy) => (
              <StrategyCard key={strategy.id} strategy={strategy} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StrategyCard({ strategy }: { strategy: StrategyData }) {
  const queryClient = useQueryClient()
  const isImplemented = strategy.implemented !== false
  const [editingParams, setEditingParams] = useState<Record<string, number> | null>(null)
  const [showParams, setShowParams] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () =>
      strategy.is_active
        ? api.deactivateStrategy(String(strategy.id))
        : api.activateStrategy(String(strategy.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] })
    },
  })

  const saveMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      api.updateStrategy(String(strategy.id), { params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] })
      setEditingParams(null)
    },
  })

  const currentParams = (editingParams ?? strategy.params ?? {}) as Record<string, number>

  const handleParamChange = (key: string, value: number) => {
    setEditingParams((prev) => ({
      ...(prev ?? (strategy.params as Record<string, number>) ?? DEFAULT_PARAMS),
      [key]: value,
    }))
  }

  const handleSave = () => {
    if (editingParams) {
      saveMutation.mutate(editingParams)
    }
  }

  const handleReset = () => {
    setEditingParams({ ...DEFAULT_PARAMS })
  }

  const strategyDescriptions: Record<string, string> = {
    regime_mean_reversion: 'BTC Risk-On 시 z-score로 눌린 알트코인을 매수',
    dominance_rotation: 'BTC.D 하락 + USDT.D 하락 시 알트 시즌 포착',
    volatility_timing: 'BTC 변동성 낮고 추세 양호 시 알트 익스포저 확대',
    funding_arbitrage: 'OKX 펀딩비 극단 시 델타중립 포지션',
  }

  return (
    <div className={`rounded-md border p-4 ${
      !isImplemented ? 'border-border-subtle opacity-60' : 'border-border'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-medium">{strategy.name}</h4>
          {strategy.is_active && isImplemented && (
            <span className="rounded bg-[var(--profit-bg)] px-2 py-0.5 text-[10px] font-semibold text-profit">
              활성
            </span>
          )}
          {!isImplemented && (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] text-text-faint">
              <Lock className="h-2.5 w-2.5" />
              개발 중
            </span>
          )}
        </div>
        {isImplemented && (
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              strategy.is_active
                ? 'bg-[var(--profit-bg)] text-profit hover:bg-profit hover:text-background'
                : 'bg-muted text-text-muted hover:bg-secondary hover:text-text-secondary'
            }`}
          >
            {toggleMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Power className="h-3 w-3" />
            )}
            {strategy.is_active ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-text-muted">
        {strategyDescriptions[strategy.type] ?? strategy.type}
      </p>
      <p className="mt-0.5 font-mono-trading text-[10px] text-text-faint">{strategy.type}</p>

      {/* 파라미터 편집 (구현된 전략만) */}
      {isImplemented && (
        <>
          <button
            onClick={() => setShowParams(!showParams)}
            className="mt-3 flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary"
          >
            <Settings2 className="h-3 w-3" />
            {showParams ? '파라미터 닫기' : '파라미터 설정'}
          </button>

          {showParams && (
            <div className="mt-3 space-y-2.5 border-t border-border-subtle pt-3">
              {PARAM_CONFIG.map((param) => {
                const value = currentParams[param.key] ?? DEFAULT_PARAMS[param.key]
                return (
                  <div key={param.key} className="flex items-center justify-between gap-4">
                    <label className="text-[11px] text-text-muted">
                      {param.term ? (
                        <TermTooltip term={param.term}>{param.label}</TermTooltip>
                      ) : (
                        param.label
                      )}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={value}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        onChange={(e) => handleParamChange(param.key, parseFloat(e.target.value))}
                        className="w-20 rounded border border-border bg-background px-2 py-1 font-mono-trading text-[12px] text-text-primary focus:border-[var(--accent)] focus:outline-none"
                      />
                      {param.unit && (
                        <span className="text-[10px] text-text-faint">{param.unit}</span>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!editingParams || saveMutation.isPending}
                  className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-background transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  저장
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-secondary"
                >
                  <RotateCcw className="h-3 w-3" />
                  기본값 복원
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
