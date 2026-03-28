import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { DashboardPage } from '@/pages/DashboardPage'
import { StrategyPage } from '@/pages/StrategyPage'
import { BacktestPage } from '@/pages/BacktestPage'
import { PaperTradingPage } from '@/pages/PaperTradingPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SignalsPage } from '@/pages/SignalsPage'
import { DetectionPage } from '@/pages/DetectionPage'

export default function App() {
  return (
    <Routes>
      {/* 모든 페이지가 AppLayout(사이드바 포함) 안에서 렌더링 */}
      <Route element={<AppLayout />}>
        {/* 공개 페이지 — 인증 불필요 */}
        <Route path="/" element={<SignalsPage />} />
        <Route path="/signals" element={<SignalsPage />} />
        <Route path="/detection" element={<DetectionPage />} />

        {/* 운용자 페이지 — 인증 필요 */}
        <Route path="/operator" element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="/operator/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="/operator/strategy" element={<AuthGuard><StrategyPage /></AuthGuard>} />
        <Route path="/operator/backtest" element={<AuthGuard><BacktestPage /></AuthGuard>} />
        <Route path="/operator/paper-trading" element={<AuthGuard><PaperTradingPage /></AuthGuard>} />
        <Route path="/operator/portfolio" element={<AuthGuard><PortfolioPage /></AuthGuard>} />
        <Route path="/operator/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
      </Route>

      {/* 이전 경로 리다이렉트 */}
      <Route path="/strategy" element={<Navigate to="/operator/strategy" replace />} />
      <Route path="/backtest" element={<Navigate to="/operator/backtest" replace />} />
      <Route path="/paper-trading" element={<Navigate to="/operator/paper-trading" replace />} />
      <Route path="/portfolio" element={<Navigate to="/operator/portfolio" replace />} />
      <Route path="/settings" element={<Navigate to="/operator/settings" replace />} />
    </Routes>
  )
}
