export function StatusBar() {
  return (
    <div className="flex h-7 items-center justify-between border-t border-border bg-card px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-profit" />
          Upbit 연결됨
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-profit" />
          OKX 연결됨
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span>활성 전략: 0</span>
        <span>열린 포지션: 0</span>
        <span className="font-mono-trading">v0.1.0</span>
      </div>
    </div>
  )
}
