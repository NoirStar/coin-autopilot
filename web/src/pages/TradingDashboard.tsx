import { useEffect, useCallback } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { SystemStrip } from '@/components/layout/SystemStrip'
import { HeroStrip } from '@/components/layout/HeroStrip'
import { DeploymentMatrix } from '@/components/dashboard/DeploymentMatrix'
import { OperatorQueue } from '@/components/dashboard/OperatorQueue'
import { DecisionLedger } from '@/components/dashboard/DecisionLedger'
import { ResearchStatus } from '@/components/dashboard/ResearchStatus'
import { PositionPanel } from '@/components/dashboard/PositionPanel'
import { MarketPanel } from '@/components/dashboard/MarketPanel'
import { useOrchestrationStore } from '@/stores/orchestration-store'
import { useApprovalStore } from '@/stores/approval-store'
import { useResearchStore } from '@/stores/research-store'

const POLL_INTERVAL_MS = 30_000

export const TradingDashboard = () => {
  const { systemStatus, heroSummary, assetSlots, decisions, positions, market, isLoading, error, fetchOperatorHome } = useOrchestrationStore()
  const { queueItems, approveItem, rejectItem, dismissItem, updateFromOperatorHome } = useApprovalStore()
  const { summary: researchSummary, updateFromOperatorHome: updateResearch } = useResearchStore()

  const fetchAll = useCallback(async () => {
    const data = await fetchOperatorHome()
    if (data) {
      updateFromOperatorHome(data)
      updateResearch(data)
    }
  }, [fetchOperatorHome, updateFromOperatorHome, updateResearch])

  useEffect(() => {
    fetchAll()
    const timer = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchAll])

  // 초기 로딩
  if (isLoading && !error) {
    return (
      <main className="flex flex-col items-center justify-center h-full gap-3">
        <RefreshCw className="w-6 h-6 text-text-muted animate-spin" />
        <span className="text-[13px] text-text-muted">데이터를 불러오는 중...</span>
      </main>
    )
  }

  // 에러 (데이터 없음)
  if (error && assetSlots.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center h-full gap-3">
        <WifiOff className="w-8 h-8 text-text-faint" />
        <span className="text-[15px] font-semibold text-text-secondary">서버 연결 실패</span>
        <span className="text-[12px] text-text-muted max-w-sm text-center">{error}</span>
        <button
          onClick={fetchAll}
          className="mt-2 px-4 py-1.5 text-[12px] font-medium text-text-primary bg-surface-hover border border-border rounded-md hover:bg-border-subtle transition-colors"
        >
          다시 시도
        </button>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-full lg:h-full">
      {/* 에러 배너 (이전 데이터는 보여주되 경고 표시) */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-loss/10 text-loss text-[12px] border-b border-loss/20">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>서버 연결 끊김 - 마지막 수신 데이터를 표시 중</span>
          <button onClick={fetchAll} className="ml-auto underline hover:no-underline">재시도</button>
        </div>
      )}

      <SystemStrip status={systemStatus} />
      <HeroStrip summary={heroSummary} />

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:max-h-[280px]">
        <DeploymentMatrix slots={assetSlots} />
        <OperatorQueue
          items={queueItems}
          onApprove={approveItem}
          onReject={rejectItem}
          onDismiss={dismissItem}
        />
      </div>

      <div className="flex flex-col lg:flex-row border-t border-border lg:h-[180px] shrink-0">
        <PositionPanel positions={positions} />
        <MarketPanel market={market} />
      </div>

      <div className="flex flex-col lg:flex-row border-t border-border lg:h-[180px] shrink-0">
        <DecisionLedger decisions={decisions} />
        <ResearchStatus summary={researchSummary} />
      </div>
    </main>
  )
}
