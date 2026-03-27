export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">설정</h2>
        <p className="text-sm text-muted-foreground">API 키, 리스크 파라미터, 알림을 관리합니다</p>
      </div>

      {/* API Keys */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">API 키 관리</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <h4 className="font-medium">업비트</h4>
              <p className="text-xs text-muted-foreground">현물 매매 · KRW 마켓</p>
            </div>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              미설정
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <h4 className="font-medium">OKX</h4>
              <p className="text-xs text-muted-foreground">선물 매매 · USDT 무기한</p>
            </div>
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              미설정
            </span>
          </div>
        </div>
      </div>

      {/* Risk Parameters */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">리스크 파라미터</h3>
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">일일 최대 손실</span>
            <span className="font-mono-trading font-medium">2.0%</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">단일 포지션 손실</span>
            <span className="font-mono-trading font-medium">0.30%</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">MDD 한도</span>
            <span className="font-mono-trading font-medium">15.0%</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">매매 중단 MDD</span>
            <span className="font-mono-trading font-medium">25.0%</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">알림 설정</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Telegram 알림</span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs">비활성</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Discord 알림</span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs">비활성</span>
          </div>
        </div>
      </div>
    </div>
  )
}
