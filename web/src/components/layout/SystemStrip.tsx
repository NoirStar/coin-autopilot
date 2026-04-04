import { useEffect, useState } from 'react'
import type { SystemStatus, ConnectionStatus } from '@/types/orchestration'

const StatusDot = ({ status }: { status: ConnectionStatus }) => (
  <span
    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
      status === 'connected' ? 'bg-profit' : status === 'error' ? 'bg-loss' : 'bg-text-faint'
    }`}
  />
)

const formatTime = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
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
    <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 h-7 bg-surface border-b border-border-subtle font-mono text-[11px] text-text-muted overflow-x-auto whitespace-nowrap">
      <span className="flex items-center gap-1">
        SYS <StatusDot status={status.server} />
      </span>
      <span className="flex items-center gap-1">
        DB <StatusDot status={status.database} />
      </span>
      <span className="hidden sm:inline">
        수집 <span className="text-text-secondary">{formatElapsed(status.lastCollectedAt)}</span>
      </span>
      <span className="hidden md:inline border-l border-border pl-3 flex items-center gap-3">
        {Object.entries(status.exchanges).map(([name, st]) => (
          <span key={name} className="flex items-center gap-1">
            {name} <StatusDot status={st} />
          </span>
        ))}
      </span>
      <span className="ml-auto text-text-secondary shrink-0">{formatTime(now)}</span>
    </div>
  )
}
