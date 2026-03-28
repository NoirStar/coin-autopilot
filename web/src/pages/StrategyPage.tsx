import { useState } from 'react'
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

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  alt_mean_reversion: {
    zScoreEntry: -1.0,
    zScoreExit: 0.0,
    rsiMax: 78,
    maxPositions: 5,
    atrStopMult: 2.7,
    timeLimitCandles: 8,
  },
  btc_ema_crossover: {
    fastEma: 12,
    slowEma: 26,
    trendEma: 200,
    adxThreshold: 20,
    atrStopMult: 1.5,
    atrTrailMult: 2.0,
    timeLimitCandles: 30,
    leverage: 2,
  },
  btc_bollinger_reversion: {
    bbPeriod: 20,
    bbStdDev: 2,
    rsiOversold: 30,
    rsiOverbought: 70,
    trendEma: 200,
    atrStopMult: 1.0,
    timeLimitCandles: 20,
    leverage: 2,
  },
  btc_macd_momentum: {
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    rsiPeriod: 14,
    adxThreshold: 25,
    atrStopMult: 1.5,
    atrTrailMult: 2.5,
    timeLimitCandles: 24,
    leverage: 2,
  },
  btc_donchian_breakout: {
    donchianPeriod: 20,
    atrStopMult: 1.5,
    atrTrailMult: 3.0,
    volumeMultiplier: 2.0,
    timeLimitCandles: 20,
    leverage: 2,
  },
}

type ParamDef = {
  key: string
  label: string
  term: string
  min: number
  max: number
  step: number
  unit: string
}

const PARAM_CONFIG: Record<string, ParamDef[]> = {
  alt_mean_reversion: [
    { key: 'zScoreEntry', label: 'z-score 진입', term: 'z_score', min: -3, max: 0, step: 0.1, unit: '' },
    { key: 'zScoreExit', label: 'z-score 청산', term: 'z_score', min: -1, max: 2, step: 0.1, unit: '' },
    { key: 'rsiMax', label: 'RSI 상한', term: 'rsi', min: 50, max: 95, step: 1, unit: '' },
    { key: 'maxPositions', label: '최대 동시 보유', term: '', min: 1, max: 10, step: 1, unit: '종목' },
    { key: 'atrStopMult', label: 'ATR 손절 배수', term: 'atr', min: 1, max: 5, step: 0.1, unit: 'x' },
    { key: 'timeLimitCandles', label: '시간 청산', term: '', min: 1, max: 50, step: 1, unit: '캔들' },
  ],
  btc_ema_crossover: [
    { key: 'fastEma', label: 'Fast EMA', term: 'ema', min: 5, max: 50, step: 1, unit: '' },
    { key: 'slowEma', label: 'Slow EMA', term: 'ema', min: 10, max: 100, step: 1, unit: '' },
    { key: 'trendEma', label: '트렌드 EMA', term: 'ema', min: 50, max: 400, step: 10, unit: '' },
    { key: 'adxThreshold', label: 'ADX 임계값', term: 'adx', min: 10, max: 50, step: 1, unit: '' },
    { key: 'atrStopMult', label: 'ATR 손절 배수', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'atrTrailMult', label: 'ATR 트레일링', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'timeLimitCandles', label: '시간 청산', term: '', min: 1, max: 100, step: 1, unit: '캔들' },
    { key: 'leverage', label: '레버리지', term: '', min: 1, max: 5, step: 1, unit: 'x' },
  ],
  btc_bollinger_reversion: [
    { key: 'bbPeriod', label: 'BB 기간', term: 'bollinger', min: 10, max: 50, step: 1, unit: '' },
    { key: 'bbStdDev', label: 'BB 표준편차', term: 'bollinger', min: 1, max: 4, step: 0.5, unit: '' },
    { key: 'rsiOversold', label: 'RSI 과매도', term: 'rsi', min: 10, max: 40, step: 1, unit: '' },
    { key: 'rsiOverbought', label: 'RSI 과매수', term: 'rsi', min: 60, max: 90, step: 1, unit: '' },
    { key: 'trendEma', label: '트렌드 EMA', term: 'ema', min: 50, max: 400, step: 10, unit: '' },
    { key: 'atrStopMult', label: 'ATR 손절 배수', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'timeLimitCandles', label: '시간 청산', term: '', min: 1, max: 50, step: 1, unit: '캔들' },
    { key: 'leverage', label: '레버리지', term: '', min: 1, max: 5, step: 1, unit: 'x' },
  ],
  btc_macd_momentum: [
    { key: 'macdFast', label: 'MACD Fast', term: 'macd', min: 5, max: 30, step: 1, unit: '' },
    { key: 'macdSlow', label: 'MACD Slow', term: 'macd', min: 10, max: 60, step: 1, unit: '' },
    { key: 'macdSignal', label: 'MACD Signal', term: 'macd', min: 3, max: 20, step: 1, unit: '' },
    { key: 'adxThreshold', label: 'ADX 임계값', term: 'adx', min: 10, max: 50, step: 1, unit: '' },
    { key: 'atrStopMult', label: 'ATR 손절 배수', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'atrTrailMult', label: 'ATR 트레일링', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'timeLimitCandles', label: '시간 청산', term: '', min: 1, max: 50, step: 1, unit: '캔들' },
    { key: 'leverage', label: '레버리지', term: '', min: 1, max: 5, step: 1, unit: 'x' },
  ],
  btc_donchian_breakout: [
    { key: 'donchianPeriod', label: '돈치안 기간', term: '', min: 10, max: 50, step: 1, unit: '' },
    { key: 'atrStopMult', label: 'ATR 손절 배수', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'atrTrailMult', label: 'ATR 트레일링', term: 'atr', min: 0.5, max: 5, step: 0.1, unit: 'x' },
    { key: 'volumeMultiplier', label: '볼륨 배수', term: '', min: 1, max: 5, step: 0.1, unit: 'x' },
    { key: 'timeLimitCandles', label: '시간 청산', term: '', min: 1, max: 50, step: 1, unit: '캔들' },
    { key: 'leverage', label: '레버리지', term: '', min: 1, max: 5, step: 1, unit: 'x' },
  ],
}

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
        <p className="text-[13px] text-text-muted">매매 전략과 투자 성향을 설정합니다</p>
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
                    <span className="rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[12px] font-medium text-[var(--accent)]">
                      선택됨
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-text-muted">{profile.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-secondary">
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
  const strategyDefaults = DEFAULT_PARAMS[strategy.type] ?? DEFAULT_PARAMS.alt_mean_reversion ?? {}
  const strategyParamConfig = PARAM_CONFIG[strategy.type] ?? PARAM_CONFIG.alt_mean_reversion ?? []

  const handleParamChange = (key: string, value: number) => {
    setEditingParams((prev) => ({
      ...(prev ?? (strategy.params as Record<string, number>) ?? strategyDefaults),
      [key]: value,
    }))
  }

  const handleSave = () => {
    if (editingParams) {
      saveMutation.mutate(editingParams)
    }
  }

  const handleReset = () => {
    setEditingParams({ ...strategyDefaults })
  }

  const strategyDescriptions: Record<string, string> = {
    alt_mean_reversion: 'BTC Risk-On 시 z-score로 눌린 알트코인을 매수',
    btc_ema_crossover: 'EMA(12/26) 크로스 + EMA(200) 트렌드 필터. OKX 선물 롱/숏',
    btc_bollinger_reversion: '볼린저 밴드 상/하단 터치 + RSI 확인 반전 매매. OKX 선물',
    btc_macd_momentum: 'MACD 히스토그램 전환 + ADX 트렌드 확인. OKX 선물',
    btc_donchian_breakout: '돈치안 채널 20기간 돌파 + 볼륨 확인. OKX 선물',
    regime_mean_reversion: 'BTC Risk-On 시 z-score로 눌린 알트코인을 매수',
  }

  return (
    <div className={`rounded-md border p-4 ${
      !isImplemented ? 'border-border-subtle text-[var(--text-faint)]' : 'border-border'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-medium">{strategy.name}</h4>
          {strategy.is_active && isImplemented && (
            <span className="rounded bg-[var(--profit-bg)] px-2 py-0.5 text-[12px] font-semibold text-profit">
              활성
            </span>
          )}
          {!isImplemented && (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[12px] text-text-muted">
              <Lock className="h-2.5 w-2.5" />
              개발 중
            </span>
          )}
        </div>
        {isImplemented && (
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
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

      <p className="mt-1.5 text-[12px] text-text-muted">
        {strategyDescriptions[strategy.type] ?? strategy.type}
      </p>
      <p className="mt-0.5 font-mono-trading text-[12px] text-text-faint">{strategy.type}</p>

      {/* 파라미터 편집 (구현된 전략만) */}
      {isImplemented && (
        <>
          <button
            onClick={() => setShowParams(!showParams)}
            className="mt-3 flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary"
          >
            <Settings2 className="h-3 w-3" />
            {showParams ? '파라미터 닫기' : '파라미터 설정'}
          </button>

          {showParams && (
            <div className="mt-3 space-y-2.5 border-t border-border-subtle pt-3">
              {strategyParamConfig.map((param) => {
                const value = currentParams[param.key] ?? strategyDefaults[param.key]
                return (
                  <div key={param.key} className="flex items-center justify-between gap-4">
                    <label className="text-[12px] text-text-muted">
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
                        <span className="text-[12px] text-text-muted">{param.unit}</span>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!editingParams || saveMutation.isPending}
                  className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-background transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
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
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:bg-secondary"
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
