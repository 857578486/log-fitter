import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import { highlightText } from '../highlight'
import type { CollapsedRow, LogLevel } from '../types'
import { LEVEL_SHORT } from '../types'

interface LogListProps {
  rows: CollapsedRow[]
  selectedId: number | null
  query: string
  regex: boolean
  caseSensitive: boolean
  onSelect: (id: number) => void
}

export function LogList({
  rows,
  selectedId,
  query,
  regex,
  caseSensitive,
  onSelect,
}: LogListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 16,
  })

  const selectedIndex = selectedId == null ? -1 : rows.findIndex((r) => r.entry.id === selectedId)

  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  return (
    <div ref={parentRef} className="log-list" role="listbox" aria-label="日志列表">
      {rows.length === 0 ? (
        <div className="log-empty-filter">没有匹配的日志，试试放宽过滤条件。</div>
      ) : (
        <div className="log-virtual" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            const { entry, count } = row
            const selected = entry.id === selectedId
            return (
              <button
                key={row.key + String(item.index)}
                type="button"
                role="option"
                aria-selected={selected}
                className={`log-row level-${entry.level}${selected ? ' selected' : ''}${item.index % 2 ? ' alt' : ''}`}
                style={{
                  top: 0,
                  transform: `translateY(${item.start}px)`,
                }}
                onClick={() => onSelect(entry.id)}
              >
                <span className={`lvl lvl-${entry.level}`} title={entry.level}>
                  {LEVEL_SHORT[entry.level as LogLevel]}
                </span>
                <span className="log-time">{entry.timestamp || '—'}</span>
                <span className={`log-tag${entry.tag ? '' : ' dim'}`}>{entry.tag || '—'}</span>
                <span className="log-msg">
                  {highlightText(entry.message, query, regex, caseSensitive)}
                </span>
                {count > 1 && <span className="log-count">{count}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
