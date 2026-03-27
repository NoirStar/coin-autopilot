export function StrategyPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">전략 관리</h2>
          <p className="text-sm text-muted-foreground">매매 전략과 투자 성향을 설정합니다</p>
        </div>
      </div>

      {/* Risk Profile Selector */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">투자 성향</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ProfileCard
            name="안전 (Conservative)"
            description="현물만, 낮은 레버리지, 제한된 동시 보유"
            leverage="1x"
            maxPositions={3}
            mdd="10%"
          />
          <ProfileCard
            name="중립 (Moderate)"
            description="현물+선물, 적정 레버리지, 균형 잡힌 리스크"
            leverage="1~2x"
            maxPositions={5}
            mdd="15%"
            active
          />
          <ProfileCard
            name="공격 (Aggressive)"
            description="적극적 레버리지, 다중 전략, 높은 리스크 허용"
            leverage="2~3x"
            maxPositions={8}
            mdd="25%"
          />
        </div>
      </div>

      {/* Strategy List */}
      <div className="card-surface rounded-md p-5">
        <h3 className="data-table-header mb-4">전략 목록</h3>
        <div className="space-y-3">
          <StrategyCard
            name="BTC 레짐 + 알트 평균회귀"
            type="regime_mean_reversion"
            status="active"
            description="BTC 레짐이 Risk-On일 때 z-score로 눌린 알트코인을 매수"
          />
          <StrategyCard
            name="BTC 도미넌스 로테이션"
            type="dominance_rotation"
            status="inactive"
            description="BTC.D 하락 + USDT.D 하락 시 알트 시즌 포착"
          />
          <StrategyCard
            name="변동성 타이밍"
            type="volatility_timing"
            status="inactive"
            description="BTC 변동성 낮고 추세 양호 시 알트 익스포저 확대"
          />
          <StrategyCard
            name="펀딩비 차익"
            type="funding_arbitrage"
            status="inactive"
            description="OKX 펀딩비 극단 시 델타중립 포지션"
          />
        </div>
      </div>
    </div>
  )
}

function ProfileCard({ name, description, leverage, maxPositions, mdd, active }: {
  name: string
  description: string
  leverage: string
  maxPositions: number
  mdd: string
  active?: boolean
}) {
  return (
    <div className={`rounded-md border p-4 transition-colors cursor-pointer ${
      active
        ? 'border-primary bg-[var(--accent-bg)]'
        : 'border-border-subtle hover:border-border'
    }`}>
      <h4 className="font-semibold">{name}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 flex gap-4 text-xs">
        <span>레버리지: <strong>{leverage}</strong></span>
        <span>최대 보유: <strong>{maxPositions}</strong></span>
        <span>MDD 한도: <strong>{mdd}</strong></span>
      </div>
    </div>
  )
}

function StrategyCard({ name, type, status, description }: {
  name: string
  type: string
  status: 'active' | 'inactive'
  description: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{name}</h4>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            status === 'active'
              ? 'bg-[var(--profit-bg)] text-profit'
              : 'bg-muted text-muted-foreground'
          }`}>
            {status === 'active' ? '활성' : '비활성'}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 font-mono-trading text-xs text-muted-foreground">{type}</p>
      </div>
      <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">
        설정
      </button>
    </div>
  )
}
