export type LogLevel = 'verbose' | 'debug' | 'info' | 'warning' | 'error'

export interface LogEntry {
  id: number
  fileName: string
  lineStart: number
  lineEnd: number
  timestamp: string
  /** 解析后的本地毫秒时间；无法解析则为 null */
  timeMs: number | null
  level: LogLevel
  tag: string
  message: string
  raw: string
  sourceFile: string
  sourceLine: number | null
}

export interface CollapsedRow {
  key: string
  entry: LogEntry
  count: number
  ids: number[]
}

export const LEVELS: LogLevel[] = ['verbose', 'debug', 'info', 'warning', 'error']

export const LEVEL_LABEL: Record<LogLevel, string> = {
  verbose: 'Verbose',
  debug: 'Debug',
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
}

export const LEVEL_SHORT: Record<LogLevel, string> = {
  verbose: 'V',
  debug: 'D',
  info: 'I',
  warning: 'W',
  error: 'E',
}
