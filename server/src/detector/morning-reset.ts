/**
 * 9시 리셋 모멘텀 탐지
 *
 * 업비트 일봉은 KST 09:00에 리셋됨.
 * 9:00-9:10 사이에 급등 시작하는 코인은 당일 지속 상승 확률 높음.
 *
 * 감지 조건:
 * - 현재 시각이 KST 09:00-09:30 사이
 * - 09:00 이후 상승률 > threshold (기본 1%)
 */

export function detectMorningResetMomentum(
  currentPrice: number,
  openPrice: number,  // 09:00 시가
  currentTimeKST: Date,
  threshold: number = 1.0
): { detected: boolean; changePct: number; minutesSinceReset: number } {
  const hour = currentTimeKST.getHours()
  const minute = currentTimeKST.getMinutes()
  const minutesSinceReset = (hour - 9) * 60 + minute

  // 9시 이후 30분 이내만 감지
  if (hour !== 9 || minute > 30) {
    return { detected: false, changePct: 0, minutesSinceReset }
  }

  if (openPrice <= 0) {
    return { detected: false, changePct: 0, minutesSinceReset }
  }

  const changePct = ((currentPrice - openPrice) / openPrice) * 100

  return {
    detected: changePct >= threshold,
    changePct: Math.round(changePct * 100) / 100,
    minutesSinceReset,
  }
}

/**
 * 9시 리셋 시각인지 확인
 * @returns KST 기준 9시 전후 10분 이내인지
 */
export function isNearMorningReset(): boolean {
  const now = new Date()
  // UTC+9 변환
  const kstHour = (now.getUTCHours() + 9) % 24
  const kstMinute = now.getUTCMinutes()

  // 08:50 ~ 09:30 범위
  if (kstHour === 8 && kstMinute >= 50) return true
  if (kstHour === 9 && kstMinute <= 30) return true
  return false
}
