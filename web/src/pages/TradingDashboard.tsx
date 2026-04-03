import { SystemStrip } from '@/components/layout/SystemStrip'
import { HeroStrip } from '@/components/layout/HeroStrip'
import { DeploymentMatrix } from '@/components/dashboard/DeploymentMatrix'
import { OperatorQueue } from '@/components/dashboard/OperatorQueue'
import { DecisionLedger } from '@/components/dashboard/DecisionLedger'
import { ResearchStatus } from '@/components/dashboard/ResearchStatus'
import { useOrchestrationStore } from '@/stores/orchestration-store'
import { useApprovalStore } from '@/stores/approval-store'
import { useResearchStore } from '@/stores/research-store'

export const TradingDashboard = () => {
  const { systemStatus, heroSummary, assetSlots, decisions } = useOrchestrationStore()
  const { queueItems, approveItem, rejectItem, dismissItem } = useApprovalStore()
  const { summary: researchSummary } = useResearchStore()

  return (
    <div className="flex flex-col min-h-full lg:h-full">
      {/* System Strip — 얇은 상태 바 */}
      <SystemStrip status={systemStatus} />

      {/* Hero Strip — 여기가 시선의 출발점. surface 배경으로 구분 */}
      <HeroStrip summary={heroSummary} />

      {/* 본체: Deployment Matrix + Operator Queue */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <DeploymentMatrix slots={assetSlots} />
        <OperatorQueue
          items={queueItems}
          onApprove={approveItem}
          onReject={rejectItem}
          onDismiss={dismissItem}
        />
      </div>

      {/* 하단: Decision Ledger + Research — border-border로 강한 구분 */}
      <div className="flex flex-col lg:flex-row border-t border-border lg:h-[200px] shrink-0">
        <DecisionLedger decisions={decisions} />
        <ResearchStatus summary={researchSummary} />
      </div>
    </div>
  )
}
