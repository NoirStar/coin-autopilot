import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { StrategyPage } from '@/pages/StrategyPage'
import { BacktestPage } from '@/pages/BacktestPage'
import { PaperTradingPage } from '@/pages/PaperTradingPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/strategy" element={<StrategyPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/paper-trading" element={<PaperTradingPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
