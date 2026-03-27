export function PaperTradingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">가상매매</h2>
          <p className="text-sm text-muted-foreground">실시간 데이터로 전략을 검증합니다 (실제 주문 없음)</p>
        </div>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          새 세션 시작
        </button>
      </div>

      {/* Active Sessions */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">활성 세션</h3>
        <div className="text-sm text-text-muted">
          실행 중인 가상매매 세션이 없습니다. 새 세션을 시작하세요.
        </div>
      </div>

      {/* Strategy Comparison */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">전략 비교</h3>
        <div className="flex h-64 items-center justify-center text-sm text-text-muted">
          다중 세션 실행 시 전략 간 성과 비교가 표시됩니다
        </div>
      </div>
    </div>
  )
}
