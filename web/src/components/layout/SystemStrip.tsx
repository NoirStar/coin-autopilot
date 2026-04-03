import { useEffect, useState } from 'react'
import type { SystemStatus, ConnectionStatus } from '@/types/orchestration'

const StatusDot = ({ status }: { status: ConnectionStatus }) => (
  <span
    className={`inline-block w-1.5 h-1.5 rounded-full ${
      status === 'connected' ? 'bg-profit' : status === 'error' ? 'bg-loss' : 'bg-text-faint'
    }`}
  />
)

const formatTime = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  const m = date.getMonth() + 1
  const d = date.getDate()
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const day = days[date.getDay()]
  return `${pad(m)}월 ${pad(d)}일 ${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const formatElapsed = (isoString: string): string => {
  const elapsed = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (elapsed < 60) return `${elapsed}s`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`
  return `${Math.floor(elapsed / 3600)}h`
}

interface SystemStripProps {
  status: SystemStatus
}

export const SystemStrip = ({ status }: SystemStripProps) => {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-4 px-4 h-7 bg-surface border-b border-border-subtle font-mono text-[11px] text-text-muted">
      <span className="flex items-center gap-1">
        SYS <StatusDot status={status.server} />
      </span>
      <span className="flex items-center gap-1">
        DB <StatusDot status={status.database} />
      </span>
      <span>
        수집 <span className="text-text-secondary">{formatElapsed(status.lastCollectedAt)}</span>
      </span>
      <span className="border-l border-border pl-3 flex items-center gap-3">
        {Object.entries(status.exchanges).map(([name, st]) => (
          <span key={name} className="flex items-center gap-1">
            {name} <StatusDot status={st} />
          </span>
        ))}
      </span>
      <span className="ml-auto text-text-secondary">{formatTime(now)}</span>
    </div>
  )
}
