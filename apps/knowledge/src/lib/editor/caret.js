/**
 * contenteditable 光标 / Range 工具（浏览器专用；块状编辑器复用）。
 * 全部以「字符偏移」为坐标，屏蔽渲染后 HTML 与 Markdown 源的偏移差异：
 * 结构操作只需块首/块尾/合并点，都能用纯字符偏移可靠定位。
 */
import { htmlInlineToMd } from './inline.js'

/** 当前选区是否折叠（无选中范围）。 */
export function selectionCollapsed() {
  const sel = window.getSelection()
  return !sel || sel.isCollapsed
}

/** 光标在 el 内的字符偏移（textContent 语义，渲染后无标记）。 */
export function caretOffset(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const r = sel.getRangeAt(0)
  if (!el.contains(r.endContainer)) return 0
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}

export function caretAtStart(el) {
  return selectionCollapsed() && caretOffset(el) === 0
}

export function caretAtEnd(el) {
  return selectionCollapsed() && caretOffset(el) === (el.textContent || '').length
}

/** 把光标放到 el 内第 offset 个字符处（越界则夹到端点）。 */
export function setCaret(el, offset) {
  el.focus()
  const sel = window.getSelection()
  const range = document.createRange()
  let remaining = Math.max(0, offset)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  if (!node) {
    range.selectNodeContents(el)
    range.collapse(true)
  } else {
    let placed = false
    while (node) {
      const len = node.textContent.length
      if (remaining <= len) {
        range.setStart(node, remaining)
        placed = true
        break
      }
      remaining -= len
      const next = walker.nextNode()
      if (!next) {
        range.setStart(node, len)
        placed = true
        break
      }
      node = next
    }
    if (!placed) range.selectNodeContents(el)
    range.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

export function setCaretStart(el) {
  setCaret(el, 0)
}
export function setCaretEnd(el) {
  setCaret(el, (el.textContent || '').length)
}

/** el 内光标左/右两侧内容各自反解为 Markdown（拆块用）。 */
export function splitMarkdownAtCaret(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return [htmlInlineToMd(el.innerHTML), '']
  const r = sel.getRangeAt(0)
  const pre = document.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  const post = document.createRange()
  post.selectNodeContents(el)
  post.setStart(r.endContainer, r.endOffset)
  const wrap = (frag) => {
    const d = document.createElement('div')
    d.appendChild(frag)
    return htmlInlineToMd(d.innerHTML)
  }
  return [wrap(pre.cloneContents()), wrap(post.cloneContents())]
}

/** 当前块反解为 Markdown。 */
export function readBlockMarkdown(el) {
  return htmlInlineToMd(el.innerHTML)
}

/** 光标左侧的纯文本（行内 input-rule 匹配用）。 */
export function textBeforeCaret(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return ''
  const r = sel.getRangeAt(0).cloneRange()
  r.selectNodeContents(el)
  const end = sel.getRangeAt(0)
  if (!el.contains(end.endContainer)) return ''
  r.setEnd(end.endContainer, end.endOffset)
  return r.toString()
}

/**
 * 用 html 片段替换光标左侧末尾 matchLen 个字符（行内 input-rule 落地）。
 * 只在这些字符全落在同一文本节点时生效（刚打完标记即如此），返回是否成功。
 */
export function replaceBeforeCaret(el, matchLen, html) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return false
  const cur = sel.getRangeAt(0)
  const node = cur.endContainer
  if (node.nodeType !== Node.TEXT_NODE) return false
  const offset = cur.endOffset
  if (offset < matchLen) return false
  const range = document.createRange()
  range.setStart(node, offset - matchLen)
  range.setEnd(node, offset)
  range.deleteContents()
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const frag = tpl.content
  const last = frag.lastChild
  range.insertNode(frag)
  // 光标落到插入内容之后
  const after = document.createRange()
  if (last) {
    after.setStartAfter(last)
  } else {
    after.setStart(node, offset - matchLen)
  }
  after.collapse(true)
  sel.removeAllRanges()
  sel.addRange(after)
  return true
}

/** 用元素包裹当前选区（选区工具条：加粗/斜体等）。返回是否成功。 */
export function wrapSelection(tagName, attrs = {}) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  const el = document.createElement(tagName)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  try {
    range.surroundContents(el)
  } catch {
    // 选区跨节点：extract → 包裹 → 塞回
    const frag = range.extractContents()
    el.appendChild(frag)
    range.insertNode(el)
  }
  // 重新选中包裹后的内容
  const next = document.createRange()
  next.selectNodeContents(el)
  sel.removeAllRanges()
  sel.addRange(next)
  return true
}

/** 插入一个 HTML 片段到当前光标处（wikilink 补全用），光标落到其后。 */
export function insertHtmlAtCaret(html) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const frag = tpl.content
  const last = frag.lastChild
  range.insertNode(frag)
  if (last) {
    const after = document.createRange()
    after.setStartAfter(last)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
  }
}

/** 选区相对某祖先容器的定位矩形（浮动工具条用）。 */
export function selectionRect() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return rect
}

/** 光标处的定位矩形（斜杠菜单 / 双链菜单锚点）。 */
export function caretRect() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0).cloneRange()
  r.collapse(true)
  let rect = r.getClientRects()[0]
  if (!rect) {
    const node = r.startContainer
    if (node.nodeType === Node.ELEMENT_NODE) rect = node.getBoundingClientRect()
  }
  return rect || null
}
