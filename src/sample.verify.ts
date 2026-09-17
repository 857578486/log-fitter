import { readFileSync } from 'node:fs'
import { applyFilter } from './filter.ts'
import { detectFormat, parseLogText } from './parser.ts'

const text = readFileSync(new URL('../public/sample-unity.log', import.meta.url), 'utf8')
const entries = parseLogText(text, 'sample-unity.log')
const errors: string[] = []
const expect = (cond: unknown, message: string) => {
  if (!cond) errors.push(message)
}

expect(detectFormat(text) === 'Unity Player / Editor.log', `format ${detectFormat(text)}`)
expect(entries.length >= 21, `too few entries: ${entries.length}`)
expect(
  entries.some((e) => e.message === 'Hello from GameStart' && e.level === 'info'),
  'missing Debug.Log Hello from GameStart',
)
expect(
  entries.some((e) => e.level === 'info' && e.tag === 'Network' && e.message.includes('Connected')),
  'Network Connected should stay info',
)
expect(
  entries.some((e) => e.level === 'warning' && e.sourceFile.includes('BagView.cs')),
  'missing Unity warning with BagView.cs',
)
expect(
  entries.some((e) => e.level === 'error' && e.message.includes('NullReferenceException')),
  'missing NRE',
)
expect(
  entries.some((e) => e.tag === 'Network' && e.message.includes('Connected')),
  'missing Network tag',
)
expect(
  entries.filter((e) => e.message.includes('Tick failed')).length === 3,
  'expected 3 Tick failed logs',
)

const collapsed = applyFilter(entries, {
  levels: { verbose: true, debug: true, info: true, warning: true, error: true },
  query: 'Tick failed',
  regex: false,
  caseSensitive: false,
  invert: false,
  tag: 'all',
  fileName: 'all',
  collapse: true,
  timeFromMs: null,
  timeToMs: null,
})
expect(collapsed.matchedCount === 3, `filter count ${collapsed.matchedCount}`)
expect(collapsed.rows.length === 1 && collapsed.rows[0].count === 3, 'collapse failed')

const onlyErrors = applyFilter(entries, {
  levels: { verbose: false, debug: false, info: false, warning: false, error: true },
  query: '',
  regex: false,
  caseSensitive: false,
  invert: false,
  tag: 'all',
  fileName: 'all',
  collapse: false,
  timeFromMs: null,
  timeToMs: null,
})
expect(onlyErrors.rows.every((r) => r.entry.level === 'error'), 'level filter leaked')
expect(onlyErrors.rows.length > 0, 'no errors found')

if (errors.length) {
  console.error(entries.map((e) => `${e.level} [${e.tag}] ${e.message}`).join('\n'))
  throw new Error(errors.join('\n'))
}

console.log(`sample ok: ${entries.length} entries`)
console.log(entries.map((e) => `${e.level.padEnd(7)} ${(e.tag || '-').padEnd(10)} ${e.message}`).join('\n'))
