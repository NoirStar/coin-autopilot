import { useState } from 'react'
import { Bell, LogIn, LogOut, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LoginModal } from '@/components/auth/LoginModal'

export function Header() {
  const { user, loading, signOut } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex items-center gap-5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">BTC</span>
            <span className="font-mono-trading font-medium text-text-primary">--</span>
            <span className="font-mono-trading text-text-faint">--%</span>
          </div>
          <div className="h-3 w-px bg-border-subtle" />
          <div className="flex items-center gap-2">
            <span className="text-text-muted">레짐</span>
            <span className="rounded-md bg-[var(--accent-bg)] px-1.5 py-0.5 text-[10px] font-medium text-primary">
              --
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text-secondary">
            <Bell className="h-3.5 w-3.5" />
          </button>

          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
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
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
