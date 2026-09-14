import type { LogEntry, LogLevel } from './types'

const DEBUG_LOG_RE =
  /UnityEngine\.(?:Debug|Logger):Log(Warning|Error|Exception|Assertion)?\b/
const FILENAME_RE = /^\(?Filename:\s*(.*?)\s+Line:\s*(-?\d+)\)?\s*$/
const STACK_AT_RE = /^\s+at\s+/
const STACK_AT_PAREN_RE = /\s\(at\s+.+:-?\d+\)$/
const STACK_END_RE = /---\s*End of (?:internal )?stack trace/i
const UNITY_ENGINE_LINE_RE = /^(?:UnityEngine|UnityEditor)\./
const ANDROID_LOGCAT_RE =
  /^(?:(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+)?(?:(\d+)\s+(\d+)\s+)?([VDIWEAF])\s+(\S+)\s*:\s*(.*)$/
const ANDROID_SHORT_RE =
  /^(?:(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+)?([VDIWEAF])\/(\S+?)\s*:\s*(.*)$/
const BRACKET_TS_LEVEL_RE =
  /^\[?\s*(\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s*\]?\s*\[(VERBOSE|TRACE|DEBUG|INFO|LOG|WARN(?:ING)?|ERROR|FATAL|EXCEPTION|ASSERT)\]\s*(?:\[([^\]]+)\])?\s*(.*)$/i
const LEVEL_FIRST_RE =
  /^\[(VERBOSE|TRACE|DEBUG|INFO|LOG|WARN(?:ING)?|ERROR|FATAL|EXCEPTION|ASSERT)\]\s*(?:\[([^\]]+)\])?\s*(.*)$/i
const TS_LEVEL_RE =
  /^(\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+\[?(VERBOSE|TRACE|DEBUG|INFO|LOG|WARN(?:ING)?|ERROR|FATAL|EXCEPTION|ASSERT)\]?\s*:?\s*(?:\[([^\]]+)\])?\s*(.*)$/i
const TIME_PREFIX_RE =
  /^\[?(\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\]?\s+(.*)$/
/** 项目自定义：2026-08-29 21:53:14|消息内容… */
const PIPE_TS_RE =
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\|([\s\S]*)$/
const SESSION_HEADER_RE =
  /^===\s*(.+?)\s*===\s*$/
const LUA_STACK_LINE_RE =
  /^\t?.+?:\d+:\s+in function\b/
const EXCEPTION_RE =
  /^(?:[A-Za-z0-9_.]+)?(?:Exception|Error|AssertionException)\b/
const UNITY_HEADER_RE =
  /^(?:Initialize engine version:|Mono path\[|GfxDevice:|UnloadTime:|Version:)/

const ANDROID_LEVEL: Record<string, LogLevel> = {
  V: 'verbose',
  D: 'debug',
  I: 'info',
  W: 'warning',
  E: 'error',
  A: 'error',
  F: 'error',
}

interface Draft {
  fileName: string
  lineStart: number
  lineEnd: number
  timestamp: string
  level: LogLevel
  tag: string
  message: string
  lines: string[]
  sourceFile: string
  sourceLine: number | null
  completed: boolean
}

type StrongStart = Partial<Pick<Draft, 'timestamp' | 'level' | 'tag' | 'message'>> & {
  keepOpen?: boolean
}

export function detectFormat(text: string): string {
  const sample = text.slice(0, 12000)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\|/m.test(sample) || /===\s*开始记录日志/.test(sample)) {
    return '游戏自定义日志 (日期|消息)'
  }
  if (
    /UnityEngine\.Debug:Log/.test(sample) ||
    /Initialize engine version:/.test(sample) ||
    /\(Filename: .+ Line:/.test(sample)
  ) {
    return 'Unity Player / Editor.log'
  }
  if (
    /^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.+\s+[VDIWEAF]\s+\S+\s*:/m.test(sample) ||
    /^[VDIWEAF]\/\S+\s*:/m.test(sample)
  ) {
    return 'Android Logcat'
  }
  if (/\[(INFO|WARN(?:ING)?|ERROR|DEBUG|LOG)\]/i.test(sample)) {
    return '带级别标签的日志'
  }
  return '通用文本日志'
}

export function parseLogText(text: string, fileName = 'log.txt'): LogEntry[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const drafts: Draft[] = []
  const state: { current: Draft | null } = { current: null }
  let nextId = 0

  const startDraft = (
    lineNo: number,
    line: string,
    parsed: StrongStart,
  ): Draft => {
    if (state.current) drafts.push(state.current)
    const draft: Draft = {
      fileName,
      lineStart: lineNo,
      lineEnd: lineNo,
      timestamp: parsed.timestamp ?? '',
      level: parsed.level ?? inferLevel(line),
      tag: parsed.tag ?? '',
      message: (parsed.message ?? line).trim() || line,
      lines: [line],
      sourceFile: '',
      sourceLine: null,
      completed: false,
    }
    state.current = draft
    return draft
  }

  const appendLine = (lineNo: number, line: string) => {
    const current = state.current
    if (!current) {
      startDraft(lineNo, line, {})
      return
    }
    current.lines.push(line)
    current.lineEnd = lineNo
    applyUnityHints(current, line)
    applyLuaHints(current, line)
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      // 管道日志空行常夹在表 dump 中间，不能当作条目结束
      if (state.current && !PIPE_TS_RE.test(state.current.lines[0] ?? '')) {
        state.current.completed = true
      }
      continue
    }

    if (isContinuation(trimmed, line)) {
      appendLine(lineNo, line)
      continue
    }

    const strong = matchStrongStart(line)
    const next = nextNonEmpty(lines, i)
    const unityMessage = isUnityLogSink(next)
    if (strong || !state.current || state.current.completed || unityMessage) {
      const draft = startDraft(lineNo, line, strong ?? {})
      // 多行管道日志不能标记 completed，否则后续表 dump / 堆栈会被拆碎
      if (strong && !strong.keepOpen) draft.completed = true
      continue
    }

    appendLine(lineNo, line)
  }

  if (state.current) drafts.push(state.current)

  return drafts.map((draft) => {
    const raw = draft.lines.join('\n')
    if (!draft.tag) {
      draft.tag = inferTag(draft.message, raw)
    }
    if (draft.level === 'info') {
      const refined = inferLevel(draft.message)
      if (refined !== 'info') draft.level = refined
    }
    return {
      id: nextId++,
      fileName: draft.fileName,
      lineStart: draft.lineStart,
      lineEnd: draft.lineEnd,
      timestamp: draft.timestamp,
      level: draft.level,
      tag: draft.tag,
      message: draft.message,
      raw,
      sourceFile: draft.sourceFile,
      sourceLine: draft.sourceLine,
    }
  })
}

function matchStrongStart(line: string): StrongStart | null {
  let m = line.match(PIPE_TS_RE)
  if (m) {
    const body = m[2] ?? ''
    const meta = parsePipeBody(body)
    return {
      timestamp: m[1] ?? '',
      level: meta.level,
      tag: meta.tag,
      message: meta.message,
      keepOpen: true,
    }
  }

  m = line.match(SESSION_HEADER_RE)
  if (m) {
    return {
      level: 'info',
      tag: 'Session',
      message: m[1]?.trim() || line,
      keepOpen: false,
    }
  }

  m = line.match(ANDROID_LOGCAT_RE)
  if (m && (m[1] || m[2] || m[4])) {
    const level = ANDROID_LEVEL[m[4]] ?? 'info'
    return {
      timestamp: m[1] ?? '',
      level,
      tag: m[5] === 'Unity' ? extractUnityTag(m[6] ?? '') : m[5],
      message: m[6] ?? '',
    }
  }

  m = line.match(ANDROID_SHORT_RE)
  if (m && m[2] && m[3]) {
    return {
      timestamp: m[1] ?? '',
      level: ANDROID_LEVEL[m[2]] ?? 'info',
      tag: m[3] === 'Unity' ? extractUnityTag(m[4] ?? '') : m[3],
      message: m[4] ?? '',
    }
  }

  m = line.match(BRACKET_TS_LEVEL_RE)
  if (m) {
    return {
      timestamp: m[1] ?? '',
      level: normalizeLevel(m[2]),
      tag: m[3] ?? extractBracketTag(m[4] ?? ''),
      message: stripLeadingTag(m[4] ?? ''),
    }
  }

  m = line.match(LEVEL_FIRST_RE)
  if (m) {
    return {
      level: normalizeLevel(m[1]),
      tag: m[2] ?? extractBracketTag(m[3] ?? ''),
      message: stripLeadingTag(m[3] ?? ''),
    }
  }

  m = line.match(TS_LEVEL_RE)
  if (m) {
    return {
      timestamp: m[1] ?? '',
      level: normalizeLevel(m[2]),
      tag: m[3] ?? extractBracketTag(m[4] ?? ''),
      message: stripLeadingTag(m[4] ?? ''),
    }
  }

  if (EXCEPTION_RE.test(line)) {
    // 进程退出时的 ThreadAbortException 不是业务错误
    if (/^ThreadAbortException\b/i.test(line.trim())) {
      return {
        level: 'info',
        tag: 'Runtime',
        message: line.trim(),
        keepOpen: true,
      }
    }
    const time = line.match(TIME_PREFIX_RE)
    return {
      timestamp: time?.[1] ?? '',
      level: 'error',
      message: time?.[2] ?? line,
      keepOpen: true,
    }
  }

  if (UNITY_HEADER_RE.test(line)) {
    return { level: 'info', tag: 'Unity', message: line }
  }

  m = line.match(TIME_PREFIX_RE)
  if (m && looksLikeStructuredLine(line)) {
    return {
      timestamp: m[1],
      message: m[2],
      level: inferLevel(m[2]),
      tag: extractBracketTag(m[2]),
    }
  }

  return null
}

function parsePipeBody(body: string): { tag: string; message: string; level: LogLevel } {
  let text = body.trim()
  // 去掉 "26/08/29 21:53:14, " 这类内嵌时间前缀
  text = text.replace(/^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2},\s*/, '')
  // 去掉 "21:53:14.371-145: " 这类毫秒前缀
  text = text.replace(/^\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:-\d+)?:\s*/, '')

  const level = inferLevel(text)
  // 合牌|牌区|手牌|… 或 如意牌机制|服务器日志|…
  const parts = text.split('|')
  if (parts.length >= 2) {
    const tag = parts[0]?.trim() ?? ''
    if (tag && tag.length <= 24 && !tag.includes('{')) {
      return { tag, message: text, level }
    }
  }

  const net = text.match(/\b(\d+)\s+(onNet\w+)\b/i)
  if (net) {
    return { tag: net[2], message: text, level }
  }

  return { tag: '', message: text || body, level }
}

function isContinuation(trimmed: string, raw: string): boolean {
  if (/^stack traceback:/i.test(trimmed)) return true
  if (LUA_STACK_LINE_RE.test(raw) || LUA_STACK_LINE_RE.test(trimmed)) return true
  if (/^\t/.test(raw)) return true
  if (/^\s+\[C\]:/.test(raw)) return true
  if (STACK_AT_RE.test(raw)) return true
  if (STACK_AT_PAREN_RE.test(trimmed)) return true
  if (STACK_END_RE.test(trimmed)) return true
  if (UNITY_ENGINE_LINE_RE.test(trimmed)) return true
  if (DEBUG_LOG_RE.test(trimmed)) return true
  if (FILENAME_RE.test(trimmed)) return true
  if (/^Rethrow as\s+/i.test(trimmed)) return true
  if (/^\(wrapper\b/.test(trimmed)) return true
  if (/^\[0x[0-9A-Fa-f]+\]/.test(trimmed)) return true
  if (/^\(Filename:/i.test(trimmed)) return true
  return false
}

function applyUnityHints(draft: Draft, line: string) {
  const debug = line.match(DEBUG_LOG_RE)
  if (debug) {
    draft.completed = true
    if (debug[1] === 'Warning') draft.level = 'warning'
    else if (debug[1] === 'Error' || debug[1] === 'Exception' || debug[1] === 'Assertion') {
      draft.level = 'error'
    } else if (draft.level === 'verbose') {
      draft.level = 'info'
    }
  }

  const file = line.match(FILENAME_RE)
  if (file) {
    draft.completed = true
    const path = file[1].trim()
    if (path && path !== '<filename unknown>' && path !== '') {
      draft.sourceFile = path
      const n = Number(file[2])
      draft.sourceLine = Number.isFinite(n) && n > 0 ? n : null
    }
  }

  const atFile = line.match(/\(at\s+(.+):(-?\d+)\)\s*$/)
  if (atFile && !draft.sourceFile) {
    const path = atFile[1].trim()
    if (path && !path.startsWith('<')) {
      draft.sourceFile = path
      const n = Number(atFile[2])
      draft.sourceLine = Number.isFinite(n) && n > 0 ? n : null
    }
  }
}

function applyLuaHints(draft: Draft, line: string) {
  const m = line.match(/^\t?(.+?):(\d+):\s+in function\b/)
  if (m) {
    const path = m[1].trim()
    const skip =
      !path ||
      path === '[C]' ||
      /(?:^|\/)(?:Helper|Debugger)$/i.test(path) ||
      /Util\/(?:Helper|Debugger)/i.test(path)
    if (!skip) {
      // 优先保留业务栈帧；若尚无来源则写入
      if (!draft.sourceFile || /Util\/(?:Helper|Debugger)/i.test(draft.sourceFile)) {
        draft.sourceFile = path
        const n = Number(m[2])
        draft.sourceLine = Number.isFinite(n) && n > 0 ? n : null
      }
    }
  }
  if (/Exception|断言|崩溃|失败|error/i.test(draft.message) && /g_logErr|LogError/.test(line)) {
    draft.level = 'error'
  } else if (/g_logWarn|LogWarning/.test(line)) {
    draft.level = 'warning'
  }
}

function normalizeLevel(raw: string): LogLevel {
  const s = raw.toUpperCase()
  if (s === 'VERBOSE' || s === 'TRACE' || s === 'V') return 'verbose'
  if (s === 'DEBUG' || s === 'D') return 'debug'
  if (s === 'WARN' || s === 'WARNING' || s === 'W') return 'warning'
  if (
    s === 'ERROR' ||
    s === 'FATAL' ||
    s === 'EXCEPTION' ||
    s === 'ASSERT' ||
    s === 'E' ||
    s === 'A' ||
    s === 'F'
  ) {
    return 'error'
  }
  return 'info'
}

function inferLevel(text: string): LogLevel {
  if (DEBUG_LOG_RE.test(text)) {
    const m = text.match(DEBUG_LOG_RE)
    if (m?.[1] === 'Warning') return 'warning'
    if (m?.[1] === 'Error' || m?.[1] === 'Exception' || m?.[1] === 'Assertion') return 'error'
    return 'info'
  }
  if (
    /\b(LogError|LogException|LogAssertion)\b/.test(text) ||
    /\b(ERROR|FATAL|EXCEPTION|ASSERT)\b/.test(text) ||
    EXCEPTION_RE.test(text.trim()) ||
    /\[Error\]/i.test(text)
  ) {
    return 'error'
  }
  if (/\b(LogWarning|WARNING|WARN)\b/.test(text) || /\[Warn(?:ing)?\]/i.test(text)) {
    return 'warning'
  }
  if (/\bVERBOSE\b/.test(text) || /\[Verbose\]/i.test(text)) return 'verbose'
  if (/(?:^|[\[\s])DEBUG(?:[\]\s:]|$)/.test(text) && !/UnityEngine\.Debug:Log\b/.test(text)) {
    return 'debug'
  }
  return 'info'
}

function extractBracketTag(message: string): string {
  const m = message.match(/^\[(?!VERBOSE|TRACE|DEBUG|INFO|LOG|WARN(?:ING)?|ERROR|FATAL|EXCEPTION|ASSERT)([^\]]+)\]/i)
  return m?.[1]?.trim() ?? ''
}

function stripLeadingTag(message: string): string {
  return message.replace(/^\[[^\]]+\]\s*/, '').trim() || message
}

function extractUnityTag(message: string): string {
  const tagged = extractBracketTag(message.trim())
  return tagged || 'Unity'
}

function inferTag(message: string, raw: string): string {
  const fromMsg = extractBracketTag(message)
  if (fromMsg) return fromMsg
  if (PIPE_TS_RE.test(raw.split('\n')[0] ?? '')) {
    const pipe = raw.split('\n')[0]?.match(PIPE_TS_RE)
    if (pipe) return parsePipeBody(pipe[2] ?? '').tag
  }
  if (/UnityEngine\.|Initialize engine version:/.test(raw)) return 'Unity'
  return ''
}

function nextNonEmpty(lines: string[], index: number): string {
  for (let i = index + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed) return trimmed
  }
  return ''
}

function isUnityLogSink(line: string): boolean {
  return DEBUG_LOG_RE.test(line) || FILENAME_RE.test(line) || /^\(Filename:/i.test(line)
}

function looksLikeStructuredLine(line: string): boolean {
  return (
    /\[(VERBOSE|TRACE|DEBUG|INFO|LOG|WARN(?:ING)?|ERROR|FATAL)\]/i.test(line) ||
    /^\d{4}[-/]\d{2}[-/]\d{2}/.test(line)
  )
}
