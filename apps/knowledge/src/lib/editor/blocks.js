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

/** 该行是否开启一个新块（段落聚合时用来断行）。 */
function isBlockStart(line) {
  return (
    /^(\s*)```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^>\s?/.test(line) ||
    /^(\s*)[-*+]\s+/.test(line) ||
    /^(\s*)\d+[.)]\s+/.test(line)
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
    case 'todo':
      return `${pad}- [${b.meta?.checked ? 'x' : ' '}] ${b.text}`
    case 'bullet':
      return `${pad}- ${b.text}`
    case 'numbered':
      return `${pad}${b.meta?.start ?? 1}. ${b.text}`
    case 'code':
      return '```' + (b.meta?.lang || '') + '\n' + b.text + '\n```'
    default:
      return b.text
  }
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
