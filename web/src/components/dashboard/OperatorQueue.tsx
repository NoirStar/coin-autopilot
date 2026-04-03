import type { QueueItem } from '@/types/orchestration'
import { AlertTriangle } from 'lucide-react'

interface OperatorQueueProps {
  items: QueueItem[]
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDismiss?: (id: string) => void
}

export const OperatorQueue = ({ items, onApprove, onReject, onDismiss }: OperatorQueueProps) => {
  return (
    <div className="w-full lg:w-[280px] shrink-0 border-t lg:border-t-0 lg:border-l border-border-subtle flex flex-col">
      {/* 헤더 */}
      <div className="px-4 py-2 font-mono text-[10px] font-semibold text-text-faint tracking-widest uppercase border-b border-border-subtle">
        PENDING ({items.length})
      </div>

      {/* 아이템 */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => {
          if (item.kind === 'approval') {
            return (
              <div key={item.data.id} className="px-4 py-2.5 border-b border-border-subtle">
                <div className="text-[12px] font-semibold text-text-secondary mb-1">
                  {item.data.title}
                </div>
                <div className="text-[11px] text-text-muted mb-2">
                  {item.data.description}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onApprove?.(item.data.id)}
                    className="px-2.5 py-0.5 text-[11px] font-medium rounded bg-profit/10 text-profit hover:bg-profit/20 transition-colors"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => onReject?.(item.data.id)}
                    className="px-2.5 py-0.5 text-[11px] font-medium rounded bg-loss/10 text-loss hover:bg-loss/20 transition-colors"
                  >
                    거부
                  </button>
                </div>
              </div>
            )
          }

          // 리스크 경고
          return (
            <div key={item.data.id} className="px-4 py-2.5 border-b border-border-subtle">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-warning mb-1">
                <AlertTriangle className="w-3 h-3" />
                {item.data.title}
              </div>
              <div className="text-[11px] text-text-muted mb-2">
                {item.data.description}
              </div>
              {onDismiss && (
                <button
                  onClick={() => onDismiss(item.data.id)}
                  className="px-2.5 py-0.5 text-[11px] font-medium rounded border border-border text-text-muted hover:text-text-secondary transition-colors"
                >
                  확인
                </button>
              )}
            </div>
          )
        })}

        {items.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[11px] text-text-faint">
            대기 항목 없음
          </div>
        )}
      </div>
    </div>
  )
}
