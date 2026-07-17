/**
 * 块模型 ⇄ Markdown（零依赖纯函数，KnowledgeOS 块状编辑器的骨架）。
 *
 * 编辑器内存里是「块数组」，每块独立可编辑；落盘/读取始终是干净 Markdown，
 * 守住「.md 文件 = 数据库」契约（Obsidian / PaperOS 互通的基础）。
 *
 * Block: { id, type, text, depth, meta }
 *   type   'paragraph' | 'heading' | 'bullet' | 'numbered' | 'todo'
 *          | 'quote' | 'code' | 'divider'
 *   text   块内的「行内 Markdown」原文（code 块为原始代码，可多行）
 *   depth  列表缩进层级（0 起），仅 bullet/numbered/todo 有意义
 *   meta   heading→{level:1..6}；todo→{checked};  code→{lang}; numbered→{start}
 *
 * 设计约束：markdownToBlocks(blocksToMarkdown(x)) 结构稳定（往返不漂移），
 * 这是数据完整性护栏，被 knowledge-unit.mjs 锁死。
 */
import { inlineToPlainText } from './inline.js'

let _seq = 0
/** 生成块 id（仅运行期用于 keyed each / 光标定位；往返比对不看 id）。 */
export function newBlockId() {
  _seq += 1
  return `b${_seq}_${Math.round((typeof performance !== 'undefined' ? performance.now() : _seq) * 1000) % 1e6}`
}

/** 造一个块（补默认字段）。 */
export function makeBlock(type = 'paragraph', text = '', extra = {}) {
  return { id: newBlockId(), type, text, depth: 0, meta: {}, ...extra }
}

const INDENT_UNIT = 2 // 每级列表缩进的空格数（序列化用）

const CALLOUT_TYPES = new Set(['note', 'info', 'tip', 'warning', 'danger'])
/** 归一化 callout 类型（未知 → note）。 */
function calloutType(raw) {
  const t = String(raw).toLowerCase()
  if (t === 'success' || t === 'check') return 'tip'
  if (t === 'important' || t === 'hint') return 'note'
  if (t === 'caution' || t === 'attention') return 'warning'
  if (t === 'error' || t === 'failure' || t === 'bug') return 'danger'
  return CALLOUT_TYPES.has(t) ? t : 'note'
}

/** 拆一行 GFM 表格为单元格数组（去外围竖线、按未转义 | 分列、还原 \| ）。 */
function splitTableRow(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}
/** 分隔行 → 每列对齐（:--=left, :-:=center, --:=right, 其余 null）。 */
function parseTableAlign(sep) {
  return splitTableRow(sep).map((c) => {
    const s = c.trim()
    const l = s.startsWith(':')
    const r = s.endsWith(':')
    if (l && r) return 'center'
    if (r) return 'right'
    if (l) return 'left'
    return null
  })
}
/** 是否为 GFM 表格分隔行（含 - 且只由 |:- 空白组成）。 */
function isTableSeparator(line) {
  return /-/.test(line) && /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /\|/.test(line)
}

/** 前导空白 → 缩进层级（tab 记 2 空格；向下取整）。 */
function leadingDepth(prefix) {
  const spaces = prefix.replace(/\t/g, '  ').length
  return Math.floor(spaces / INDENT_UNIT)
}

/**
 * Markdown → 块数组。逐行状态机，与阅读渲染器同源的块识别规则。
 * @param {string} src
 * @returns {Array} blocks
 */
export function markdownToBlocks(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 代码块 ```lang … ```
    const fence = line.match(/^(\s*)```(\S*)\s*$/)
    if (fence) {
      const body = []
      i += 1
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // 跳过收尾 fence
      blocks.push(makeBlock('code', body.join('\n'), { meta: { lang: fence[2] || '' } }))
      continue
    }

    // GFM 表格：当前行是 |…| 且下一行是分隔行
    if (
      /^\s*\|.*\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = splitTableRow(line)
      const align = parseTableAlign(lines[i + 1])
      const rows = [header]
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      const cols = header.length
      const norm = rows.map((r) => {
        const c = r.slice(0, cols)
        while (c.length < cols) c.push('')
        return c
      })
      const alignN = Array.from({ length: cols }, (_, c) => align[c] ?? null)
      blocks.push(makeBlock('table', '', { meta: { rows: norm, align: alignN } }))
      continue
    }

    // 标题 #..######
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push(makeBlock('heading', heading[2].trim(), { meta: { level: heading[1].length } }))
      i += 1
      continue
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(makeBlock('divider', ''))
      i += 1
      continue
    }

    // Callout 高亮块（Obsidian 语法 > [!type] …）—— 必须先于普通引用判定。
    // 后续连续的 > 行（非新 callout）并入其正文；编辑器里按单行处理，多行导入合成一行。
    const callout = line.match(/^\s*>\s*\[!(\w+)\][+-]?\s?(.*)$/)
    if (callout) {
      const body = callout[2] ? [callout[2]] : []
      i += 1
      while (i < lines.length && /^\s*>\s?/.test(lines[i]) && !/^\s*>\s*\[!/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push(makeBlock('callout', body.join(' ').trim(), { meta: { callout: calloutType(callout[1]) } }))
      continue
    }

    // 引用（每行一块，贴近 Notion 的块粒度；往返稳定）
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      blocks.push(makeBlock('quote', quote[1]))
      i += 1
      continue
    }

    // 待办 - [ ] / - [x]
    const todo = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (todo) {
      blocks.push(
        makeBlock('todo', todo[3], {
          depth: leadingDepth(todo[1]),
          meta: { checked: todo[2] !== ' ' },
        }),
      )
      i += 1
      continue
    }

    // 无序列表
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/)
    if (bullet) {
      blocks.push(makeBlock('bullet', bullet[2], { depth: leadingDepth(bullet[1]) }))
      i += 1
      continue
    }

    // 有序列表
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
    if (numbered) {
      blocks.push(
        makeBlock('numbered', numbered[3], {
          depth: leadingDepth(numbered[1]),
          meta: { start: Number(numbered[2]) },
        }),
      )
      i += 1
      continue
    }

    // 空行 → 块分隔
    if (line.trim() === '') {
      i += 1
      continue
    }

    // 段落：合并连续「非块级」行为一块（软换行保留为 \n）
    const para = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isBlockStart(lines[i])
    ) {
      para.push(lines[i])
      i += 1
    }
    blocks.push(makeBlock('paragraph', para.join('\n')))
  }

  if (blocks.length === 0) blocks.push(makeBlock('paragraph', ''))
  return blocks
}

/**
 * 正文 Markdown → 纯文本摘要（去块级 # / - / > 等前缀 + 去行内 ** ` [[]] 等标记）。
 * 列表预览 / 相关笔记摘要专用：绝不能让用户看见裸 markdown 符号。
 * @param {string} markdown
 * @param {number} len 摘要最大字符数
 */
export function plainExcerpt(markdown, len = 140) {
  const text = markdownToBlocks(markdown)
    .filter((b) => b.type !== 'code' && b.type !== 'divider')
    .map((b) => inlineToPlainText(b.text))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, len)
}

/**
 * 首个块是否为「与笔记标题重复的 H1」。渲染层去重用（vault 里 title 来自文件名、
 * 正文仍可保留 `# 标题` 首行，Obsidian 互通不动 markdown）——只在 UI 隐藏，不改数据。
 * @param {Array} blocks
 * @param {string} title
 * @returns {boolean}
 */
export function firstHeadingMatchesTitle(blocks, title) {
  const b = blocks?.[0]
  if (!b || b.type !== 'heading' || (b.meta?.level || 1) !== 1) return false
  const tt = String(title ?? '').trim()
  if (!tt) return false
  return inlineToPlainText(b.text).trim() === tt
}

/** 该行是否开启一个新块（段落聚合时用来断行）。 */
function isBlockStart(line) {
  return (
    /^(\s*)```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^>\s?/.test(line) ||
    /^(\s*)[-*+]\s+/.test(line) ||
    /^(\s*)\d+[.)]\s+/.test(line) ||
    /^\s*\|.*\|\s*$/.test(line)
  )
}

/** 单块 → Markdown 文本（可能多行）。 */
export function blockToMarkdown(b) {
  const pad = '  '.repeat(Math.max(0, b.depth || 0))
  switch (b.type) {
    case 'heading':
      return `${'#'.repeat(clampLevel(b.meta?.level))} ${b.text}`
    case 'divider':
      return '---'
    case 'quote':
      return `> ${b.text}`
    case 'callout':
      return `> [!${b.meta?.callout || 'note'}] ${b.text}`
    case 'todo':
      return `${pad}- [${b.meta?.checked ? 'x' : ' '}] ${b.text}`
    case 'bullet':
      return `${pad}- ${b.text}`
    case 'numbered':
      return `${pad}${b.meta?.start ?? 1}. ${b.text}`
    case 'code':
      return '```' + (b.meta?.lang || '') + '\n' + b.text + '\n```'
    case 'table':
      return tableToMarkdown(b)
    default:
      return b.text
  }
}

/** 表格块 → GFM。行补齐到表头列数；对齐写回分隔行；单元格内 | 转义。 */
function tableToMarkdown(b) {
  const rows = b.meta?.rows || []
  if (rows.length === 0 || rows[0].length === 0) return ''
  const cols = rows[0].length
  const align = b.meta?.align || []
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const pad = (r) => {
    const c = r.slice(0, cols)
    while (c.length < cols) c.push('')
    return c
  }
  const rowMd = (r) => `| ${pad(r).map(esc).join(' | ')} |`
  const sep =
    '| ' +
    Array.from({ length: cols }, (_, c) => {
      const a = align[c]
      return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'
    }).join(' | ') +
    ' |'
  return [rowMd(rows[0]), sep, ...rows.slice(1).map(rowMd)].join('\n')
}

function clampLevel(l) {
  const n = Number(l) || 1
  return Math.min(6, Math.max(1, n))
}

const LIST_TYPES = new Set(['bullet', 'numbered', 'todo'])
/** 列表「族」：无序（bullet/todo）与有序（numbered）分开，族内紧凑、族间空行。 */
function listFamily(type) {
  if (type === 'numbered') return 'ordered'
  if (type === 'bullet' || type === 'todo') return 'unordered'
  return null
}

/**
 * 块数组 → Markdown。块间空行规则：
 * - 连续列表项（同族）之间不空行（贴合 Markdown 列表语义）
 * - 其余块之间空一行
 * @param {Array} blocks
 * @returns {string}
 */
export function blocksToMarkdown(blocks) {
  const out = []
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]
    out.push(blockToMarkdown(b))
    const next = blocks[i + 1]
    if (!next) break
    const tightList =
      LIST_TYPES.has(b.type) &&
      LIST_TYPES.has(next.type) &&
      listFamily(b.type) === listFamily(next.type)
    const tightQuote = b.type === 'quote' && next.type === 'quote'
    if (!tightList && !tightQuote) out.push('')
  }
  return out.join('\n')
}
