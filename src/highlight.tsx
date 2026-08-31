import type { ReactNode } from 'react'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightText(
  text: string,
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): ReactNode {
  const q = query.trim()
  if (!q) return text

  let re: RegExp
  try {
    re = new RegExp(regex ? q : escapeRegExp(q), caseSensitive ? 'g' : 'gi')
  } catch {
    return text
  }

  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let guard = 0
  while ((match = re.exec(text)) && guard < 80) {
    guard += 1
    if (match[0] === '') {
      re.lastIndex += 1
      continue
    }
    if (match.index > last) nodes.push(text.slice(last, match.index))
    nodes.push(
      <mark key={`${match.index}-${guard}`} className="hl">
        {match[0]}
      </mark>,
    )
    last = match.index + match[0].length
  }
  if (last === 0) return text
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
