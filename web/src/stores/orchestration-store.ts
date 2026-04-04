import { create } from 'zustand'
import type {
  SystemStatus,
  HeroSummary,
  AssetSlot,
  Decision,
  ActivePosition,
  MarketCondition,
  RiskLevel,
  ConnectionStatus,
} from '@/types/orchestration'
import { api } from '@/services/api'
import type { OperatorHomeResponse } from '@/services/api'

interface OrchestrationState {
  // 상태
  systemStatus: SystemStatus
  heroSummary: HeroSummary
  assetSlots: AssetSlot[]
  decisions: Decision[]
  positions: ActivePosition[]
  market: MarketCondition
  isLoading: boolean
  error: string | null
  lastFetchedAt: string | null

  // 액션
  setSystemStatus: (status: SystemStatus) => void
  setHeroSummary: (summary: HeroSummary) => void
  setAssetSlots: (slots: AssetSlot[]) => void
  addDecision: (decision: Decision) => void
  setLoading: (loading: boolean) => void
  fetchOperatorHome: () => Promise<OperatorHomeResponse | null>
}

// 서버 응답 → 프론트 타입 변환 헬퍼

function mapSystemStatus(data: OperatorHomeResponse): SystemStatus {
  return {
    server: data.system.server as ConnectionStatus,
    database: data.system.database as ConnectionStatus,
    exchanges: {}, // TODO: 거래소 연결 상태 서버에서 추가 필요
    lastCollectedAt: data.system.lastCollectedAt ?? '',
    currentTime: new Date().toISOString(),
  }
}

function mapHeroSummary(data: OperatorHomeResponse): HeroSummary {
  const live = data.hero.live
  const paper = data.hero.paper
  return {
    edgeScore: data.hero.edgeScore ?? 0,
    live: {
      totalEquity: live.totalEquity,
      todayPnl: live.todayPnl.total,
      todayPnlPct: live.totalEquity > 0 ? (live.todayPnl.total / live.totalEquity) * 100 : 0,
      count: live.count,
      active: live.active,
    },
    paper: {
      totalEquity: paper.totalEquity,
      todayPnl: paper.todayPnl.total,
      todayPnlPct: paper.totalEquity > 0 ? (paper.todayPnl.total / paper.totalEquity) * 100 : 0,
      count: paper.count,
    },
    pendingApprovals: data.hero.pendingApprovals,
    riskLevel: data.hero.riskLevel as RiskLevel,
  }
}

function mapAssetSlots(data: OperatorHomeResponse): AssetSlot[] {
  return data.slots.map((slot) => ({
    id: slot.slotId,
    asset: slot.assetKey,
    venue: 'okx_swap' as const, // TODO: 서버에서 venue 정보 추가
    strategy: {
      id: slot.strategyId ?? '',
      name: slot.strategyId ?? '',
      shortName: slot.strategyId?.split('-').pop()?.toUpperCase() ?? '',
      description: '',
      type: '',
      params: {},
      assetClass: 'crypto' as const,
      isActive: slot.status === 'active',
    },
    operationMode: 'auto' as const,
    tradeMode: slot.slotType === 'primary' ? 'live' as const : 'paper' as const,
    state: slot.status as AssetSlot['state'],
    edgeScore: null, // TODO: EDGE 스코어
    rationale: '',
    rationaleDetail: `배분 ${slot.allocationPct}% / 레짐 ${slot.regime ?? '-'}`,
    position: null, // TODO: 포지션 매핑
    lastDecisionAt: '',
    aiInvolved: false,
    pendingApproval: slot.status === 'pending_approval',
  }))
}

function mapDecisions(data: OperatorHomeResponse): Decision[] {
  return data.decisions.map((d) => ({
    id: d.id,
    timestamp: d.createdAt,
    asset: d.slotId,
    strategy: d.toStrategy ?? d.fromStrategy ?? '',
    action: mapDecisionType(d.type),
    confidence: 0,
    factors: { regime: d.regime, status: d.status },
    rationale: d.reason ?? '',
  }))
}

function mapDecisionType(type: string): Decision['action'] {
  switch (type) {
    case 'assign': return 'ENTRY'
    case 'switch': return 'SWAP'
    case 'retire': return 'EXIT'
    case 'rebalance': return 'HOLD'
    default: return 'HOLD'
  }
}

function mapPositions(data: OperatorHomeResponse): ActivePosition[] {
  const mapOne = (p: Record<string, unknown>, source: 'live' | 'paper'): ActivePosition => ({
    id: String(p.id ?? ''),
    asset: String(p.asset_key ?? ''),
    venue: 'okx_swap',
    strategy: '',
    tradeMode: source,
    side: (p.side as ActivePosition['side']) ?? 'flat',
    entryPrice: Number(p.entry_price ?? 0),
    currentPrice: Number(p.peak_price ?? p.entry_price ?? 0),
    stopLoss: Number(p.stop_price ?? 0),
    takeProfit: 0,
    qty: Number(p.current_qty ?? 0),
    unrealizedPnl: Number(p.unrealized_pnl ?? 0),
    unrealizedPnlPct: 0,
    holdingSince: String(p.entry_time ?? ''),
  })
  return [
    ...(data.positions.live ?? []).map((p) => mapOne(p, 'live')),
    ...(data.positions.paper ?? []).map((p) => mapOne(p, 'paper')),
  ]
}

function mapMarket(data: OperatorHomeResponse): MarketCondition {
  return {
    crypto: {
      volatility: data.market.volatility ?? 'low',
      fundingRate: data.market.fundingRate ?? 0,
      openInterest: data.market.openInterest ?? 0,
      longShortRatio: data.market.longShortRatio ?? 0,
      kimchiPremium: data.market.kimchiPremium ?? 0,
      updatedAt: data.market.updatedAt ?? '',
    },
    krStock: null,
  }
}

const emptyMarket: MarketCondition = {
  crypto: { volatility: 'low', fundingRate: 0, openInterest: 0, longShortRatio: 0, kimchiPremium: 0, updatedAt: '' },
  krStock: null,
}

// 초기 빈 상태 (API 응답 전)
const emptySystemStatus: SystemStatus = {
  server: 'disconnected',
  database: 'disconnected',
  exchanges: {},
  lastCollectedAt: '',
  currentTime: new Date().toISOString(),
}

const emptyHeroSummary: HeroSummary = {
  edgeScore: 0,
  live: { totalEquity: 0, todayPnl: 0, todayPnlPct: 0, count: 0, active: false },
  paper: { totalEquity: 0, todayPnl: 0, todayPnlPct: 0, count: 0 },
  pendingApprovals: 0,
  riskLevel: 'normal',
}

export const useOrchestrationStore = create<OrchestrationState>((set) => ({
  systemStatus: emptySystemStatus,
  heroSummary: emptyHeroSummary,
  assetSlots: [],
  decisions: [],
  positions: [],
  market: emptyMarket,
  isLoading: true,
  error: null,
  lastFetchedAt: null,

  setSystemStatus: (status) => set({ systemStatus: status }),
  setHeroSummary: (summary) => set({ heroSummary: summary }),
  setAssetSlots: (slots) => set({ assetSlots: slots }),
  addDecision: (decision) =>
    set((state) => ({
      decisions: [decision, ...state.decisions].slice(0, 50),
    })),
  setLoading: (loading) => set({ isLoading: loading }),

  fetchOperatorHome: async () => {
    try {
      const data = await api.getOperatorHome()
      set({
        systemStatus: mapSystemStatus(data),
        heroSummary: mapHeroSummary(data),
        assetSlots: mapAssetSlots(data),
        decisions: mapDecisions(data),
        positions: mapPositions(data),
        market: mapMarket(data),
        isLoading: false,
        error: null,
        lastFetchedAt: new Date().toISOString(),
      })
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : '데이터 로드 실패'
      set({ isLoading: false, error: msg })
      console.error('[orchestration-store] fetch 오류:', err)
      return null
    }
  },
}))
