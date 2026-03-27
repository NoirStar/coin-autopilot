import { useEffect, useRef, memo } from 'react'

interface TradingViewWidgetConfig {
  autosize: boolean
  symbol: string
  interval: string
  timezone: string
  theme: string
  style: string
  locale: string
  toolbar_bg: string
  enable_publishing: boolean
  allow_symbol_change: boolean
  hide_top_toolbar: boolean
  hide_legend: boolean
  save_image: boolean
  backgroundColor: string
  gridColor: string
  hide_volume: boolean
}

const WIDGET_CONFIG: TradingViewWidgetConfig = {
  autosize: true,
  symbol: 'UPBIT:BTCKRW',
  interval: '240',
  timezone: 'Asia/Seoul',
  theme: 'dark',
  style: '1',
  locale: 'kr',
  toolbar_bg: '#111114',
  enable_publishing: false,
  allow_symbol_change: true,
  hide_top_toolbar: false,
  hide_legend: false,
  save_image: false,
  backgroundColor: '#0a0a0c',
  gridColor: 'rgba(39, 39, 42, 0.5)',
  hide_volume: false,
}

export const BtcCandleChart = memo(function BtcCandleChart() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 기존 위젯 정리
    container.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = '100%'
    widgetDiv.style.width = '100%'
    container.appendChild(widgetDiv)

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify(WIDGET_CONFIG)
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [])

  return (
    <div className="col-span-1 flex flex-col overflow-hidden rounded-md border border-[#1e1e22] bg-[#0a0a0c] lg:col-span-2">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: '100%', width: '100%', minHeight: '420px' }}
      />
    </div>
  )
})
