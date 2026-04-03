import { SystemStrip } from '@/components/layout/SystemStrip'
import { HeroStrip } from '@/components/layout/HeroStrip'
import { DeploymentMatrix } from '@/components/dashboard/DeploymentMatrix'
import { OperatorQueue } from '@/components/dashboard/OperatorQueue'
import { DecisionLedger } from '@/components/dashboard/DecisionLedger'
import { ResearchStatus } from '@/components/dashboard/ResearchStatus'
import {
  mockSystemStatus,
  mockHeroSummary,
  mockAssetSlots,
  mockQueueItems,
  mockDecisions,
  mockResearchSummary,
} from '@/mocks/dashboard-data'

export const TradingDashboard = () => {
  const handleApprove = (id: string) => {
    console.log('승인:', id)
  }

  const handleReject = (id: string) => {
    console.log('거부:', id)
  }

  const handleDismiss = (id: string) => {
    console.log('확인:', id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* System Strip */}
      <SystemStrip status={mockSystemStatus} />

      {/* Hero Strip */}
      <HeroStrip summary={mockHeroSummary} />

      {/* 본체: Deployment Matrix (65%) + Operator Queue (35%) */}
      <div className="flex flex-1 min-h-0 border-b border-border-subtle">
        <DeploymentMatrix slots={mockAssetSlots} />
        <OperatorQueue
          items={mockQueueItems}
          onApprove={handleApprove}
          onReject={handleReject}
          onDismiss={handleDismiss}
        />
      </div>

      {/* 하단: Decision Ledger (50%) + Research Status (50%) */}
      <div className="flex border-t border-border-subtle h-[180px] shrink-0">
        <DecisionLedger decisions={mockDecisions} />
        <ResearchStatus summary={mockResearchSummary} />
      </div>
    </div>
  )
}
