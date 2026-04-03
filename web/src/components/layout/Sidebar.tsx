import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Settings,
  FlaskConical,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/research', icon: FlaskConical, label: '연구 & 백테스트' },
  { to: '/portfolio', icon: Wallet, label: '포트폴리오' },
  { to: '/settings', icon: Settings, label: '설정' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-border-subtle bg-background">
      {/* 로고 + 골드 닷 */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
        <div>
          <h1 className="text-[13px] font-semibold tracking-tight">Coin Autopilot</h1>
          <p className="text-[11px] text-text-muted font-mono">noirstar.cloud</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-border-subtle" />

      {/* 네비게이션 — 플랫 구조, 인증 불필요 */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-100 ${
                isActive
                  ? 'bg-surface-hover text-text-primary border-l-2 border-text-secondary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`
            }
          >
            <item.icon className="h-[15px] w-[15px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
