import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Brain,
  FlaskConical,
  PlayCircle,
  Wallet,
  Settings,
  Signal,
  Search,
  ChevronDown,
  ChevronRight,
  Lock,
  BarChart3,
  GitCompareArrows,
  Microscope,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface NavCategory {
  label: string
  icon: typeof BarChart3
  items: { to: string; icon: typeof BarChart3; label: string }[]
  requiresAuth?: boolean
}

const categories: NavCategory[] = [
  {
    label: '시장 분석',
    icon: BarChart3,
    items: [
      { to: '/signals', icon: Signal, label: '매매 시그널' },
      { to: '/detection', icon: Search, label: '코인 분석' },
    ],
  },
  {
    label: '자동매매',
    icon: Brain,
    requiresAuth: true,
    items: [
      { to: '/operator/dashboard', icon: LayoutDashboard, label: '대시보드' },
      { to: '/operator/strategy', icon: Brain, label: '전략 관리' },
      { to: '/operator/backtest', icon: FlaskConical, label: '백테스팅' },
      { to: '/operator/paper-trading', icon: PlayCircle, label: '가상매매' },
      { to: '/operator/research', icon: Microscope, label: '연구 큐' },
      { to: '/operator/comparison', icon: GitCompareArrows, label: '전략 비교' },
      { to: '/operator/portfolio', icon: Wallet, label: '포트폴리오' },
      { to: '/operator/settings', icon: Settings, label: '설정' },
    ],
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const location = useLocation()

  // 현재 경로가 속한 카테고리는 기본 열림
  const getDefaultOpen = () => {
    const open: Record<string, boolean> = {}
    for (const cat of categories) {
      const hasActive = cat.items.some((item) => location.pathname.startsWith(item.to))
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
          <p className="text-[12px] text-text-muted">BTC 기반 자동매매</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-border-subtle" />

      {/* 2단계 아코디언 네비게이션 */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        {categories.map((cat) => {
          const isOpen = openSections[cat.label] ?? false
          const isLocked = cat.requiresAuth && !user

          return (
            <div key={cat.label}>
              {/* 카테고리 헤더 */}
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

              {/* 하위 항목 */}
              {isOpen && (
                <div className="ml-2 space-y-0.5">
                  {cat.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                          isActive
                            ? 'bg-[var(--accent-bg)] text-text-primary'
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

      {/* 에이전트 상태 */}
      <div className="mx-3 mb-3">
        <div className="card-surface rounded-md px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-profit status-active" />
            <span className="text-[12px] font-medium text-text-primary">서버 연결됨</span>
          </div>
          <p className="mt-0.5 pl-3.5 text-[12px] text-text-muted">4H 주기 자동 실행</p>
        </div>
      </div>
    </aside>
  )
}
