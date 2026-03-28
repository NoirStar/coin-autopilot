import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  FlaskConical,
  PlayCircle,
  Wallet,
  Settings,
  Signal,
  Orbit,
  Radar,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/signals', icon: Signal, label: '시그널' },
  { to: '/detection', icon: Radar, label: '알트 탐지' },
  { to: '/strategy', icon: Brain, label: '전략 관리' },
  { to: '/backtest', icon: FlaskConical, label: '백테스팅' },
  { to: '/paper-trading', icon: PlayCircle, label: '가상매매' },
  { to: '/portfolio', icon: Wallet, label: '포트폴리오' },
  { to: '/settings', icon: Settings, label: '설정' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-border-subtle bg-background">
      {/* 로고 */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-bg)' }}>
          <Orbit className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-[13px] font-semibold tracking-tight">Coin Autopilot</h1>
          <p className="text-[11px] text-text-muted">BTC 기반 자동매매</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-border-subtle" />

      {/* 네비게이션 */}
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                isActive
                  ? 'text-primary bg-[var(--accent-bg)]'
                  : 'text-text-muted hover:bg-surface-hover hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-[15px] w-[15px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* 에이전트 상태 */}
      <div className="mx-3 mb-3">
        <div className="card-surface rounded-md px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-profit status-active" />
            <span className="text-[11px] font-medium text-text-primary">서버 연결됨</span>
          </div>
          <p className="mt-0.5 pl-3.5 text-[11px] text-text-muted">4H 주기 자동 실행</p>
        </div>
      </div>
    </aside>
  )
}
