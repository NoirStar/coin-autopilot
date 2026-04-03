import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { TradingDashboard } from '@/pages/TradingDashboard'
import { StrategyDetail } from '@/pages/StrategyDetail'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ResearchPage } from '@/pages/ResearchPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 메인 */}
        <Route path="/" element={<TradingDashboard />} />
        <Route path="/strategy/:slotId" element={<StrategyDetail />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* 이전 경로 리다이렉트 */}
      <Route path="/signals" element={<Navigate to="/" replace />} />
      <Route path="/detection" element={<Navigate to="/" replace />} />
      <Route path="/operator" element={<Navigate to="/" replace />} />
      <Route path="/operator/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/operator/research" element={<Navigate to="/research" replace />} />
      <Route path="/operator/comparison" element={<Navigate to="/research" replace />} />
      <Route path="/operator/portfolio" element={<Navigate to="/portfolio" replace />} />
      <Route path="/operator/settings" element={<Navigate to="/settings" replace />} />
      <Route path="/backtest" element={<Navigate to="/research" replace />} />
      <Route path="/paper-trading" element={<Navigate to="/" replace />} />
      <Route path="/operator/v2" element={<Navigate to="/" replace />} />
      <Route path="/operator/strategy" element={<Navigate to="/research" replace />} />
      <Route path="/operator/backtest" element={<Navigate to="/research" replace />} />
      <Route path="/operator/paper-trading" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
