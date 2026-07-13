import { transcribe } from '$lib/localai.js'

/**
 * 文件导入管线:全部在本机解析,按格式抽取文本供模型阅读。
 *
 * - pdf          pdf.js 抽文本层;无文本层(扫描件)→ 渲染页面图走 VLM
 * - docx/pptx/xlsx/epub  OOXML/EPUB 即 zip+XML:fflate 解压 + DOMParser 抽取
 * - 音频          本地网关 Qwen3-ASR 转写
 * - rtf           控制字剥离
 * - 文本家族      直接读取
 *
 * 返回 ImportedFile;原始 Blob 存会话级内存(blobId),供面板原生预览
 * (PDF 查看器 / 音频播放器),不进 localStorage。
 *
 * @typedef {{
 *   name: string,
 *   size: number,
 *   text: string,
 *   kind: 'text'|'pdf'|'docx'|'pptx'|'xlsx'|'epub'|'audio'|'csv'|'json',
 *   blobId?: string,
 *   pageImages?: string[],
 * }} ImportedFile
 */

const MAX_TEXT = 200000

/* —— 会话级 blob 存储(刷新即失,面板降级为文本视图)—— */
const blobs = new Map()
export function putBlob(blob) {
  const id = crypto.randomUUID()
  blobs.set(id, blob)
  return id
}
export function getBlob(id) {
  return blobs.get(id) ?? null
}

export const TEXT_FILE_RE =
  /\.(txt|md|markdown|json|jsonl|csv|tsv|ya?ml|toml|xml|html?|css|js|mjs|ts|jsx|tsx|svelte|vue|py|rb|go|rs|swift|kt|java|c|h|cpp|hpp|sh|zsh|sql|log|ini|conf|env|svg|rtf)$/i

export const AUDIO_FILE_RE = /\.(mp3|m4a|wav|webm|ogg|flac|aac|opus)$/i

export const DOC_FILE_RE = /\.(pdf|docx|pptx|xlsx|epub)$/i

export const IMPORT_ACCEPT =
  'image/*,text/*,audio/*,.pdf,.docx,.pptx,.xlsx,.epub,' +
  '.txt,.md,.markdown,.json,.jsonl,.csv,.tsv,.yaml,.yml,.toml,.xml,.html,.htm,.css,' +
  '.js,.mjs,.ts,.jsx,.tsx,.svelte,.vue,.py,.rb,.go,.rs,.swift,.kt,.java,.c,.h,.cpp,.hpp,' +
  '.sh,.zsh,.sql,.log,.ini,.conf,.svg,.rtf,.mp3,.m4a,.wav,.ogg,.flac,.aac,.opus'

function ext(name) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function clip(text) {
  const t = text.replaceAll(/\n{3,}/g, '\n\n').trim()
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}\n…(已截断)` : t
}

/* —— PDF —— */

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

async function importPdf(file) {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pageCount = Math.min(doc.numPages, 100)
  const parts = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => item.str)
      .join(' ')
      .trim()
    if (text) parts.push(`【第 ${i} 页】\n${text}`)
    if (parts.join('').length > MAX_TEXT) break
  }
  let pageImages
  // 仅当几乎完全抽不到文本(扫描件)时才走页面图 → 视觉模型
  if (parts.join('').replaceAll(/【第 \d+ 页】/g, '').trim().length < 40) {
    // 无文本层(扫描件):渲染前几页为图,交给视觉模型
    pageImages = []
    for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      pageImages.push(canvas.toDataURL('image/jpeg', 0.85))
    }
  }
  const note = doc.numPages > pageCount ? `\n…(共 ${doc.numPages} 页,已截取前 ${pageCount} 页)` : ''
  return {
    text: clip(parts.join('\n\n') + note),
    kind: 'pdf',
    blobId: putBlob(file),
    pageImages,
  }
}

/* —— OOXML / EPUB(zip + XML)—— */

async function unzip(file) {
  const { unzipSync } = await import('fflate')
  return unzipSync(new Uint8Array(await file.arrayBuffer()))
}

const utf8 = new TextDecoder()

function parseXml(bytes) {
  return new DOMParser().parseFromString(utf8.decode(bytes), 'text/xml')
}

async function importDocx(file) {
  const files = await unzip(file)
  const doc = parseXml(files['word/document.xml'])
  const paragraphs = [...doc.getElementsByTagName('w:p')].map((p) =>
    [...p.getElementsByTagName('w:t')].map((t) => t.textContent).join(''),
  )
  return { text: clip(paragraphs.join('\n')), kind: 'docx' }
}

async function importPptx(file) {
  const files = await unzip(file)
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  const slides = slideNames.map((name, i) => {
    const doc = parseXml(files[name])
    const texts = [...doc.getElementsByTagName('a:t')].map((t) => t.textContent)
    return `【Slide ${i + 1}】\n${texts.join('\n')}`
  })
  return { text: clip(slides.join('\n\n')), kind: 'pptx' }
}

/** 列引用 "BC12" → 列号 */
function colIndex(ref) {
  let n = 0
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64)
    else break
  }
  return n - 1
}

async function importXlsx(file) {
  const files = await unzip(file)
  const shared = files['xl/sharedStrings.xml']
    ? [...parseXml(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map((si) =>
        [...si.getElementsByTagName('t')].map((t) => t.textContent).join(''),
      )
    : []
  const workbook = files['xl/workbook.xml'] ? parseXml(files['xl/workbook.xml']) : null
  const sheetNames = workbook
    ? [...workbook.getElementsByTagName('sheet')].map((s) => s.getAttribute('name'))
    : []
  const sheetFiles = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .slice(0, 5)

  const sheets = sheetFiles.map((name, si) => {
    const doc = parseXml(files[name])
    const rows = [...doc.getElementsByTagName('row')].slice(0, 500).map((row) => {
      const cells = []
      for (const c of row.getElementsByTagName('c')) {
        const idx = colIndex(c.getAttribute('r') ?? '')
        const type = c.getAttribute('t')
        let value = ''
        if (type === 's') {
          value = shared[Number(c.getElementsByTagName('v')[0]?.textContent ?? -1)] ?? ''
        } else if (type === 'inlineStr') {
          value = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('')
        } else {
          value = c.getElementsByTagName('v')[0]?.textContent ?? ''
        }
        if (idx >= 0 && idx < 64) cells[idx] = value
      }
      return [...cells].map((v) => v ?? '').join('\t')
    })
    const title = sheetNames[si] ? `【工作表:${sheetNames[si]}】` : `【工作表 ${si + 1}】`
    return `${title}\n${rows.filter((r) => r.trim()).join('\n')}`
  })
  return { text: clip(sheets.join('\n\n')), kind: 'xlsx' }
}

async function importEpub(file) {
  const files = await unzip(file)
  const container = parseXml(files['META-INF/container.xml'])
  const opfPath = container
    .getElementsByTagName('rootfile')[0]
    ?.getAttribute('full-path')
  if (!opfPath || !files[opfPath]) throw new Error('EPUB 结构异常')
  const opf = parseXml(files[opfPath])
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const manifest = new Map(
    [...opf.getElementsByTagName('item')].map((i) => [
      i.getAttribute('id'),
      i.getAttribute('href'),
    ]),
  )
  const chapters = []
  for (const ref of opf.getElementsByTagName('itemref')) {
    const href = manifest.get(ref.getAttribute('idref'))
    const path = base + (href ?? '')
    if (!files[path] || !/x?html?$/i.test(path)) continue
    const doc = new DOMParser().parseFromString(utf8.decode(files[path]), 'text/html')
    doc.querySelectorAll('script, style').forEach((el) => el.remove())
    const text = doc.body?.textContent?.replaceAll(/[ \t]+/g, ' ').trim()
    if (text) chapters.push(text)
    if (chapters.join('').length > MAX_TEXT) break
  }
  return { text: clip(chapters.join('\n\n---\n\n')), kind: 'epub' }
}

/* —— 其他 —— */

function stripRtf(rtf) {
  return rtf
    .replaceAll(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replaceAll(/\\par[d]?\b/g, '\n')
    .replaceAll(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replaceAll(/[{}]/g, '')
    .trim()
}

async function importAudio(file) {
  const text = await transcribe(file)
  return {
    text: text || '(未识别到语音内容)',
    kind: 'audio',
    blobId: putBlob(file),
  }
}

/**
 * 导入一个文件 → ImportedFile。不认识的格式返回 null。
 * @param {File} file
 * @returns {Promise<ImportedFile | null>}
 */
export async function importFile(file) {
  const e = ext(file.name)
  const base = { name: file.name, size: file.size }

  if (e === 'pdf' || file.type === 'application/pdf') {
    return { ...base, ...(await importPdf(file)) }
  }
  if (e === 'docx') return { ...base, ...(await importDocx(file)) }
  if (e === 'pptx') return { ...base, ...(await importPptx(file)) }
  if (e === 'xlsx') return { ...base, ...(await importXlsx(file)) }
  if (e === 'epub') return { ...base, ...(await importEpub(file)) }
  if (AUDIO_FILE_RE.test(file.name) || file.type.startsWith('audio/')) {
    return { ...base, ...(await importAudio(file)) }
  }
  if (e === 'rtf') {
    return { ...base, text: clip(stripRtf(await file.text())), kind: 'text' }
  }
  if (file.type.startsWith('text/') || TEXT_FILE_RE.test(file.name)) {
    const kind = e === 'csv' || e === 'tsv' ? 'csv' : e === 'json' || e === 'jsonl' ? 'json' : 'text'
    return { ...base, text: clip(await file.text()), kind }
  }
  return null
}
