import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DetailPanel } from './components/DetailPanel'
import { LogList } from './components/LogList'
import sampleUnityLog from '../public/sample-unity.log?raw'
import { downloadStandaloneHtml, downloadTextLogs } from './exportHtml'
import { applyFilter, countByLevel, uniqueFiles, uniqueTags } from './filter'
import { detectFormat, parseLogText } from './parser'
import type { LogEntry, LogLevel } from './types'
import { LEVELS, LEVEL_LABEL } from './types'
import { loadLogChunks, filesFromDataTransfer, type LoadProgress } from './zipLoader'
import { dateTimeLocalToMs, entryTimeRange, msToDateTimeLocal } from './time'

const ALL_ON: Record<LogLevel, boolean> = {
  verbose: true,
  debug: true,
  info: true,
  warning: true,
  error: true,
}

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [format, setFormat] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [invert, setInvert] = useState(false)
  const [collapse, setCollapse] = useState(false)
  const [tag, setTag] = useState('all')
  const [fileName, setFileName] = useState('all')
  const [levels, setLevels] = useState(ALL_ON)
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [detailH, setDetailH] = useState(220)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<LoadProgress | null>(null)

  const counts = useMemo(() => countByLevel(entries), [entries])
  const tags = useMemo(() => uniqueTags(entries), [entries])
  const files = useMemo(() => uniqueFiles(entries), [entries])
  const timeBounds = useMemo(() => entryTimeRange(entries), [entries])
  const timeFromMs = useMemo(() => dateTimeLocalToMs(timeFrom), [timeFrom])
  const timeToMs = useMemo(() => dateTimeLocalToMs(timeTo), [timeTo])
  const timeFilterOn = Boolean(timeFrom || timeTo)

  const filtered = useMemo(
    () =>
      applyFilter(entries, {
        levels,
        query,
        regex,
        caseSensitive,
        invert,
        tag,
        fileName,
        collapse,
        timeFromMs,
        timeToMs,
      }),
    [
      entries,
      levels,
      query,
      regex,
      caseSensitive,
      invert,
      tag,
      fileName,
      collapse,
      timeFromMs,
      timeToMs,
    ],
  )

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const ingest = useCallback(async (chunks: { name: string; text: string }[]) => {
    const next: LogEntry[] = []
    let idBase = 0
    const labels: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      setProgress({
        phase: 'file',
        current: i + 1,
        total: chunks.length,
        label: `解析 ${chunk.name}`,
      })
      const parsed = parseLogText(chunk.text, chunk.name)
      for (const item of parsed) {
        next.push({ ...item, id: idBase++ })
      }
      labels.push(detectFormat(chunk.text))
      // 每解析完一个文件就让出主线程，避免大包卡住页面
      await new Promise((r) => setTimeout(r, 0))
    }

    setEntries(next)
    setFormat(
      `${chunks.length} 个文件 · ${next.length} 条` +
        (labels.length ? ` · ${[...new Set(labels)].join(' / ')}` : ''),
    )
    setSelectedId(next[0]?.id ?? null)
    setQuery('')
    setTag('all')
    setFileName('all')
    setLevels(ALL_ON)
    setInvert(false)
    setCollapse(false)
    setTimeFrom('')
    setTimeTo('')
  }, [])

  const readFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const list = [...fileList]
      if (!list.length) return
      setBusy(true)
      setProgress({ phase: 'reading', current: 0, total: list.length, label: '准备读取…' })
      try {
        const chunks = await loadLogChunks(list, setProgress)
        if (!chunks.length) {
          window.alert('没有找到可解析的 .log / .txt / .zip')
          return
        }
        await ingest(chunks)
      } catch (err) {
        const message = err instanceof Error ? err.message : '读取文件失败'
        window.alert(message)
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    [ingest],
  )

  const loadSample = useCallback(() => {
    void ingest([{ name: 'sample-unity.log', text: sampleUnityLog }])
  }, [ingest])

  const filteredEntries = useMemo(() => {
    const ids = new Set(filtered.rows.flatMap((row) => row.ids))
    return entries.filter((entry) => ids.has(entry.id))
  }, [entries, filtered.rows])

  const exportBaseName = useMemo(() => {
    const first = files[0] || 'logs'
    return first.replace(/\.[^.]+$/, '') || 'logs'
  }, [files])

  const clearAll = useCallback(() => {
    setEntries([])
    setSelectedId(null)
    setFormat('')
    setQuery('')
    setTag('all')
    setFileName('all')
    setTimeFrom('')
    setTimeTo('')
  }, [])

  const clearTimeRange = useCallback(() => {
    setTimeFrom('')
    setTimeTo('')
  }, [])

  const applyFullTimeRange = useCallback(() => {
    if (timeBounds.min == null || timeBounds.max == null) return
    setTimeFrom(msToDateTimeLocal(timeBounds.min))
    setTimeTo(msToDateTimeLocal(timeBounds.max))
  }, [timeBounds])

  const exportHtml = useCallback(() => {
    downloadStandaloneHtml(filteredEntries, `${exportBaseName}-查看.html`)
  }, [exportBaseName, filteredEntries])

  const exportTxt = useCallback(() => {
    downloadTextLogs(filteredEntries, `${exportBaseName}-过滤.txt`)
  }, [exportBaseName, filteredEntries])

  useEffect(() => {
    if (selectedId == null) return
    if (!filtered.rows.some((r) => r.entry.id === selectedId)) {
      setSelectedId(filtered.rows[0]?.entry.id ?? null)
    }
  }, [filtered.rows, selectedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        fileRef.current?.click()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        clearAll()
      }
      if (e.key === 'Escape') {
        if (pasteOpen) setPasteOpen(false)
        else setSelectedId(null)
      }
      if (typing) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const rows = filtered.rows
        if (!rows.length) return
        const idx = rows.findIndex((r) => r.entry.id === selectedId)
        const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx <= 0 ? 0 : idx - 1)
        setSelectedId(rows[next].entry.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearAll, filtered.rows, pasteOpen, selectedId])

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragging(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.target === document.documentElement || e.relatedTarget === null) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (!e.dataTransfer) return
      // 必须在同步阶段处理 DataTransfer，再异步解析
      void (async () => {
        try {
          const files = await filesFromDataTransfer(e.dataTransfer!)
          if (!files.length) {
            window.alert('没有识别到可导入的 zip / 日志文件')
            return
          }
          await readFiles(files)
        } catch (err) {
          window.alert(err instanceof Error ? err.message : '导入失败')
        }
      })()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [readFiles])

  const startResize = (startY: number) => {
    const startH = detailH
    const onMove = (e: PointerEvent) => {
      const next = startH + (startY - e.clientY)
      setDetailH(Math.max(120, Math.min(480, next)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const toggleLevel = (level: LogLevel) => {
    setLevels((prev) => ({ ...prev, [level]: !prev[level] }))
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>Log Fitter</h1>
            <p>Unity / Android 日志控制台</p>
          </div>
        </div>

        <div className="toolbar-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.log,.text,.zip,text/plain,application/zip"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void readFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button type="button" className="btn primary" onClick={() => fileRef.current?.click()}>
            导入日志
          </button>
          <button type="button" className="btn" onClick={() => setPasteOpen(true)}>
            粘贴
          </button>
          <button type="button" className="btn" onClick={loadSample}>
            示例
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={exportHtml}
            disabled={!filteredEntries.length}
            title="导出可双击打开的独立 HTML 查看器"
          >
            导出 HTML
          </button>
          <button type="button" className="btn" onClick={exportTxt} disabled={!filteredEntries.length}>
            导出 TXT
          </button>
          <button type="button" className="btn danger" onClick={clearAll} disabled={!entries.length}>
            清空
          </button>
        </div>
      </header>

      <section className="filters">
        <label className="search">
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="过滤日志（消息 / 堆栈 / 标签）  Ctrl+F"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="clear-q" onClick={() => setQuery('')} aria-label="清除搜索">
              ×
            </button>
          )}
        </label>

        <label className={`toggle${caseSensitive ? ' on' : ''}`} title="区分大小写">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Aa
        </label>
        <label className={`toggle${regex ? ' on' : ''}`} title="正则表达式">
          <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
          .*
        </label>
        <label className={`toggle${invert ? ' on' : ''}`} title="反向匹配">
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
          反向
        </label>
        <label className={`toggle${collapse ? ' on' : ''}`} title="折叠连续相同日志">
          <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
          折叠相同
        </label>

        <label className="select">
          标签
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="all">全部</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {files.length > 1 && (
          <label className="select">
            文件
            <select value={fileName} onChange={(e) => setFileName(e.target.value)}>
              <option value="all">全部</option>
              {files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={`time-range${timeFilterOn ? ' on' : ''}`} title="按日志时间筛选">
          <span>时间</span>
          <input
            type="datetime-local"
            step="1"
            value={timeFrom}
            min={timeBounds.min != null ? msToDateTimeLocal(timeBounds.min) : undefined}
            max={timeBounds.max != null ? msToDateTimeLocal(timeBounds.max) : undefined}
            onChange={(e) => setTimeFrom(e.target.value)}
            disabled={!entries.length}
          />
          <span className="time-sep">~</span>
          <input
            type="datetime-local"
            step="1"
            value={timeTo}
            min={timeBounds.min != null ? msToDateTimeLocal(timeBounds.min) : undefined}
            max={timeBounds.max != null ? msToDateTimeLocal(timeBounds.max) : undefined}
            onChange={(e) => setTimeTo(e.target.value)}
            disabled={!entries.length}
          />
          {timeFilterOn ? (
            <button type="button" className="btn ghost time-btn" onClick={clearTimeRange}>
              清除
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost time-btn"
              onClick={applyFullTimeRange}
              disabled={timeBounds.min == null}
              title="填入日志最早~最晚时间，再自行收窄"
            >
              填入范围
            </button>
          )}
        </div>

        <div className="level-toggles">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`level-btn ${level}${levels[level] ? ' on' : ''}`}
              onClick={() => toggleLevel(level)}
              title={`显示/隐藏 ${LEVEL_LABEL[level]}`}
            >
              <i />
              {LEVEL_LABEL[level]}
              <b>{counts[level]}</b>
            </button>
          ))}
        </div>
      </section>

      {filtered.error && <div className="banner warn">{filtered.error}</div>}
      {timeFilterOn && timeFromMs != null && timeToMs != null && timeFromMs > timeToMs && (
        <div className="banner warn">开始时间晚于结束时间，将不会匹配到日志</div>
      )}

      <main className="workspace">
        {entries.length === 0 ? (
          <div className="hero">
            <div className="hero-card">
              <h2>导入 Unity / 游戏日志</h2>
              <p>
                支持直接拖入 zip（自动解压 logs 目录下全部 .log），也支持单个 Player.log /
                自定义「日期|消息」格式。可用 Ctrl+O 选择文件。
              </p>
              <div className="hero-actions">
                <button type="button" className="btn primary" onClick={() => fileRef.current?.click()}>
                  选择 .zip / .log / .txt
                </button>
                <button type="button" className="btn" onClick={() => setPasteOpen(true)}>
                  粘贴日志文本
                </button>
                <button type="button" className="btn" onClick={loadSample}>
                  加载示例
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <LogList
              rows={filtered.rows}
              selectedId={selectedId}
              query={query}
              regex={regex}
              caseSensitive={caseSensitive}
              onSelect={setSelectedId}
            />
            <DetailPanel entry={selected} height={detailH} onResizeStart={startResize} />
          </>
        )}
      </main>

      <footer className="status">
        <span>
          {busy
            ? progress
              ? `${progress.phase === 'unzip' ? '解压' : progress.phase === 'reading' ? '读取' : '处理'} ${progress.current}/${progress.total} · ${progress.label}`
              : '正在解析…'
            : format || '未导入日志'}
        </span>
        <span>
          显示 {filtered.matchedCount} / {entries.length} 条
          {collapse && filtered.rows.length !== filtered.matchedCount
            ? ` · 折叠为 ${filtered.rows.length} 行`
            : ''}
          {timeFilterOn ? ' · 已按时段过滤' : ''}
        </span>
        <span>↑↓ 选择 · Ctrl+F 搜索 · Ctrl+O 导入</span>
      </footer>

      {busy && (
        <div className="drop-mask">
          <div>
            {progress
              ? `${progress.phase === 'unzip' ? '解压中' : progress.phase === 'reading' ? '读取中' : '解析中'} ${progress.current}/${progress.total}`
              : '处理中…'}
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>{progress?.label}</div>
          </div>
        </div>
      )}

      {dragging && !busy && (
        <div className="drop-mask">
          <div>松开鼠标导入 zip / 日志文件</div>
        </div>
      )}

      {pasteOpen && (
        <div className="modal" role="dialog" aria-label="粘贴日志">
          <div className="modal-card">
            <h3>粘贴日志文本</h3>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="把 Unity 控制台或 Player.log 内容粘贴到这里"
              spellCheck={false}
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPasteOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  ingest([{ name: 'pasted.txt', text: pasteText }])
                  setPasteText('')
                  setPasteOpen(false)
                }}
              >
                解析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
