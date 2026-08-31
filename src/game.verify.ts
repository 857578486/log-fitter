import { readFileSync } from 'node:fs'
import { parseLogText, detectFormat } from './parser.ts'

const text = readFileSync(new URL('../public/sample-game.log', import.meta.url), 'utf8')
const entries = parseLogText(text, 'sample-game.log')
const errors: string[] = []
const expect = (cond: unknown, msg: string) => {
  if (!cond) errors.push(msg)
}

expect(detectFormat(text).includes('自定义'), `format=${detectFormat(text)}`)
expect(entries.length >= 8, `too few: ${entries.length}`)
expect(entries[0]?.tag === 'Session', `first tag ${entries[0]?.tag}`)
expect(
  entries.some((e) => e.message.includes('onNetMessage') && e.tag === 'onNetMessage'),
  'missing onNetMessage tag',
)
expect(
  entries.some((e) => e.tag === '如意牌机制' && e.raw.includes('stack traceback')),
  '如意牌机制 should keep stack',
)
expect(
  entries.some((e) => e.tag === '合牌' && e.sourceFile.includes('PokerDataMgr')),
  '合牌 should parse lua source',
)
expect(
  !entries.some((e) => e.message.includes('stack traceback')),
  'traceback should not be its own message-only entry start',
)

if (errors.length) {
  console.error(entries.map((e) => `${e.level} [${e.tag}] ${e.message.slice(0, 80)}`).join('\n'))
  throw new Error(errors.join('\n'))
}

console.log(`game sample ok: ${entries.length} entries`)
console.log(
  entries
    .slice(0, 12)
    .map((e) => `${e.timestamp} [${e.tag}] ${e.message.slice(0, 70)}`)
    .join('\n'),
)
