export function StatusBar() {
  return (
    <div className="flex h-7 items-center justify-between border-t border-border-subtle px-5 text-[12px] text-text-secondary">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-profit" />
          Upbit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-profit" />
          OKX
        </span>
      </div>
      <div className="hidden items-center gap-4 sm:flex">
        <span>전략 0</span>
        <span>포지션 0</span>
        <span className="font-mono-trading">v0.1.0</span>
      </div>
    </div>
  )
}
