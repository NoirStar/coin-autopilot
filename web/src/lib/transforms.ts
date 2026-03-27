/** snake_case 키를 camelCase로 변환 */
export function snakeToCamel<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    result[camelKey] = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? snakeToCamel(value as Record<string, unknown>)
      : value
  }
  return result
}

/** 배열의 각 요소를 camelCase로 변환 */
export function snakeToCamelArray<T extends Record<string, unknown>>(arr: T[]): Record<string, unknown>[] {
  return arr.map(snakeToCamel)
}
