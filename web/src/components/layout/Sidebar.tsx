import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Settings,
  ChevronDown,
  ChevronRight,
  Lock,
  FlaskConical,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface NavCategory {
  label: string
  items: { to: string; icon: typeof LayoutDashboard; label: string }[]
  requiresAuth?: boolean
}

const categories: NavCategory[] = [
  {
    label: '대시보드',
    items: [
      { to: '/', icon: LayoutDashboard, label: '트레이딩 대시보드' },
    ],
  },
  {
    label: '운용',
    requiresAuth: true,
    items: [
      { to: '/operator/research', icon: FlaskConical, label: '연구 & 백테스트' },
      { to: '/operator/portfolio', icon: Wallet, label: '포트폴리오' },
    ],
  },
  {
    label: '시스템',
    requiresAuth: true,
    items: [
      { to: '/operator/settings', icon: Settings, label: '설정' },
    ],
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const location = useLocation()

  const getDefaultOpen = () => {
    const open: Record<string, boolean> = {}
    for (const cat of categories) {
      const hasActive = cat.items.some(
        (item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
      )
      open[cat.label] = hasActive || !cat.requiresAuth
    }
    return open
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(getDefaultOpen)

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border-subtle bg-background">
      {/* 로고 + 골드 닷 브랜드마크 */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <div>
          <h1 className="text-[13px] font-semibold tracking-tight">Coin Autopilot</h1>
          <p className="text-[11px] text-text-muted font-mono">noirstar.cloud</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-border-subtle" />

      {/* 네비게이션 */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        {categories.map((cat) => {
          const isOpen = openSections[cat.label] ?? false
          const isLocked = cat.requiresAuth && !user

          return (
            <div key={cat.label}>
              <button
                type="button"
                onClick={() => toggleSection(cat.label)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-semibold text-text-muted transition-colors hover:text-text-secondary"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {cat.label}
                {isLocked && <Lock className="ml-auto h-3 w-3 text-text-faint" />}
              </button>

              {isOpen && (
                <div className="ml-2 space-y-0.5">
                  {cat.items.map((item) => (
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
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
