import { useState } from 'react'
import { X, Mail, Github, Loader2, Check } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { signInWithEmail, signInWithGithub } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    const result = await signInWithEmail(email.trim())
    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSent(true)
    }
  }

  const handleGithubLogin = async () => {
    setLoading(true)
    setError(null)
    const result = await signInWithGithub()
    setLoading(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-background/80"
        onClick={onClose}
      />

      {/* modal */}
      <div className="relative w-full max-w-sm rounded-md border border-border-subtle bg-surface p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text-secondary"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold text-text-primary">로그인</h2>
        <p className="mt-1 text-[12px] text-text-muted">
          로그인하면 백테스트와 가상매매를 이용할 수 있습니다.
        </p>

        {sent ? (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--profit-bg)]">
              <Check className="h-5 w-5 text-profit" />
            </div>
            <p className="text-[13px] font-medium text-text-primary">
              메일을 확인하세요
            </p>
            <p className="mt-1 text-[12px] text-text-muted">
              {email}으로 로그인 링크를 보냈습니다.
            </p>
          </div>
        ) : (
          <>
            {/* GitHub */}
            <button
              onClick={handleGithubLogin}
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface px-4 py-2.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              <Github className="h-4 w-4" />
              GitHub로 계속하기
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border-subtle" />
              <span className="text-[11px] text-text-faint">또는</span>
              <div className="h-px flex-1 bg-border-subtle" />
            </div>

            {/* Email magic link */}
            <form onSubmit={handleEmailLogin}>
              <label className="text-[11px] font-medium text-text-muted">이메일</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="mt-1 w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-[13px] text-text-primary placeholder:text-text-faint outline-none transition-colors focus:border-primary"
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                매직 링크 보내기
              </button>
            </form>
          </>
        )}

        {error && (
          <p className="mt-3 text-center text-[11px] text-loss">{error}</p>
        )}
      </div>
    </div>
  )
}
