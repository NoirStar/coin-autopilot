import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PublicLayout } from '@/components/layout/PublicLayout'
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
      {/* 공개 모드 — 인증 불필요 */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<SignalsPage />} />
        <Route path="/signals" element={<SignalsPage />} />
        <Route path="/detection" element={<DetectionPage />} />
      </Route>

      {/* 운용자 모드 — 인증 필요 */}
      <Route path="/operator" element={<AppLayout />}>
        <Route index element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="strategy" element={<AuthGuard><StrategyPage /></AuthGuard>} />
        <Route path="backtest" element={<AuthGuard><BacktestPage /></AuthGuard>} />
        <Route path="paper-trading" element={<AuthGuard><PaperTradingPage /></AuthGuard>} />
        <Route path="portfolio" element={<AuthGuard><PortfolioPage /></AuthGuard>} />
        <Route path="settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
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
