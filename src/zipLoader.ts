import JSZip from 'jszip'

export interface LogChunk {
  name: string
  text: string
}

export interface LoadProgress {
  phase: 'reading' | 'unzip' | 'file'
  current: number
  total: number
  label: string
}

const LOG_NAME_RE = /\.(log|txt|text)$/i

function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.type === 'application/x-zip'
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

/** 展示名：去掉路径，并把 Windows 不允许的 `:` 换成 `_` */
export function displayLogName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  const base = parts[parts.length - 1] || path
  return base.replace(/:/g, '_')
}

function sortLogNames(a: string, b: string): number {
  return displayLogName(a).localeCompare(displayLogName(b), 'en', { numeric: true })
}

async function readPlainFile(file: File): Promise<LogChunk> {
  const buf = new Uint8Array(await file.arrayBuffer())
  return { name: displayLogName(file.name), text: decodeBytes(buf) }
}

async function readZipFile(
  file: File,
  onProgress?: (p: LoadProgress) => void,
): Promise<LogChunk[]> {
  onProgress?.({ phase: 'unzip', current: 0, total: 1, label: file.name })
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { createFolders: true })

  const zipEntries: { path: string; entry: JSZip.JSZipObject }[] = []
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    if (!LOG_NAME_RE.test(relativePath)) return
    zipEntries.push({ path: relativePath, entry })
  })
  zipEntries.sort((a, b) => sortLogNames(a.path, b.path))

  if (!zipEntries.length) {
    throw new Error(`压缩包里没有找到 .log / .txt：${file.name}`)
  }

  const prefix = file.name.replace(/\.zip$/i, '')
  const chunks: LogChunk[] = []
  const errors: string[] = []

  for (let i = 0; i < zipEntries.length; i++) {
    const { path, entry } = zipEntries[i]
    onProgress?.({
      phase: 'file',
      current: i + 1,
      total: zipEntries.length,
      label: displayLogName(path),
    })
    try {
      const data = await entry.async('uint8array')
      chunks.push({
        name: `${prefix}/${displayLogName(path)}`,
        text: decodeBytes(data),
      })
    } catch (err) {
      errors.push(`${displayLogName(path)}: ${err instanceof Error ? err.message : String(err)}`)
    }
    await new Promise((r) => setTimeout(r, 0))
  }

  if (!chunks.length) {
    throw new Error(`压缩包解压失败：${errors.join('; ') || file.name}`)
  }
  if (errors.length) {
    console.warn('[log_fitter] 部分日志未能解压', errors)
  }
  return chunks
}

/**
 * 从拖放事件收集文件。
 * 必须在 drop 回调里同步调用（或至少同步 snapshot files / getAsEntry），
 * 否则浏览器会清空 DataTransfer，表现为「拖进去没反应」。
 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  // 同步快照：异步之后 dt.files 可能变成空
  const immediate = [...dt.files]

  const items = dt.items
  let hasDirectory = false
  const topEntries: FileSystemEntry[] = []

  if (items?.length && typeof items[0]?.webkitGetAsEntry === 'function') {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.() ?? null
      if (!entry) continue
      topEntries.push(entry)
      if (entry.isDirectory) hasDirectory = true
    }
  }

  // 普通拖 zip / log：直接用 FileList，最稳
  if (!hasDirectory && immediate.length) return immediate

  // 拖的是文件夹：递归展开
  if (!topEntries.length) return immediate

  const out: File[] = []

  const readEntry = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        ;(entry as FileSystemFileEntry).file(resolve, () => resolve(null))
      })
      if (file) out.push(file)
      return
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const readBatch = async (): Promise<void> => {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries(resolve, () => resolve([]))
        })
        if (!batch.length) return
        for (const child of batch) await readEntry(child)
        await readBatch()
      }
      await readBatch()
    }
  }

  for (const entry of topEntries) await readEntry(entry)

  const filtered = out.filter((f) => LOG_NAME_RE.test(f.name) || isZipFile(f))
  if (filtered.length) return filtered
  if (out.length) return out
  return immediate
}

/** 把用户拖入/选择的文件展开成可解析的日志文本块（支持 zip / 文件夹） */
export async function loadLogChunks(
  files: FileList | File[],
  onProgress?: (p: LoadProgress) => void,
): Promise<LogChunk[]> {
  const list = [...files]
  const chunks: LogChunk[] = []

  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    onProgress?.({
      phase: 'reading',
      current: i + 1,
      total: list.length,
      label: file.name,
    })
    if (isZipFile(file)) {
      chunks.push(...(await readZipFile(file, onProgress)))
    } else if (LOG_NAME_RE.test(file.name) || list.length === 1) {
      chunks.push(await readPlainFile(file))
    }
  }

  chunks.sort((a, b) => sortLogNames(a.name, b.name))
  return chunks
}
