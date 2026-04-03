import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu } from 'lucide-react'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바: 데스크톱 고정, 모바일 슬라이드 */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* 메인 콘텐츠 — 패딩 없이 전체 영역 사용 (각 페이지가 자체 레이아웃 담당) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 모바일 헤더 — 햄버거 메뉴만 */}
        <div className="flex items-center h-10 px-4 border-b border-border-subtle lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 text-text-muted hover:text-text-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-[13px] font-semibold">Coin Autopilot</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
