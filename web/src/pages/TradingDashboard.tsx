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
    <div className="flex flex-col h-full">
      {/* System Strip */}
      <SystemStrip status={systemStatus} />

      {/* Hero Strip */}
      <HeroStrip summary={heroSummary} />

      {/* 본체: 데스크톱=가로 비대칭 / 모바일=세로 스택 */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 border-b border-border-subtle">
        <DeploymentMatrix slots={assetSlots} />
        <OperatorQueue
          items={queueItems}
          onApprove={approveItem}
          onReject={rejectItem}
          onDismiss={dismissItem}
        />
      </div>

      {/* 하단: 데스크톱=가로 분할 / 모바일=세로 스택 */}
      <div className="flex flex-col lg:flex-row border-t border-border-subtle lg:h-[180px] shrink-0">
        <DecisionLedger decisions={decisions} />
        <ResearchStatus summary={researchSummary} />
      </div>
    </div>
  )
}
