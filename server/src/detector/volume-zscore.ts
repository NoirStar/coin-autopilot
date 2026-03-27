/**
 * 거래량 Z-Score 탐지
 *
 * 현재 거래량이 20일 이동평균 대비 몇 표준편차인지 계산.
 * Z > 2.5이면 이상 거래량으로 판단.
 */
export function detectVolumeAnomaly(
  volumes: number[],
  period: number = 20,
  threshold: number = 2.5
): { detected: boolean; zScore: number; avgVolume: number } {
  if (volumes.length < period + 1) {
    return { detected: false, zScore: 0, avgVolume: 0 }
  }

  // 마지막 값은 현재, 그 이전 period개로 통계 계산
  const current = volumes[volumes.length - 1]
  const window = volumes.slice(-(period + 1), -1)

  const mean = window.reduce((a, b) => a + b, 0) / window.length
  const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / window.length
  const std = Math.sqrt(variance)

  if (std === 0) return { detected: false, zScore: 0, avgVolume: mean }

  const zScore = (current - mean) / std

  return {
    detected: zScore >= threshold,
    zScore: Math.round(zScore * 100) / 100,
    avgVolume: Math.round(mean),
  }
}
