import type { LogEntry } from '../types'
import { LEVEL_LABEL } from '../types'

interface DetailPanelProps {
  entry: LogEntry | null
  height: number
  onResizeStart: (clientY: number) => void
}

export function DetailPanel({ entry, height, onResizeStart }: DetailPanelProps) {
  return (
    <section className="detail" style={{ height }}>
      <div
        className="splitter"
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={(e) => {
          e.preventDefault()
          onResizeStart(e.clientY)
        }}
      />
      {!entry ? (
        <div className="detail-empty">选择一条日志，查看完整内容与堆栈</div>
      ) : (
        <div className="detail-body">
          <header className="detail-meta">
            <span className={`lvl lvl-${entry.level}`}>{LEVEL_LABEL[entry.level]}</span>
            {entry.timestamp && <span>{entry.timestamp}</span>}
            {entry.tag && <span className="chip">{entry.tag}</span>}
            <span className="dim">
              {entry.fileName}:{entry.lineStart}
              {entry.lineEnd !== entry.lineStart ? `–${entry.lineEnd}` : ''}
            </span>
            {entry.sourceFile && (
              <span className="source">
                {entry.sourceFile}
                {entry.sourceLine ? `:${entry.sourceLine}` : ''}
              </span>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigator.clipboard.writeText(entry.raw)}
            >
              复制
            </button>
          </header>
          <pre className="detail-raw">{entry.raw}</pre>
        </div>
      )}
    </section>
  )
}
