import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Orbit, ArrowRight, X, Shield, FlaskConical, PlayCircle } from 'lucide-react'

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
  onComplete: () => void
}

export function WelcomeModal({ open, onClose, onComplete }: WelcomeModalProps) {
  const navigate = useNavigate()
  if (!open) return null

  const steps = [
    {
      icon: Orbit,
      title: 'Coin Autopilot에 오신 것을 환영합니다',
      description: '3단계로 자동매매를 시작할 수 있습니다. 각 단계는 언제든 건너뛸 수 있습니다.',
      items: [
        { icon: Shield, label: '투자 성향 선택', desc: '안전/중립/공격 중 선택' },
        { icon: FlaskConical, label: '첫 백테스트 실행', desc: '전략의 과거 성과 확인' },
        { icon: PlayCircle, label: '가상매매 시작', desc: '실제 돈 없이 시뮬레이션' },
      ],
    },
  ]

  const handleStart = () => {
    onComplete()
    navigate('/strategy')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'var(--accent-bg)' }}>
            <Orbit className="h-5 w-5 text-primary" />
          </div>
          <button onClick={onClose} className="text-text-faint hover:text-text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-4 text-[16px] font-semibold">{steps[0]?.title}</h2>
        <p className="mt-1 text-[12px] text-text-muted">{steps[0]?.description}</p>

        <div className="mt-5 space-y-3">
          {steps[0]?.items?.map((item, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md bg-secondary p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-bg)]">
                <item.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-text-primary">
                  <span className="mr-1.5 font-mono-trading text-[11px] text-text-faint">{i + 1}</span>
                  {item.label}
                </p>
                <p className="text-[11px] text-text-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={handleStart}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            시작하기
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2.5 text-[12px] text-text-muted hover:bg-secondary"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}
