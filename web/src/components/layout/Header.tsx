import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LogIn, LogOut, User, Menu } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LoginModal } from '@/components/auth/LoginModal'
import { supabase } from '@/lib/supabase'

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { user, loading, signOut } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)

  // BTC 레짐 실시간 조회
  const { data: regime } = useQuery({
    queryKey: ['header-regime'],
    queryFn: async () => {
      const { data } = await supabase
        .from('regime_states')
        .select('regime, btc_close')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single()
      return data
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const btcPrice = regime?.btc_close
  const regimeState = regime?.regime

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-border-subtle px-4 md:px-6">
        <div className="flex items-center gap-3 text-[13px]">
          {/* 모바일 햄버거 */}
          <button
            onClick={onMenuToggle}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-text-muted">BTC</span>
            <span className="font-mono-trading font-medium text-text-primary">
              {btcPrice ? formatKrw(btcPrice) : '--'}
            </span>
          </div>
          <div className="hidden h-3 w-px bg-border-subtle sm:block" />
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-text-muted">레짐</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              regimeState === 'risk_on'
                ? 'bg-[var(--profit-bg)] text-profit'
                : regimeState === 'risk_off'
                  ? 'bg-[var(--loss-bg)] text-loss'
                  : 'bg-[var(--accent-bg)] text-primary'
            }`}>
              {regimeState === 'risk_on' ? 'RISK-ON' : regimeState === 'risk_off' ? 'RISK-OFF' : '--'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                  {user.email?.charAt(0).toUpperCase() ?? <User className="h-3 w-3" />}
                </div>
                <button
                  onClick={() => signOut()}
                  className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text-secondary"
                  title="로그아웃"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLoginOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:brightness-110"
              >
                <LogIn className="h-3 w-3" />
                로그인
              </button>
            )
          )}
        </div>
      </header>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  )
}

function formatKrw(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}억`
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`
  return value.toLocaleString('ko-KR')
}
