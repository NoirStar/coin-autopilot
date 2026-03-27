import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { DashboardPage } from '@/pages/DashboardPage'
import { StrategyPage } from '@/pages/StrategyPage'
import { BacktestPage } from '@/pages/BacktestPage'
import { PaperTradingPage } from '@/pages/PaperTradingPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SignalsPage } from '@/pages/SignalsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* public */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/signals" element={<SignalsPage />} />

        {/* private – auth required */}
        <Route path="/strategy" element={<AuthGuard><StrategyPage /></AuthGuard>} />
        <Route path="/backtest" element={<AuthGuard><BacktestPage /></AuthGuard>} />
        <Route path="/paper-trading" element={<AuthGuard><PaperTradingPage /></AuthGuard>} />
        <Route path="/portfolio" element={<AuthGuard><PortfolioPage /></AuthGuard>} />
        <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
      </Route>
    </Routes>
  )
}
