/** 把日志里的时间字符串解析成本地毫秒时间戳 */

export function parseLogTimeMs(timestamp: string): number | null {
  const t = timestamp.trim()
  if (!t) return null

  // 2026-09-14 11:38:25 / 2026-09-14T11:38:25.553 / 2026/09/14 11:38:25
  let m = t.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/,
  )
  if (m) {
    const ms = Number((m[7] ?? '0').padEnd(3, '0').slice(0, 3))
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      ms,
    )
    const n = d.getTime()
    return Number.isFinite(n) ? n : null
  }

  // Android Logcat: 08-31 18:00:04.012（缺少年份，用当前年）
  m = t.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/)
  if (m) {
    const year = new Date().getFullYear()
    const ms = Number((m[6] ?? '0').padEnd(3, '0').slice(0, 3))
    const d = new Date(
      year,
      Number(m[1]) - 1,
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      ms,
    )
    const n = d.getTime()
    return Number.isFinite(n) ? n : null
  }

  // 正文里夹着完整时间：开始记录日志 2026-09-14 11:38:13.553
  m = t.match(
    /(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/,
  )
  if (m) {
    const ms = Number((m[7] ?? '0').padEnd(3, '0').slice(0, 3))
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      ms,
    )
    const n = d.getTime()
    return Number.isFinite(n) ? n : null
  }

  return null
}

/** datetime-local 用的本地字符串：YYYY-MM-DDTHH:mm:ss */
export function msToDateTimeLocal(ms: number): string {
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function dateTimeLocalToMs(value: string): number | null {
  const v = value.trim()
  if (!v) return null
  // datetime-local 无本地时区解释
  const d = new Date(v)
  const n = d.getTime()
  return Number.isFinite(n) ? n : null
}

export function entryTimeRange(entries: { timeMs: number | null }[]): {
  min: number | null
  max: number | null
} {
  let min: number | null = null
  let max: number | null = null
  for (const e of entries) {
    if (e.timeMs == null) continue
    if (min == null || e.timeMs < min) min = e.timeMs
    if (max == null || e.timeMs > max) max = e.timeMs
  }
  return { min, max }
}
