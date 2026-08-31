import type { CollapsedRow, LogEntry, LogLevel } from './types'

export interface FilterOptions {
  levels: Record<LogLevel, boolean>
  query: string
  regex: boolean
  caseSensitive: boolean
  invert: boolean
  tag: string
  fileName: string
  collapse: boolean
}

export interface FilterResult {
  rows: CollapsedRow[]
  matchedCount: number
  error: string | null
}

export function countByLevel(entries: LogEntry[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = {
    verbose: 0,
    debug: 0,
    info: 0,
    warning: 0,
    error: 0,
  }
  for (const entry of entries) counts[entry.level] += 1
  return counts
}

export function uniqueTags(entries: LogEntry[]): string[] {
  const set = new Set<string>()
  for (const entry of entries) {
    if (entry.tag) set.add(entry.tag)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function uniqueFiles(entries: LogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.fileName))]
}

export function applyFilter(entries: LogEntry[], options: FilterOptions): FilterResult {
  const query = options.query.trim()
  let matcher: ((text: string) => boolean) | null = null
  let error: string | null = null

  if (query) {
    try {
      if (options.regex) {
        const re = new RegExp(query, options.caseSensitive ? '' : 'i')
        matcher = (text) => re.test(text)
      } else if (options.caseSensitive) {
        matcher = (text) => text.includes(query)
      } else {
        const q = query.toLowerCase()
        matcher = (text) => text.toLowerCase().includes(q)
      }
    } catch {
      error = '正则表达式无效'
      matcher = null
    }
  }

  const filtered: LogEntry[] = []
  for (const entry of entries) {
    if (!options.levels[entry.level]) continue
    if (options.tag !== 'all' && entry.tag !== options.tag) continue
    if (options.fileName !== 'all' && entry.fileName !== options.fileName) continue

    if (matcher) {
      const haystack = `${entry.timestamp} ${entry.tag} ${entry.message} ${entry.raw}`
      const hit = matcher(haystack)
      if (options.invert ? hit : !hit) continue
    } else if (options.invert && query) {
      continue
    }

    filtered.push(entry)
  }

  if (!options.collapse) {
    return {
      rows: filtered.map((entry) => ({
        key: String(entry.id),
        entry,
        count: 1,
        ids: [entry.id],
      })),
      matchedCount: filtered.length,
      error,
    }
  }

  const rows: CollapsedRow[] = []
  for (const entry of filtered) {
    const key = `${entry.level}\0${entry.tag}\0${entry.message}`
    const last = rows[rows.length - 1]
    if (last && last.key === key) {
      last.count += 1
      last.ids.push(entry.id)
      continue
    }
    rows.push({ key, entry, count: 1, ids: [entry.id] })
  }

  return { rows, matchedCount: filtered.length, error }
}
