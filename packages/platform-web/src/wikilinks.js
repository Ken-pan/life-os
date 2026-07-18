/**
 * Wikilink 解析（跨 OS 引用的共享底座，零依赖纯函数、无浏览器依赖）。
 *
 * `[[目标]]` / `[[目标|显示名]]` / `[[目标#锚点]]` —— Obsidian 语法。
 * KnowledgeOS 正文与 Planner 任务备注共用这套解析：一处写、多处引用同一条笔记。
 *
 * 纯 leaf 模块：node 可直测（KnowledgeOS 单测锁 extractWikilinks），
 * 不 import 任何 Svelte / 浏览器 API。
 */

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

/** 拆一个 `[[目标|显示]]` 内文为 { target, label }（去 #锚点、去首尾空白）。 */
function splitInner(inner) {
  const [rawTarget, rawLabel] = inner.split('|')
  const target = rawTarget.split('#')[0].trim()
  const label = (rawLabel ?? rawTarget).trim()
  return { target, label }
}

/**
 * 抽出文本里所有 wikilink 目标（去 |显示名、去 #锚点），**去重**、保序。
 * @param {string} text
 * @returns {string[]}
 */
export function extractWikilinks(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(WIKILINK_RE)) {
    const { target } = splitInner(m[1])
    if (target) out.push(target)
  }
  return [...new Set(out)]
}

/**
 * 抽出 wikilink 为 { target, label } 列表（按 target 去重、保序）。
 * 供 UI 渲染引用 chip：显示 label、跳转按 target。
 * @param {string} text
 * @returns {{ target: string, label: string }[]}
 */
export function parseWikilinks(text) {
  const seen = new Set()
  const out = []
  for (const m of String(text ?? '').matchAll(WIKILINK_RE)) {
    const { target, label } = splitInner(m[1])
    if (!target || seen.has(target)) continue
    seen.add(target)
    out.push({ target, label })
  }
  return out
}

/**
 * 构造 KnowledgeOS「按标题打开笔记」深链：`<origin>/library?title=<编码目标>`。
 * origin 由调用方从 `@life-os/theme` 的 LIFE_OS_APP_ORIGINS.knowledge 传入。
 * @param {string} target 笔记标题
 * @param {string} origin KnowledgeOS 源（含协议，无尾斜杠）
 * @returns {string}
 */
export function knowledgeNoteUrl(target, origin) {
  const base = String(origin || '').replace(/\/$/, '')
  return `${base}/library?title=${encodeURIComponent(String(target ?? '').trim())}`
}

/** 原生 KnowledgeOS（Tauri）自定义 URL scheme；需安装/重建壳后系统才会登记。 */
export const KNOWLEDGE_NATIVE_SCHEME = 'knowledgeos'

/**
 * 原生深链：`knowledgeos://open?title=<编码目标>`。
 * 与 web `/library?title=` 语义对齐；壳内解析后 `goto` 同一路由。
 * @param {string} target 笔记标题
 * @returns {string}
 */
export function knowledgeNativeNoteUrl(target) {
  return `${KNOWLEDGE_NATIVE_SCHEME}://open?title=${encodeURIComponent(String(target ?? '').trim())}`
}

/**
 * 把 `knowledgeos://…` 深链转成 Knowledge 前端路径（`/library?…`）。
 * 无法识别时返回 null。
 * @param {string} raw
 * @returns {string | null}
 */
export function knowledgePathFromNativeUrl(raw) {
  let u
  try {
    u = new URL(String(raw || ''))
  } catch {
    return null
  }
  if (u.protocol !== `${KNOWLEDGE_NATIVE_SCHEME}:`) return null
  const title = u.searchParams.get('title')
  if (title) return `/library?title=${encodeURIComponent(title)}`
  const note = u.searchParams.get('note')
  if (note) return `/library?note=${encodeURIComponent(note)}`
  const host = (u.hostname || '').toLowerCase()
  if (host === 'library' || host === 'open') return '/library'
  return '/library'
}
