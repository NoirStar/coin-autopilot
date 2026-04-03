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
import { mockPositions, mockMarketCondition } from '@/mocks/dashboard-data'

export const TradingDashboard = () => {
  const { systemStatus, heroSummary, assetSlots, decisions } = useOrchestrationStore()
  const { queueItems, approveItem, rejectItem, dismissItem } = useApprovalStore()
  const { summary: researchSummary } = useResearchStore()

  return (
    <main className="flex flex-col min-h-full lg:h-full">
      {/* System Strip */}
      <SystemStrip status={systemStatus} />

      {/* Hero Strip — 행동 필요 → 자산 → 손익 → 시장적합도 */}
      <HeroStrip summary={heroSummary} />

      {/* 본체: 전략 배치 + 확인 필요 */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <DeploymentMatrix slots={assetSlots} />
        <OperatorQueue
          items={queueItems}
          onApprove={approveItem}
          onReject={rejectItem}
          onDismiss={dismissItem}
        />
      </div>

      {/* 중단: 포지션 + 시장 상황 */}
      <div className="flex flex-col lg:flex-row border-t border-border lg:h-[180px] shrink-0">
        <PositionPanel positions={mockPositions} />
        <MarketPanel market={mockMarketCondition} />
      </div>

      {/* 하단: 판단 기록 + 연구 현황 */}
      <div className="flex flex-col lg:flex-row border-t border-border lg:h-[180px] shrink-0">
        <DecisionLedger decisions={decisions} />
        <ResearchStatus summary={researchSummary} />
      </div>
    </main>
  )
}
