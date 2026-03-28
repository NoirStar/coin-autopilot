import { NavLink, Outlet } from 'react-router-dom'
import { Signal, Radar } from 'lucide-react'

/** 공개 모드 레이아웃 — 심플 헤더 + 컨텐츠 + 푸터 */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* 공개 헤더 */}
      <header className="flex h-12 items-center justify-between border-b border-border-subtle px-4 md:px-6">
        <div className="flex items-center gap-3">
          {/* 브랜드마크 */}
          <NavLink to="/" className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-[13px] font-semibold tracking-tight text-text-primary">
              Coin Autopilot
            </span>
          </NavLink>

          <div className="h-3 w-px bg-border-subtle" />

          {/* 공개 네비게이션 */}
          <nav className="flex items-center gap-1">
            <NavLink
              to="/signals"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
                  isActive
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                }`
              }
            >
              <Signal className="h-3 w-3" />
              시그널
            </NavLink>
            <NavLink
              to="/detection"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
                  isActive
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                }`
              }
            >
              <Radar className="h-3 w-3" />
              알트 탐지
            </NavLink>
          </nav>
        </div>
      </header>

      {/* 컨텐츠 */}
      <main className="mx-auto w-full max-w-[896px] flex-1 px-4 py-5 md:px-6">
        <Outlet />
      </main>

      {/* 심플 푸터 */}
      <footer className="flex h-8 items-center justify-center border-t border-border-subtle text-[12px] text-text-muted">
        Coin Autopilot — BTC 기반 자동매매
      </footer>
    </div>
  )
}
