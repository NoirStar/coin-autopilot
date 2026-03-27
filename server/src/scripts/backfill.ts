/**
 * 히스토리 캔들 일괄 수집 (backfill)
 * 실행: npx tsx --env-file=.env src/scripts/backfill.ts
 */

import { backfillCandles } from '../data/candle-collector.js'

const SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'ATOM']
const MONTHS = 6

async function main() {
  console.log(`=== ${MONTHS}개월치 캔들 Backfill 시작 ===\n`)

  for (const symbol of SYMBOLS) {
    console.log(`${symbol} 수집 중...`)
    const count = await backfillCandles('upbit', symbol, '4h', MONTHS)
    console.log(`  → ${count}개 저장\n`)
  }

  console.log('=== Backfill 완료 ===')
}

main().catch(console.error)
