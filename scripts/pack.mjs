import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distHtml = resolve(root, 'dist/index.html')
const outDir = resolve(root, '便携版')

if (!existsSync(distHtml)) {
  console.error('未找到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
copyFileSync(distHtml, resolve(outDir, 'LogFitter.html'))
writeFileSync(
  resolve(outDir, '双击打开.bat'),
  ['@echo off', 'cd /d "%~dp0"', 'start "" "LogFitter.html"', ''].join('\r\n'),
  'utf8',
)

console.log('已生成可双击运行的文件：')
console.log('  便携版\\LogFitter.html')
console.log('  便携版\\双击打开.bat')
