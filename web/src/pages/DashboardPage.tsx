export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">대시보드</h2>
        <p className="text-sm text-muted-foreground">자산 현황과 매매 상태를 실시간으로 확인합니다</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="총 자산" value="—" unit="KRW" change={0} />
        <KpiCard title="일일 손익" value="—" unit="KRW" change={0} />
        <KpiCard title="승률" value="—" unit="%" />
        <KpiCard title="MDD" value="—" unit="%" variant="destructive" />
      </div>

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass-panel col-span-2 rounded-lg p-4">
          <h3 className="data-table-header mb-3">자산 추이</h3>
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            차트 영역 (Lightweight Charts)
          </div>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <h3 className="data-table-header mb-3">자산 배분</h3>
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            도넛 차트 (Recharts)
          </div>
        </div>
      </div>

      {/* Active Positions */}
      <div className="glass-panel rounded-lg p-4">
        <h3 className="data-table-header mb-3">활성 포지션</h3>
        <div className="text-sm text-muted-foreground">
          현재 열린 포지션이 없습니다
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, unit, change, variant }: {
  title: string
  value: string
  unit?: string
  change?: number
  variant?: 'destructive'
}) {
  return (
    <div className="glass-panel rounded-lg p-4">
      <p className="data-table-header">{title}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`font-mono-trading text-2xl font-bold ${
          variant === 'destructive' ? 'text-loss' : ''
        }`}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {change !== undefined && (
        <p className={`mt-1 text-xs ${change >= 0 ? 'text-profit' : 'text-loss'}`}>
          {change >= 0 ? '+' : ''}{change}% vs 어제
        </p>
      )}
    </div>
  )
}
