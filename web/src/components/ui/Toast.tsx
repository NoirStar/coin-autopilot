import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { Check, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* 토스트 컨테이너 */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="region" aria-live="polite" aria-label="알림">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, item.duration)
    return () => clearTimeout(timer)
  }, [item.duration, onDismiss])

  const icons: Record<ToastType, typeof Check> = {
    success: Check,
    error: AlertTriangle,
    warning: AlertTriangle,
    info: Info,
  }

  const colors: Record<ToastType, string> = {
    success: 'border-profit text-profit',
    error: 'border-loss text-loss',
    warning: 'border-warning text-warning',
    info: 'border-[var(--accent)] text-[var(--accent)]',
  }

  const Icon = icons[item.type]

  return (
    <div className={`flex items-center gap-2.5 rounded-lg border bg-surface px-4 py-3 shadow-lg ${colors[item.type]}`}
      style={{ minWidth: 280, maxWidth: 400 }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-[12px] text-text-primary">{item.message}</span>
      <button onClick={onDismiss} aria-label="닫기" className="shrink-0 text-text-faint hover:text-text-muted">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
