import { parseLogText } from './parser.ts'

const sample = `Hello from GameStart
UnityEngine.Debug:Log(Object)

(Filename: Assets/Scripts/GameStart.cs Line: 24)

Missing sprite: icon_gold
UnityEngine.Debug:LogWarning(Object)

(Filename: Assets/Scripts/UI/BagView.cs Line: 88)

NullReferenceException: Object reference not set to an instance of an object
GameManager.Update () (at Assets/Scripts/GameManager.cs:45)
UnityEngine.Debug:LogException(Exception)

[2026-08-31 18:00:01.120] [INFO] [Boot] Game starting
08-31 18:00:04.012  2144  2168 I Unity   : [Audio] BGM fade in
`

const entries = parseLogText(sample, 'verify.log')
const errors: string[] = []

const expect = (
  cond: unknown,
  message: string,
) => {
  if (!cond) errors.push(message)
}

expect(entries.length === 5, `expected 5 entries, got ${entries.length}`)
expect(entries[0]?.level === 'info', `entry0 level ${entries[0]?.level}`)
expect(entries[0]?.sourceFile.includes('GameStart.cs'), `entry0 source ${entries[0]?.sourceFile}`)
expect(entries[1]?.level === 'warning', `entry1 level ${entries[1]?.level}`)
expect(entries[2]?.level === 'error', `entry2 level ${entries[2]?.level}`)
expect(entries[3]?.tag === 'Boot', `entry3 tag ${entries[3]?.tag}`)
expect(entries[4]?.tag === 'Audio' || entries[4]?.message.includes('BGM'), `entry4 ${entries[4]?.tag} ${entries[4]?.message}`)

if (errors.length) {
  console.error(entries)
  throw new Error(errors.join('\n'))
}

console.log(`parser ok: ${entries.length} entries`)
