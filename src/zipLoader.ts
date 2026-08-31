import JSZip from 'jszip'

export interface LogChunk {
  name: string
  text: string
}

const LOG_NAME_RE = /\.(log|txt|text)$/i

function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  )
}

function decodeBytes(data: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(data)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gb18030').decode(data)
  } catch {
    return utf8
  }
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

async function readPlainFile(file: File): Promise<LogChunk> {
  const buf = new Uint8Array(await file.arrayBuffer())
  return { name: file.name, text: decodeBytes(buf) }
}

async function readZipFile(file: File): Promise<LogChunk[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && LOG_NAME_RE.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  if (!entries.length) {
    throw new Error(`压缩包里没有找到 .log / .txt：${file.name}`)
  }

  const chunks: LogChunk[] = []
  for (const entry of entries) {
    const data = await entry.async('uint8array')
    chunks.push({
      name: `${file.name.replace(/\.zip$/i, '')}/${baseName(entry.name)}`,
      text: decodeBytes(data),
    })
  }
  return chunks
}

/** 把用户拖入/选择的文件展开成可解析的日志文本块（支持 zip） */
export async function loadLogChunks(files: FileList | File[]): Promise<LogChunk[]> {
  const list = [...files]
  const chunks: LogChunk[] = []
  for (const file of list) {
    if (isZipFile(file)) {
      chunks.push(...(await readZipFile(file)))
    } else {
      chunks.push(await readPlainFile(file))
    }
  }
  return chunks
}
