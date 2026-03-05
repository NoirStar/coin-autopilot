export function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">포트폴리오</h2>
        <p className="text-sm text-muted-foreground">거래소별 잔고와 거래 내역을 확인합니다</p>
      </div>

      {/* Exchange Balances */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="glass-panel rounded-lg p-4">
          <h3 className="data-table-header mb-3">업비트 (현물)</h3>
          <div className="font-mono-trading text-2xl font-bold">— KRW</div>
          <p className="mt-1 text-xs text-muted-foreground">보유 코인: —</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <h3 className="data-table-header mb-3">OKX (선물)</h3>
          <div className="font-mono-trading text-2xl font-bold">— USDT</div>
          <p className="mt-1 text-xs text-muted-foreground">미결제 포지션: —</p>
        </div>
      </div>

      {/* Trade History */}
      <div className="glass-panel rounded-lg p-6">
        <h3 className="data-table-header mb-4">거래 내역</h3>
        <div className="text-sm text-muted-foreground">
          아직 거래 내역이 없습니다
        </div>
      </div>
    </div>
  )
}
