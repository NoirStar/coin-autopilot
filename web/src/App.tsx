import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { TradingDashboard } from '@/pages/TradingDashboard'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ResearchPage } from '@/pages/ResearchPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 메인: 트레이딩 대시보드 (PRD 07 기준) */}
        <Route path="/" element={<TradingDashboard />} />

        {/* 운용자 페이지 */}
        <Route path="/operator" element={<AuthGuard><TradingDashboard /></AuthGuard>} />
        <Route path="/operator/dashboard" element={<AuthGuard><TradingDashboard /></AuthGuard>} />
        <Route path="/operator/research" element={<AuthGuard><ResearchPage /></AuthGuard>} />
        <Route path="/operator/portfolio" element={<AuthGuard><PortfolioPage /></AuthGuard>} />
        <Route path="/operator/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
      </Route>

      {/* 이전 경로 리다이렉트 */}
      <Route path="/signals" element={<Navigate to="/" replace />} />
      <Route path="/detection" element={<Navigate to="/" replace />} />
      <Route path="/strategy" element={<Navigate to="/operator/research" replace />} />
      <Route path="/backtest" element={<Navigate to="/operator/research" replace />} />
      <Route path="/paper-trading" element={<Navigate to="/" replace />} />
      <Route path="/portfolio" element={<Navigate to="/operator/portfolio" replace />} />
      <Route path="/settings" element={<Navigate to="/operator/settings" replace />} />
      <Route path="/operator/v2" element={<Navigate to="/" replace />} />
      <Route path="/operator/strategy" element={<Navigate to="/operator/research" replace />} />
      <Route path="/operator/backtest" element={<Navigate to="/operator/research" replace />} />
      <Route path="/operator/paper-trading" element={<Navigate to="/" replace />} />
      <Route path="/operator/comparison" element={<Navigate to="/operator/research" replace />} />
    </Routes>
  )
}
