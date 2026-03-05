export function BacktestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">백테스팅</h2>
        <p className="text-sm text-muted-foreground">과거 데이터로 전략을 검증합니다</p>
      </div>

      {/* Backtest Configuration */}
      <div className="glass-panel rounded-lg p-6">
        <h3 className="data-table-header mb-4">백테스트 설정</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">전략</label>
            <div className="mt-1 rounded-md border border-border bg-input px-3 py-2 text-sm">
              BTC 레짐 + 알트 평균회귀
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">시작일</label>
            <div className="mt-1 rounded-md border border-border bg-input px-3 py-2 text-sm">
              2023-01-01
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">종료일</label>
            <div className="mt-1 rounded-md border border-border bg-input px-3 py-2 text-sm">
              2026-03-01
            </div>
          </div>
        </div>
        <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          백테스트 실행
        </button>
      </div>

      {/* Results placeholder */}
      <div className="glass-panel rounded-lg p-6">
        <h3 className="data-table-header mb-4">결과</h3>
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          백테스트를 실행하면 여기에 결과가 표시됩니다
        </div>
      </div>
    </div>
  )
}
