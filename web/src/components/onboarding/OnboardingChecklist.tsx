import { useNavigate } from 'react-router-dom'
import { Check, Shield, FlaskConical, PlayCircle, X } from 'lucide-react'

interface ChecklistItem {
  label: string
  completed: boolean
  route: string
  icon: typeof Check
}

interface OnboardingChecklistProps {
  profileSelected: boolean
  backtestRun: boolean
  paperStarted: boolean
  onDismiss: () => void
}

export function OnboardingChecklist({
  profileSelected,
  backtestRun,
  paperStarted,
  onDismiss,
}: OnboardingChecklistProps) {
  const navigate = useNavigate()

  const items: ChecklistItem[] = [
    { label: '투자 성향 선택', completed: profileSelected, route: '/strategy', icon: Shield },
    { label: '첫 백테스트 실행', completed: backtestRun, route: '/backtest', icon: FlaskConical },
    { label: '가상매매 시작', completed: paperStarted, route: '/paper-trading', icon: PlayCircle },
  ]

  const completedCount = items.filter((i) => i.completed).length
  const allDone = completedCount === items.length

  if (allDone) return null

  return (
    <div className="card-surface rounded-md p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-text-primary">시작 가이드</h3>
        <div className="flex items-center gap-2">
          <span className="font-mono-trading text-[12px] text-text-muted">
            {completedCount}/{items.length}
          </span>
          <button onClick={onDismiss} className="text-text-faint hover:text-text-muted" title="닫기">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 진행 바 */}
      <div className="mt-2.5 h-1 rounded-full bg-[var(--surface-hover)]">
        <div
          className="h-full rounded-full bg-profit transition-all duration-300"
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      <div className="mt-3 space-y-1.5">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => !item.completed && navigate(item.route)}
            disabled={item.completed}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] transition-colors ${
              item.completed
                ? 'text-text-faint'
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {item.completed ? (
              <Check className="h-3.5 w-3.5 text-profit" />
            ) : (
              <item.icon className="h-3.5 w-3.5 text-text-muted" />
            )}
            <span className={item.completed ? 'line-through' : ''}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
