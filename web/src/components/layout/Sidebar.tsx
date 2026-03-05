import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  FlaskConical,
  PlayCircle,
  Wallet,
  Settings,
  Bot,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/strategy', icon: Brain, label: '전략 관리' },
  { to: '/backtest', icon: FlaskConical, label: '백테스팅' },
  { to: '/paper-trading', icon: PlayCircle, label: '가상매매' },
  { to: '/portfolio', icon: Wallet, label: '포트폴리오' },
  { to: '/settings', icon: Settings, label: '설정' },
]

export function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight">Coin Autopilot</h1>
          <p className="text-xs text-muted-foreground">자동매매 플랫폼</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Agent Status */}
      <div className="border-t border-border p-4">
        <div className="glass-panel rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-profit status-active" />
            <span className="text-xs font-medium">에이전트 연결됨</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Mode: Paper Trading</p>
        </div>
      </div>
    </aside>
  )
}
