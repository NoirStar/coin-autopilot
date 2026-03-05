import { Bell, Moon, Sun } from 'lucide-react'

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">BTC</span>
          <span className="font-mono-trading font-semibold text-foreground">
            $—
          </span>
          <span className="text-xs text-profit">—%</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">레짐</span>
          <span className="rounded bg-profit/10 px-2 py-0.5 text-xs font-medium text-profit">
            —
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Bell className="h-4 w-4" />
        </button>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Moon className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
