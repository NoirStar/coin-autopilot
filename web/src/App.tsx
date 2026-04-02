import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { DetectionPage } from '@/pages/DetectionPage'
import { ResearchPage } from '@/pages/ResearchPage'
import { ComparisonPage } from '@/pages/ComparisonPage'
import { DashboardPage } from '@/pages/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 메인: 운영실 홈 (PRD 07 기준) */}
        <Route path="/" element={<DashboardPage />} />

        {/* 공개 페이지 */}
        <Route path="/detection" element={<DetectionPage />} />

        {/* 운용자 페이지 */}
        <Route path="/operator" element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="/operator/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
        <Route path="/operator/research" element={<AuthGuard><ResearchPage /></AuthGuard>} />
        <Route path="/operator/comparison" element={<AuthGuard><ComparisonPage /></AuthGuard>} />
        <Route path="/operator/portfolio" element={<AuthGuard><PortfolioPage /></AuthGuard>} />
        <Route path="/operator/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
      </Route>

      {/* 이전 경로 리다이렉트 */}
      <Route path="/signals" element={<Navigate to="/" replace />} />
      <Route path="/strategy" element={<Navigate to="/operator/research" replace />} />
      <Route path="/backtest" element={<Navigate to="/operator/research" replace />} />
      <Route path="/paper-trading" element={<Navigate to="/operator/dashboard" replace />} />
      <Route path="/portfolio" element={<Navigate to="/operator/portfolio" replace />} />
      <Route path="/settings" element={<Navigate to="/operator/settings" replace />} />
      <Route path="/operator/v2" element={<Navigate to="/operator/dashboard" replace />} />
      <Route path="/operator/strategy" element={<Navigate to="/operator/research" replace />} />
      <Route path="/operator/backtest" element={<Navigate to="/operator/research" replace />} />
      <Route path="/operator/paper-trading" element={<Navigate to="/operator/dashboard" replace />} />
    </Routes>
  )
}
