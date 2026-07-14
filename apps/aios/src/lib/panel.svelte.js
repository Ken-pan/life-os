/**
 * 侧栏预览面板(Artifacts/Canvas + 内建阅读器 + 文件查看)。
 * kind:
 *  - 'artifact' HTML/SVG 实时渲染(沙盒 iframe)+ 代码视图
 *  - 'code'     纯代码查看
 *  - 'url'      内建阅读器(阅读模式正文,可外部打开)
 *  - 'file'     附件文件内容
 */

export const P = $state({
  open: false,
  /** @type {'artifact'|'code'|'url'|'file'|'image'|null} */
  kind: null,
  title: '',
  lang: '',
  code: '',
  url: '',
  /** 阅读器/文件正文(url 模式为空时由面板自行抓取) */
  text: '',
  name: '',
  /** 文件附件的格式类别(pdf/docx/xlsx/audio/csv/json/text…) */
  fileKind: '',
  /** 会话级原始 blob(PDF 原生查看器 / 音频播放器) */
  blobId: '',
  /** artifact 视图:'preview' | 'code'(code 视图对 artifact 可编辑) */
  view: 'preview',
  /** 可编辑 canvas:编辑覆盖的稳定键(原始代码 hash) */
  canvasKey: '',
  /** canvas 原始代码(用于「重置」) */
  canvasOriginal: '',
  /** 当前 canvas 是否已被编辑并持久化 */
  canvasEdited: false,
  /** 生成图的定位信息(供「上传到云端」按需同步);null = 非本地生成图或无法上传 */
  imageRef: /** @type {null | { conversationId: string, tcId: string, index: number, cloudPath: string|null, dataUrl: string }} */ (
    null
  ),
})

/* —— 可编辑 Canvas:编辑覆盖持久化(按原始代码 hash 键,重开恢复) —— */

const CANVAS_KEY = 'aios_canvas_v1'

/** djb2 字符串 hash,做编辑覆盖的稳定键 */
function hashCode(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return `c${(h >>> 0).toString(36)}`
}

function loadCanvasEdits() {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CANVAS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function saveCanvasEdits(map) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CANVAS_KEY, JSON.stringify(map))
  } catch {
    /* 存不下不影响本次编辑 */
  }
}

/** 把当前 canvas 的编辑存起来(按原始 key) */
export function saveCanvasEdit() {
  if (P.kind !== 'artifact' || !P.canvasKey) return
  const map = loadCanvasEdits()
  map[P.canvasKey] = P.code
  saveCanvasEdits(map)
  P.canvasEdited = true
}

/** 撤销编辑,恢复原始代码 */
export function resetCanvas() {
  if (P.kind !== 'artifact' || !P.canvasKey) return
  const map = loadCanvasEdits()
  delete map[P.canvasKey]
  saveCanvasEdits(map)
  P.code = P.canvasOriginal
  P.canvasEdited = false
}

export function openArtifact({ lang, code, title }) {
  const canvasKey = hashCode(code)
  const edits = loadCanvasEdits()
  const edited = Object.prototype.hasOwnProperty.call(edits, canvasKey)
  Object.assign(P, {
    open: true,
    kind: 'artifact',
    lang,
    code: edited ? edits[canvasKey] : code,
    canvasKey,
    canvasOriginal: code,
    canvasEdited: edited,
    title: title || lang.toUpperCase(),
    view: 'preview',
    url: '',
    text: '',
    name: '',
    fileKind: '',
    blobId: '',
  })
}

export function openCode({ lang, code, title }) {
  Object.assign(P, {
    open: true,
    kind: 'code',
    lang,
    code,
    title: title || lang || 'code',
    view: 'code',
    url: '',
    text: '',
    name: '',
    fileKind: '',
    blobId: '',
  })
}

export function openUrl(url, text = '') {
  let title = url
  try {
    title = new URL(url).hostname
  } catch {
    /* keep raw */
  }
  Object.assign(P, {
    open: true,
    kind: 'url',
    url,
    text,
    title,
    lang: '',
    code: '',
    name: '',
    fileKind: '',
    blobId: '',
    view: 'preview',
  })
}

export function openFile({ name, text, kind = 'text', blobId = '' }) {
  Object.assign(P, {
    open: true,
    kind: 'file',
    name,
    text,
    title: name,
    fileKind: kind,
    blobId,
    lang: '',
    code: '',
    url: '',
    view: 'preview',
  })
}

/** 查看生成的图片(src 为 data URL 或 http URL);imageRef 给按需云同步用 */
export function openImage({ src, title, imageRef = null }) {
  Object.assign(P, {
    open: true,
    kind: 'image',
    url: src,
    title: title || 'AI Image',
    lang: '',
    code: '',
    text: '',
    name: '',
    fileKind: '',
    blobId: '',
    view: 'preview',
    imageRef,
  })
}

export function closePanel() {
  P.open = false
}
