import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LoginModal } from '@/components/auth/LoginModal'

/**
 * 인증이 필요한 페이지를 감싸는 가드.
 * 비로그인 시 인라인 안내 메시지를 표시합니다. (PLAN.md 7.0 인증 경계 UI)
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <LogIn className="h-5 w-5 text-text-faint" />
          </div>
          <p className="text-[14px] font-medium text-text-secondary">
            로그인이 필요합니다
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            로그인하면 백테스트와 가상매매를 이용할 수 있습니다.
          </p>
          <button
            onClick={() => setLoginOpen(true)}
            className="mt-4 flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:brightness-110"
          >
            <LogIn className="h-3.5 w-3.5" />
            로그인
          </button>
        </div>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    )
  }

  return <>{children}</>
}
