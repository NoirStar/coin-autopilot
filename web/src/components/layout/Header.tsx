import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LogIn, LogOut, User, Menu } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LoginModal } from '@/components/auth/LoginModal'
import { supabase } from '@/lib/supabase'
import { api } from '@/services/api'

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

  // 실시간 BTC 가격 (업비트 ticker)
  const { data: btcData } = useQuery({
    queryKey: ['header-btc-price'],
    queryFn: () => api.getBtcPrice(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const btcPrice = btcData?.price
  const regimeState = regime?.regime

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-border-subtle px-4 md:px-6">
        <div className="flex items-center gap-3 text-[13px]">
          {/* 모바일 햄버거 */}
          <button
            onClick={onMenuToggle}
            className="rounded-md p-2.5 text-text-muted hover:bg-surface-hover lg:hidden"
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
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
              regimeState === 'risk_on'
                ? 'bg-[var(--profit-bg)] text-profit'
                : regimeState === 'risk_off'
                  ? 'bg-[var(--loss-bg)] text-loss'
                  : 'bg-[var(--warning-bg)] text-warning'
            }`}>
              {regimeState === 'risk_on' ? 'RISK-ON' : regimeState === 'risk_off' ? 'RISK-OFF' : '--'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 9시 리셋 카운트다운 */}
          <ResetCountdown />

          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-[12px] font-medium text-text-secondary">
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
                className="flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-[12px] font-medium text-background transition-colors hover:brightness-110"
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

/** 업비트 9시 리셋 카운트다운 */
function ResetCountdown() {
  const [timeStr, setTimeStr] = useState(() => calcReset())

  useEffect(() => {
    const id = setInterval(() => setTimeStr(calcReset()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="hidden items-center gap-1.5 rounded border border-border-subtle px-2 py-1 sm:flex">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">RESET</span>
      <span className="font-mono-trading text-[12px] font-semibold text-warning">{timeStr}</span>
    </div>
  )
}

function calcReset(): string {
  const now = new Date()
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const kstHour = kst.getUTCHours()
  const kstMin = kst.getUTCMinutes()
  const kstSec = kst.getUTCSeconds()

  const currentSeconds = kstHour * 3600 + kstMin * 60 + kstSec
  const targetSeconds = 9 * 3600 // 09:00:00 KST
  let diff = targetSeconds - currentSeconds
  if (diff <= 0) diff += 86400

  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatKrw(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`
}
