import { backfillCandles } from '../data/candle-collector.js'
async function main() {
  const count = await backfillCandles('upbit', 'ATOM', '4h', 6)
  console.log(`ATOM: ${count}개 저장`)
}
main().catch(console.error)
