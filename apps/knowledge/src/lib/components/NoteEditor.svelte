<script>
  /**
   * NoteEditor —— 块状所见即所得编辑器（对标 Notion，零依赖手写）。
   *
   * 架构要点：
   * - 内存是块数组，落盘/读取始终干净 Markdown（守「.md=数据库」契约）。
   * - 每块独立 contenteditable，走「单向 DOM→状态」：Svelte 不反写 innerHTML，
   *   避免和光标打架；任何程序化改文本/结构的块都换新 id 触发重挂载重渲染。
   * - 行内真·所见即所得走 input-rule（打 **粗** 空格即变真粗体、标记消失）。
   * - 双模：所见即所得 ⇄ 源码 一键切换。
   */
  import { tick } from 'svelte'
  import { LifeOsSheet } from '@life-os/platform-web/svelte/overlay'
  import {
    Bold, Italic, Code, Strikethrough, Link2, Type, Heading1, Heading2,
    Heading3, List, ListOrdered, CheckSquare, Quote, Minus, GripVertical,
    Plus, FileCode, Eye, Pin, Trash2, Check,
  } from '@lucide/svelte'
  import {
    markdownToBlocks, blocksToMarkdown, makeBlock, newBlockId,
  } from '$lib/editor/blocks.js'
  import {
    mdInlineToHtml, matchInlineRule, inlineToPlainText, escapeHtml,
  } from '$lib/editor/inline.js'
  import {
    caretAtStart, caretAtEnd, setCaret, setCaretStart, setCaretEnd,
    splitMarkdownAtCaret, readBlockMarkdown, textBeforeCaret,
    replaceBeforeCaret, wrapSelection, insertHtmlAtCaret, selectionRect,
    caretRect, selectionCollapsed,
  } from '$lib/editor/caret.js'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{
   *   item: any | null,
   *   titles?: string[],
   *   onClose: () => void,
   *   onSave: (patch: { title: string, body: string }) => void,
   *   onDelete: () => void,
   *   onTogglePin: () => void,
   * }}
   */
  let { item, titles = [], onClose, onSave, onDelete, onTogglePin } = $props()

  let title = $state('')
  let blocks = $state([makeBlock('paragraph', '')])
  let mode = $state('wysiwyg') // 'wysiwyg' | 'source'
  let sourceText = $state('')
  let confirmDelete = $state(false)

  /** contenteditable 节点表：块 id → DOM（焦点/光标管理）。 */
  const nodes = new Map()
  /** 结构操作后要聚焦的块：{ id, at: 'start'|'end'|number }。 */
  let pendingFocus = null

  // ——— 生命周期：换到「另一条笔记」才重建 ———
  // 用对象身份而非 id 守卫：vault 保存会重命名文件、就地改 item.id（同一对象），
  // 那不是切换笔记，绝不能借此把正在编辑的内容打回。
  let loadedRef = null
  $effect(() => {
    const cur = item
    if (!cur || cur === loadedRef) return
    loadedRef = cur
    title = cur.title || ''
    blocks = markdownToBlocks(cur.body || '')
    mode = 'wysiwyg'
    sourceText = ''
    confirmDelete = false
    closeMenus()
  })

  /* ============ 保存（防抖）+ 状态指示 ============ */
  let saveTimer = null
  let saveState = $state('idle') // 'idle' | 'saving' | 'saved'
  let savedTimer = null
  function currentBody() {
    return mode === 'source' ? sourceText : blocksToMarkdown(blocks)
  }
  function scheduleSave() {
    clearTimeout(saveTimer)
    saveState = 'saving'
    saveTimer = setTimeout(flushSave, 600)
  }
  function flushSave() {
    clearTimeout(saveTimer)
    if (!item) return
    onSave({ title: title.trim() || t('library.typeNote'), body: currentBody() })
    saveState = 'saved'
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => { if (saveState === 'saved') saveState = 'idle' }, 2200)
  }

  /* ============ 编辑区动作 ============ */
  function editable(node, block) {
    node.innerHTML = mdInlineToHtml(block.text) || ''
    nodes.set(block.id, node)
    return { destroy() { nodes.delete(block.id) } }
  }

  function focusBlock(id, at = 'end') {
    const el = nodes.get(id)
    if (!el) return
    if (at === 'start') setCaretStart(el)
    else if (at === 'end') setCaretEnd(el)
    else setCaret(el, at)
  }

  $effect(() => {
    if (!pendingFocus) return
    const target = pendingFocus
    pendingFocus = null
    tick().then(() => focusBlock(target.id, target.at))
  })

  function indexOfBlock(id) {
    return blocks.findIndex((b) => b.id === id)
  }

  /** 用新块替换 blocks[i]（换 id → 重挂载 → innerHTML 重渲）。 */
  function replaceBlock(i, type, text, extra = {}) {
    const nb = makeBlock(type, text, extra)
    blocks[i] = nb
    return nb
  }

  /* ——— 块级 input-rule：段首前缀 → 块类型 ——— */
  const BLOCK_PREFIX = [
    { re: /^(#{1,6})\s$/, make: (m) => ({ type: 'heading', meta: { level: m[1].length } }) },
    { re: /^[-*+]\s\[[ xX]?\]\s$/, make: () => ({ type: 'todo', meta: { checked: false } }) },
    { re: /^\[[ xX]?\]\s$/, make: () => ({ type: 'todo', meta: { checked: false } }) },
    { re: /^[-*+]\s$/, make: () => ({ type: 'bullet' }) },
    { re: /^(\d+)[.)]\s$/, make: (m) => ({ type: 'numbered', meta: { start: Number(m[1]) } }) },
    { re: /^>\s$/, make: () => ({ type: 'quote' }) },
    { re: /^```(\S*)\s?$/, make: (m) => ({ type: 'code', meta: { lang: m[1] || '' } }) },
    { re: /^(-{3,}|\*{3,}|_{3,})$/, make: () => ({ type: 'divider' }) },
  ]

  function maybeBlockRule(block, el) {
    if (block.type !== 'paragraph' && block.type !== 'bullet' && block.type !== 'numbered') return false
    const raw = el.textContent || ''
    for (const rule of BLOCK_PREFIX) {
      const m = raw.match(rule.re)
      if (m) {
        const spec = rule.make(m)
        const i = indexOfBlock(block.id)
        if (i < 0) return false
        const nb = replaceBlock(i, spec.type, '', {
          depth: spec.type === 'divider' ? 0 : block.depth,
          meta: spec.meta || {},
        })
        if (spec.type === 'divider') {
          // 分隔线不可编辑：其后补一个空段落并聚焦
          const p = makeBlock('paragraph', '')
          blocks.splice(i + 1, 0, p)
          pendingFocus = { id: p.id, at: 'start' }
        } else {
          pendingFocus = { id: nb.id, at: 'start' }
        }
        scheduleSave()
        return true
      }
    }
    return false
  }

  /* ——— 行内 input-rule：打完标记即渲染 ——— */
  function maybeInlineRule(el) {
    if (!selectionCollapsed()) return
    const left = textBeforeCaret(el)
    const hit = matchInlineRule(left)
    if (hit) replaceBeforeCaret(el, hit.match.length, hit.html)
  }

  function onInput(block, el, e) {
    if (maybeBlockRule(block, el)) return
    const data = e?.data
    if (data && /[*_~`]/.test(data)) maybeInlineRule(el)
    updateMenus(block, el)
    block.text = readBlockMarkdown(el)
    scheduleSave()
  }

  /* ——— 键盘：Enter / Backspace / Tab / 箭头 ——— */
  function onKeydown(block, el, e) {
    if (slash.open) { if (slashKey(e)) return }
    if (link.open) { if (linkKey(e)) return }

    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      e.stopPropagation()
      handleEnter(block, el)
    } else if (e.key === 'Backspace' && caretAtStart(el) && selectionCollapsed()) {
      handleBackspaceStart(block, el, e)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      handleTab(block, e.shiftKey)
    } else if (e.key === 'ArrowUp' && caretAtStart(el)) {
      moveFocus(block, -1, e)
    } else if (e.key === 'ArrowDown' && caretAtEnd(el)) {
      moveFocus(block, 1, e)
    }
  }

  function handleEnter(block, el) {
    const i = indexOfBlock(block.id)
    if (i < 0) return
    const isList = block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo'
    // 空列表项回车 → 退成段落（或先降层）
    if (isList && (el.textContent || '').trim() === '') {
      if (block.depth > 0) { handleTab(block, true); return }
      replaceBlock(i, 'paragraph', '')
      pendingFocus = { id: blocks[i].id, at: 'start' }
      scheduleSave()
      return
    }
    const [left, right] = splitMarkdownAtCaret(el)
    // 左半留在原块（换 id 让 DOM 重渲为 left）
    replaceBlock(i, block.type, left, { depth: block.depth, meta: { ...block.meta } })
    // 新块类型：标题/引用回车 → 段落；列表/待办延续同类
    let nextType = 'paragraph'
    let nextMeta = {}
    let nextDepth = 0
    if (isList) {
      nextType = block.type
      nextDepth = block.depth
      if (block.type === 'numbered') nextMeta = { start: (block.meta?.start ?? 1) + 1 }
      if (block.type === 'todo') nextMeta = { checked: false }
    }
    const nb = makeBlock(nextType, right, { depth: nextDepth, meta: nextMeta })
    blocks.splice(i + 1, 0, nb)
    pendingFocus = { id: nb.id, at: 'start' }
    scheduleSave()
  }

  function handleBackspaceStart(block, el, e) {
    const i = indexOfBlock(block.id)
    // 列表/标题/引用块首退格 → 先退回段落
    if (block.type !== 'paragraph') {
      e.preventDefault()
      e.stopPropagation()
      if ((block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo') && block.depth > 0) {
        handleTab(block, true)
        return
      }
      const cur = readBlockMarkdown(el)
      replaceBlock(i, 'paragraph', cur, { depth: 0 })
      pendingFocus = { id: blocks[i].id, at: 'start' }
      scheduleSave()
      return
    }
    if (i <= 0) return
    const prev = blocks[i - 1]
    if (prev.type === 'divider') {
      e.preventDefault()
      e.stopPropagation()
      blocks.splice(i - 1, 1)
      scheduleSave()
      return
    }
    if (prev.type === 'code') return // 代码块交给其自身处理
    // 合并进上一块
    e.preventDefault()
    e.stopPropagation()
    const prevMd = prev.text
    const curMd = readBlockMarkdown(el)
    const merged = prevMd + curMd
    const caretAt = inlineToPlainText(prevMd).length
    replaceBlock(i - 1, prev.type, merged, { depth: prev.depth, meta: { ...prev.meta } })
    blocks.splice(i, 1)
    pendingFocus = { id: blocks[i - 1].id, at: caretAt }
    scheduleSave()
  }

  function handleTab(block, outdent) {
    if (!(block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo')) return
    const i = indexOfBlock(block.id)
    const el = nodes.get(block.id)
    const cur = el ? readBlockMarkdown(el) : block.text
    const depth = outdent ? Math.max(0, block.depth - 1) : Math.min(8, block.depth + 1)
    replaceBlock(i, block.type, cur, { depth, meta: { ...block.meta } })
    pendingFocus = { id: blocks[i].id, at: 'end' }
    scheduleSave()
  }

  function moveFocus(block, dir, e) {
    const i = indexOfBlock(block.id)
    const target = blocks[i + dir]
    if (!target || target.type === 'divider') return
    if (nodes.get(target.id)) {
      e.preventDefault()
      focusBlock(target.id, dir < 0 ? 'end' : 'start')
    }
  }

  // 浮层（工具条/斜杠/双链）传送到 body：否则被 .sheet-bg(z-index:100) 盖住。
  function portal(node) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }

  /* ——— 代码块（用 textarea，Enter 天然换行）——— */
  function autoGrowInit(node) {
    const grow = () => { node.style.height = 'auto'; node.style.height = node.scrollHeight + 'px' }
    requestAnimationFrame(grow)
    node.addEventListener('input', grow)
    return { destroy() { node.removeEventListener('input', grow) } }
  }
  function onCodeInput(block, e) {
    block.text = e.target.value
    scheduleSave()
    autoGrow(e.target)
  }
  function autoGrow(ta) {
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }
  function onCodeKeydown(block, e) {
    if (e.key === 'Backspace' && e.target.value === '') {
      e.preventDefault()
      const i = indexOfBlock(block.id)
      replaceBlock(i, 'paragraph', '')
      pendingFocus = { id: blocks[i].id, at: 'start' }
      scheduleSave()
    }
  }

  /* ——— 待办勾选 ——— */
  function toggleTodo(block) {
    const i = indexOfBlock(block.id)
    const el = nodes.get(block.id)
    const cur = el ? readBlockMarkdown(el) : block.text
    replaceBlock(i, 'todo', cur, { depth: block.depth, meta: { checked: !block.meta?.checked } })
    scheduleSave()
  }

  /* ============ 选区格式工具条 ============ */
  let toolbar = $state({ open: false, x: 0, y: 0, active: {} })
  function refreshToolbar() {
    if (!inEditor()) { toolbar.open = false; return }
    const rect = selectionRect()
    if (!rect) { toolbar.open = false; return }
    toolbar = { open: true, x: rect.left + rect.width / 2, y: rect.top, active: activeFormats() }
  }
  /** 选区祖先里已有哪些行内格式（工具条按钮高亮用）。 */
  function activeFormats() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return {}
    let n = sel.getRangeAt(0).commonAncestorContainer
    const on = {}
    while (n && n.nodeType) {
      const tag = n.nodeName?.toLowerCase()
      if (tag === 'strong' || tag === 'b') on.bold = true
      else if (tag === 'em' || tag === 'i') on.italic = true
      else if (tag === 'del' || tag === 's') on.strike = true
      else if (tag === 'code') on.code = true
      else if (tag === 'a') on.link = true
      if (n.classList?.contains('ed-edit')) break
      n = n.parentNode
    }
    return on
  }
  function inEditor() {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return false
    let n = sel.getRangeAt(0).commonAncestorContainer
    for (const el of nodes.values()) if (el.contains(n)) return true
    return false
  }
  function applyFormat(kind) {
    if (kind === 'bold') wrapSelection('strong')
    else if (kind === 'italic') wrapSelection('em')
    else if (kind === 'strike') wrapSelection('del')
    else if (kind === 'code') wrapSelection('code')
    else if (kind === 'link') {
      const url = prompt(t('editor.linkPrompt'))
      if (url) wrapSelection('a', { href: url, rel: 'noopener noreferrer' })
    }
    syncFocusedBlock()
    toolbar.open = false
  }
  /** 工具条改动 DOM 后，把当前聚焦块回读进状态。 */
  function syncFocusedBlock() {
    const active = document.activeElement
    for (const [id, el] of nodes) {
      if (el === active || el.contains(active)) {
        const b = blocks.find((x) => x.id === id)
        if (b) b.text = readBlockMarkdown(el)
        break
      }
    }
    scheduleSave()
  }

  /* ============ 斜杠菜单 ============ */
  const SLASH_ITEMS = [
    { key: 'paragraph', icon: Type, label: () => t('editor.slPara'), desc: () => t('editor.slParaD') },
    { key: 'h1', icon: Heading1, label: () => t('editor.slH1'), desc: () => t('editor.slH1D'), type: 'heading', meta: { level: 1 } },
    { key: 'h2', icon: Heading2, label: () => t('editor.slH2'), desc: () => t('editor.slH2D'), type: 'heading', meta: { level: 2 } },
    { key: 'h3', icon: Heading3, label: () => t('editor.slH3'), desc: () => t('editor.slH3D'), type: 'heading', meta: { level: 3 } },
    { key: 'todo', icon: CheckSquare, label: () => t('editor.slTodo'), desc: () => t('editor.slTodoD'), type: 'todo', meta: { checked: false } },
    { key: 'bullet', icon: List, label: () => t('editor.slBullet'), desc: () => t('editor.slBulletD'), type: 'bullet' },
    { key: 'numbered', icon: ListOrdered, label: () => t('editor.slNumbered'), desc: () => t('editor.slNumberedD'), type: 'numbered', meta: { start: 1 } },
    { key: 'quote', icon: Quote, label: () => t('editor.slQuote'), desc: () => t('editor.slQuoteD'), type: 'quote' },
    { key: 'code', icon: FileCode, label: () => t('editor.slCode'), desc: () => t('editor.slCodeD'), type: 'code', meta: { lang: '' } },
    { key: 'divider', icon: Minus, label: () => t('editor.slDivider'), desc: () => t('editor.slDividerD'), type: 'divider' },
  ]
  let slash = $state({ open: false, x: 0, y: 0, query: '', index: 0, blockId: null })
  const slashFiltered = $derived(
    slash.query
      ? SLASH_ITEMS.filter((it) => it.label().toLowerCase().includes(slash.query.toLowerCase()))
      : SLASH_ITEMS,
  )
  let link = $state({ open: false, x: 0, y: 0, query: '', index: 0, blockId: null })
  const linkFiltered = $derived(
    (() => {
      const q = link.query.trim().toLowerCase()
      const pool = titles.filter((tt) => tt && tt.toLowerCase() !== title.trim().toLowerCase())
      return (q ? pool.filter((tt) => tt.toLowerCase().includes(q)) : pool).slice(0, 8)
    })(),
  )

  function updateMenus(block, el) {
    const left = textBeforeCaret(el)
    // 斜杠：块首「/query」（query 无空格）
    const sl = left.match(/(?:^|\s)\/([^\s/]*)$/)
    if (sl && block.type !== 'code') {
      const rect = caretRect()
      slash = { open: true, x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4, query: sl[1], index: 0, blockId: block.id }
    } else if (slash.open) {
      slash = { ...slash, open: false }
    }
    // 双链：「[[query」尚未闭合
    const lk = left.match(/\[\[([^\]]*)$/)
    if (lk && block.type !== 'code') {
      const rect = caretRect()
      link = { open: true, x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4, query: lk[1], index: 0, blockId: block.id }
    } else if (link.open) {
      link = { ...link, open: false }
    }
  }

  function slashKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); slash.index = (slash.index + 1) % Math.max(1, slashFiltered.length); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); slash.index = (slash.index - 1 + slashFiltered.length) % Math.max(1, slashFiltered.length); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); pickSlash(slashFiltered[slash.index]); return true }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); slash = { ...slash, open: false }; return true }
    return false
  }
  function pickSlash(sel) {
    if (!sel) return
    const el = nodes.get(slash.blockId)
    const i = indexOfBlock(slash.blockId)
    slash = { ...slash, open: false }
    if (i < 0 || !el) return
    // 去掉「/query」
    const raw = readBlockMarkdown(el).replace(/\/[^\s/]*\s*$/, '').replace(/\/$/, '')
    if (sel.key === 'divider') {
      replaceBlock(i, 'divider', '')
      const p = makeBlock('paragraph', raw)
      blocks.splice(i + 1, 0, p)
      pendingFocus = { id: p.id, at: 'start' }
    } else {
      replaceBlock(i, sel.type || 'paragraph', raw, { meta: sel.meta ? { ...sel.meta } : {} })
      pendingFocus = { id: blocks[i].id, at: 'end' }
    }
    scheduleSave()
  }

  function linkKey(e) {
    const list = linkFiltered
    if (e.key === 'ArrowDown') { e.preventDefault(); link.index = (link.index + 1) % Math.max(1, list.length); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); link.index = (link.index - 1 + list.length) % Math.max(1, list.length); return true }
    if ((e.key === 'Enter' || e.key === 'Tab') && list.length) { e.preventDefault(); e.stopPropagation(); pickLink(list[link.index]); return true }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); link = { ...link, open: false }; return true }
    return false
  }
  function pickLink(targetTitle) {
    const el = nodes.get(link.blockId)
    const q = link.query
    link = { ...link, open: false }
    if (!el) return
    el.focus()
    // 删掉已输入的「[[query」，插入渲染后的 wikilink
    replaceBeforeCaret(el, q.length + 2, `<a class="wikilink" data-target="${escapeHtml(targetTitle)}">${escapeHtml(targetTitle)}</a>&nbsp;`)
    const b = blocks.find((x) => x.id === link.blockId)
    if (b) b.text = readBlockMarkdown(el)
    scheduleSave()
  }

  function closeMenus() {
    slash = { ...slash, open: false }
    link = { ...link, open: false }
    toolbar = { ...toolbar, open: false }
  }

  /* ============ 块拖拽排序 ============ */
  let dragId = $state(null)
  let dropId = $state(null)
  function onDragStart(block, e) {
    dragId = block.id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', block.id)
  }
  function onDragOver(block, e) {
    if (!dragId) return
    e.preventDefault()
    dropId = block.id
  }
  function onDrop(block, e) {
    e.preventDefault()
    const from = indexOfBlock(dragId)
    let to = indexOfBlock(block.id)
    dragId = null; dropId = null
    if (from < 0 || to < 0 || from === to) return
    const [moved] = blocks.splice(from, 1)
    if (from < to) to -= 1
    blocks.splice(to, 0, moved)
    blocks = blocks
    scheduleSave()
  }
  function addBlockAfter(block) {
    const i = indexOfBlock(block.id)
    const nb = makeBlock('paragraph', '')
    blocks.splice(i + 1, 0, nb)
    pendingFocus = { id: nb.id, at: 'start' }
  }

  /* ============ 双模切换 ============ */
  function toggleMode() {
    if (mode === 'wysiwyg') {
      sourceText = blocksToMarkdown(blocks)
      mode = 'source'
    } else {
      blocks = markdownToBlocks(sourceText)
      mode = 'wysiwyg'
    }
    closeMenus()
    scheduleSave()
  }
  function onSourceInput(e) {
    sourceText = e.target.value
    scheduleSave()
  }

  /* ============ 关闭前落盘 ============ */
  function close() {
    flushSave()
    onClose()
  }
  function remove() {
    if (!confirmDelete) { confirmDelete = true; return }
    clearTimeout(saveTimer)
    onDelete()
  }

  // 全局选区监听（工具条）
  $effect(() => {
    if (!item) return
    const handler = () => refreshToolbar()
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  })

  const HEADING_EM = { 1: '1.875em', 2: '1.5em', 3: '1.25em', 4: '1.1em', 5: '1em', 6: '0.9em' }
  /** 编辑元素样式：标题按级号定字号（列表缩进走 .ed-block 的 --depth）。 */
  function editStyle(block) {
    return block.type === 'heading' ? `font-size:${HEADING_EM[block.meta?.level] || '1.875em'}` : ''
  }

  const listNumber = (block, i) => {
    // 同层同族连续 numbered 的序号（从各自 start 递增）
    let n = block.meta?.start ?? 1
    for (let j = i - 1; j >= 0; j -= 1) {
      const p = blocks[j]
      if (p.type === 'numbered' && p.depth === block.depth) n = (p.meta?.start ?? 1) + (i - j)
      if (p.type !== 'numbered' || p.depth < block.depth) break
    }
    return n
  }
</script>

<LifeOsSheet
  open={Boolean(item)}
  onClose={close}
  ariaLabel={title}
  sheetClass="note-editor"
  closeOnBackdrop={false}
>
  {#snippet header()}
    <div class="ed-topbar">
      <button type="button" class="ed-tool" onclick={toggleMode} aria-pressed={mode === 'source'} title={t('editor.toggleMode')}>
        {#if mode === 'source'}<Eye size={15} />{:else}<FileCode size={15} />{/if}
        <span>{mode === 'source' ? t('editor.wysiwyg') : t('editor.source')}</span>
      </button>
      <div class="ed-spacer"></div>
      {#if saveState !== 'idle'}
        <span class="ed-save" class:is-saved={saveState === 'saved'} aria-live="polite">
          <span class="ed-save-dot"></span>
          {saveState === 'saving' ? t('editor.saving') : t('editor.saved')}
        </span>
      {/if}
      <button type="button" class="ed-icon" onclick={onTogglePin} aria-pressed={item?.pinned} title={item?.pinned ? t('common.unpin') : t('common.pin')}>
        <Pin size={16} fill={item?.pinned ? 'currentColor' : 'none'} />
      </button>
      <button type="button" class="ed-icon ed-icon--danger" onclick={remove} title={t('common.delete')}>
        <Trash2 size={16} />
        {#if confirmDelete}<span class="ed-icon-label">{t('editor.confirmDelete')}</span>{/if}
      </button>
    </div>
  {/snippet}

  {#if item}
    <div class="ed-scroll">
      <div class="ed-canvas">
        <input
          class="ed-title"
          bind:value={title}
          oninput={scheduleSave}
          placeholder={t('editor.titlePlaceholder')}
          aria-label={t('library.fieldTitle')}
        />

        {#if mode === 'source'}
          <textarea class="ed-source" value={sourceText} oninput={onSourceInput} spellcheck="false" aria-label={t('editor.source')}></textarea>
        {:else}
          <div class="ed-blocks">
            {#each blocks as block, i (block.id)}
              <div
                class="ed-row ed-row--{block.type}"
                class:is-drop={dropId === block.id}
                class:is-drag={dragId === block.id}
                ondragover={(e) => onDragOver(block, e)}
                ondrop={(e) => onDrop(block, e)}
                role="listitem"
              >
                <div class="ed-gutter">
                  <button type="button" class="ed-handle" title={t('editor.addBlock')} onclick={() => addBlockAfter(block)} tabindex="-1"><Plus size={15} /></button>
                  <button
                    type="button" class="ed-handle ed-handle--grip" title={t('editor.dragBlock')} tabindex="-1"
                    draggable="true"
                    ondragstart={(e) => onDragStart(block, e)}
                    ondragend={() => { dragId = null; dropId = null }}
                  ><GripVertical size={15} /></button>
                </div>

                <div class="ed-block" style={block.depth ? `--depth:${block.depth}` : ''}>
                  {#if block.type === 'divider'}
                    <hr class="ed-hr" />
                  {:else if block.type === 'code'}
                    <div class="ed-codewrap">
                      <textarea
                        class="ed-code" spellcheck="false" value={block.text}
                        placeholder={t('editor.codePlaceholder')}
                        oninput={(e) => onCodeInput(block, e)}
                        onkeydown={(e) => onCodeKeydown(block, e)}
                        use:autoGrowInit
                      ></textarea>
                    </div>
                  {:else}
                    {#if block.type === 'todo'}
                      <button type="button" class="ed-check" class:is-done={block.meta?.checked} onclick={() => toggleTodo(block)} aria-label={t('editor.slTodo')} tabindex="-1">
                        {#if block.meta?.checked}<Check size={13} strokeWidth={3} />{/if}
                      </button>
                    {:else if block.type === 'bullet'}
                      <span class="ed-bullet ed-bullet--{(block.depth || 0) % 3}" aria-hidden="true"></span>
                    {:else if block.type === 'numbered'}
                      <span class="ed-num" aria-hidden="true">{listNumber(block, i)}.</span>
                    {/if}
                    <div
                      class="ed-edit ed-edit--{block.type}"
                      class:is-done={block.type === 'todo' && block.meta?.checked}
                      style={editStyle(block)}
                      contenteditable="true"
                      role="textbox" tabindex="0"
                      aria-multiline="false"
                      data-ph={block.type === 'heading' ? t('editor.headingPlaceholder') : t('editor.blockPlaceholder')}
                      use:editable={block}
                      oninput={(e) => onInput(block, e.currentTarget, e)}
                      onkeydown={(e) => onKeydown(block, e.currentTarget, e)}
                    ></div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#snippet actions()}
    <button type="button" class="btn-primary" onclick={close}>{t('common.save')}</button>
  {/snippet}
</LifeOsSheet>

<!-- 选区格式工具条（气泡菜单） -->
{#if toolbar.open}
  <div class="ed-bubble" use:portal style="left:{toolbar.x}px; top:{toolbar.y}px">
    <button type="button" class:is-on={toolbar.active.bold} onmousedown={(e) => e.preventDefault()} onclick={() => applyFormat('bold')} title={t('editor.bold')}><Bold size={15} /></button>
    <button type="button" class:is-on={toolbar.active.italic} onmousedown={(e) => e.preventDefault()} onclick={() => applyFormat('italic')} title={t('editor.italic')}><Italic size={15} /></button>
    <button type="button" class:is-on={toolbar.active.strike} onmousedown={(e) => e.preventDefault()} onclick={() => applyFormat('strike')} title={t('editor.strike')}><Strikethrough size={15} /></button>
    <button type="button" class:is-on={toolbar.active.code} onmousedown={(e) => e.preventDefault()} onclick={() => applyFormat('code')} title={t('editor.inlineCode')}><Code size={15} /></button>
    <span class="ed-bubble-div" aria-hidden="true"></span>
    <button type="button" class:is-on={toolbar.active.link} onmousedown={(e) => e.preventDefault()} onclick={() => applyFormat('link')} title={t('editor.link')}><Link2 size={15} /></button>
  </div>
{/if}

<!-- 斜杠菜单 -->
{#if slash.open && slashFiltered.length}
  <div class="ed-menu ed-slashmenu" use:portal style="left:{slash.x}px; top:{slash.y}px">
    <div class="ed-menu-section">{t('editor.slSection')}</div>
    {#each slashFiltered as it, idx (it.key)}
      <button type="button" class="ed-menu-item" class:is-active={idx === slash.index}
        onmousedown={(e) => { e.preventDefault(); pickSlash(it) }}>
        <span class="ed-menu-ic"><it.icon size={17} /></span>
        <span class="ed-menu-text">
          <span class="ed-menu-title">{it.label()}</span>
          <span class="ed-menu-desc">{it.desc()}</span>
        </span>
      </button>
    {/each}
  </div>
{/if}

<!-- 双链补全 -->
{#if link.open && linkFiltered.length}
  <div class="ed-menu" use:portal style="left:{link.x}px; top:{link.y}px">
    <div class="ed-menu-section">{t('editor.linkSection')}</div>
    {#each linkFiltered as tt, idx (tt)}
      <button type="button" class="ed-menu-item ed-menu-item--link" class:is-active={idx === link.index}
        onmousedown={(e) => { e.preventDefault(); pickLink(tt) }}>
        <span class="ed-menu-ic"><Link2 size={15} /></span>
        <span class="ed-menu-title">{tt}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Notion 式排版尺度：暖黑正文 + 舒适测量列 + 标题重上边距/轻下边距 */
  :global(.sheet.note-editor) {
    max-width: 860px;
    width: min(94vw, 860px);
    height: min(92vh, 980px);
    display: flex;
    flex-direction: column;
    --wash: color-mix(in srgb, var(--t1, var(--text)) 6%, transparent);
    --wash-strong: color-mix(in srgb, var(--t1, var(--text)) 10%, transparent);
    --pop-shadow: 0 0 0 1px color-mix(in srgb, var(--t1, var(--text)) 6%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.12), 0 12px 32px rgba(0, 0, 0, 0.18);
  }

  /* ——— 顶栏 ——— */
  .ed-topbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-bottom: var(--space-1);
  }
  .ed-spacer { flex: 1; }
  .ed-tool {
    display: inline-flex; align-items: center; gap: 6px;
    height: 28px; padding: 0 10px;
    border-radius: var(--radius-pill, 999px);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm); cursor: pointer;
    transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease), border-color var(--motion-fast) var(--ease);
  }
  .ed-tool:hover { background: var(--wash); color: var(--t1, var(--text)); }
  .ed-tool[aria-pressed='true'] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
  .ed-icon {
    display: inline-flex; align-items: center; gap: 6px;
    height: 28px; padding: 0 7px;
    border: none; background: transparent;
    color: var(--t3, var(--text-muted)); border-radius: var(--radius-control, 8px);
    cursor: pointer; transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  }
  .ed-icon:hover { background: var(--wash); color: var(--t1, var(--text)); }
  .ed-icon[aria-pressed='true'] { color: var(--accent); }
  .ed-icon--danger:hover { color: var(--feedback-danger); background: var(--feedback-danger-bg); }
  .ed-icon-label { font-size: var(--text-sm); }
  .ed-save {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: var(--text-xs); color: var(--t3, var(--text-muted));
    padding-inline-end: var(--space-1);
    animation: ed-fade 0.2s ease-out;
  }
  .ed-save-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--t3, var(--text-muted));
    animation: ed-pulse 1s ease-in-out infinite;
  }
  .ed-save.is-saved { color: var(--feedback-success, var(--accent)); }
  .ed-save.is-saved .ed-save-dot { background: currentColor; animation: none; }

  /* ——— 滚动区 + 居中测量列 ——— */
  .ed-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: clip;
    padding: var(--space-2) 56px 34vh;
  }
  .ed-canvas {
    max-width: 680px;
    margin-inline: auto;
  }

  .ed-title {
    width: 100%;
    border: none; background: transparent; outline: none;
    font-family: inherit;
    font-size: 1.95rem; font-weight: 750; line-height: 1.25;
    letter-spacing: -0.01em;
    color: var(--t1, var(--text));
    padding: var(--space-2) 0 var(--space-1);
  }
  .ed-title::placeholder { color: var(--t3, var(--text-muted)); }

  .ed-source {
    display: block; width: 100%; min-height: 60vh;
    border: none; background: transparent; resize: none; outline: none;
    font-family: var(--mono);
    font-size: var(--text-base); line-height: 1.7;
    color: var(--t1, var(--text)); tab-size: 2;
  }

  /* ——— 块列表 ——— */
  .ed-blocks { font-size: var(--text-xl, 16px); line-height: 1.55; caret-color: var(--accent); }
  .ed-blocks :global(::selection) { background: color-mix(in srgb, var(--accent) 26%, transparent); }

  .ed-row { position: relative; }
  .ed-row.is-drag { opacity: 0.35; }
  .ed-row.is-drop::before {
    content: ''; position: absolute; left: 0; right: 0; top: -1px; height: 2px;
    background: var(--accent); border-radius: 2px;
  }

  .ed-gutter {
    position: absolute; left: -46px; top: 0;
    display: flex; align-items: center; gap: 1px;
    height: 1.5em; padding-top: 0.1em;
    opacity: 0; transition: opacity var(--motion-fast) var(--ease);
  }
  .ed-row:hover .ed-gutter,
  .ed-gutter:focus-within { opacity: 1; }
  .ed-row--heading .ed-gutter { height: auto; align-items: flex-start; padding-top: 0.4em; }
  .ed-handle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 22px;
    border: none; background: transparent;
    color: var(--t3, var(--text-muted));
    border-radius: 5px; cursor: pointer;
    transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  }
  .ed-handle:hover { background: var(--wash-strong); color: var(--t1, var(--text)); }
  .ed-handle--grip { cursor: grab; }
  .ed-handle--grip:active { cursor: grabbing; }

  .ed-block {
    display: flex; align-items: flex-start; gap: 6px;
    min-width: 0;
    padding: 3px 6px;
    margin-inline: calc(var(--depth, 0) * 26px - 6px) -6px;
    border-radius: 5px;
    transition: background var(--motion-fast) var(--ease);
  }
  .ed-row:hover > .ed-block { background: var(--wash); }
  .ed-row--divider:hover > .ed-block,
  .ed-row--code:hover > .ed-block { background: transparent; }

  .ed-edit {
    flex: 1; min-width: 0; outline: none;
    color: var(--t1, var(--text));
    white-space: pre-wrap; word-break: break-word;
  }
  .ed-edit:empty::before { content: ''; }
  .ed-edit--heading:empty::before,
  .ed-edit:focus:empty::before {
    content: attr(data-ph);
    color: var(--t3, var(--text-muted));
    pointer-events: none;
  }

  .ed-edit--heading { font-weight: 700; line-height: 1.3; letter-spacing: -0.01em; }
  .ed-row--heading { margin-top: 1.3em; }
  .ed-row--heading:first-child { margin-top: 0.2em; }
  .ed-edit--quote {
    border-inline-start: 3px solid color-mix(in srgb, var(--t1, var(--text)) 30%, transparent);
    padding-inline-start: 14px;
    color: color-mix(in srgb, var(--t1, var(--text)) 82%, transparent);
  }
  .ed-edit.is-done { color: var(--t3, var(--text-muted)); text-decoration: line-through; }

  /* 列表标记 */
  .ed-bullet {
    flex: 0 0 auto; width: 1.5em; height: 1.5em;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .ed-bullet::before {
    content: ''; width: 6px; height: 6px;
    background: color-mix(in srgb, var(--t1, var(--text)) 72%, transparent);
  }
  .ed-bullet--0::before { border-radius: 50%; }
  .ed-bullet--1::before { border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1.4px color-mix(in srgb, var(--t1, var(--text)) 60%, transparent); }
  .ed-bullet--2::before { border-radius: 1px; }
  .ed-num {
    flex: 0 0 auto; min-width: 1.5em; height: 1.5em;
    display: inline-flex; align-items: center; justify-content: flex-end;
    padding-inline-end: 3px;
    color: color-mix(in srgb, var(--t1, var(--text)) 62%, transparent);
    font-variant-numeric: tabular-nums; font-size: 0.95em;
  }

  /* 待办勾选框 */
  .ed-check {
    flex: 0 0 auto; margin-top: 0.2em;
    width: 18px; height: 18px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1.5px solid color-mix(in srgb, var(--t1, var(--text)) 34%, transparent);
    border-radius: 4px; background: transparent;
    color: white; cursor: pointer;
    transition: background var(--motion-fast) var(--ease), border-color var(--motion-fast) var(--ease), transform var(--motion-fast) var(--ease);
  }
  .ed-check:hover { border-color: color-mix(in srgb, var(--t1, var(--text)) 55%, transparent); }
  .ed-check.is-done {
    background: var(--accent); border-color: var(--accent);
  }
  .ed-check.is-done:active { transform: scale(0.9); }

  .ed-hr { width: 100%; border: none; border-top: 1px solid var(--border); margin: 6px 0; }

  .ed-codewrap { flex: 1; min-width: 0; }
  .ed-code {
    display: block; width: 100%;
    border: 1px solid var(--border); border-radius: var(--radius-control, 8px);
    background: color-mix(in srgb, var(--t1, var(--text)) 4%, transparent);
    padding: 12px 16px;
    font-family: var(--mono); font-size: var(--text-base); line-height: 1.55;
    color: var(--t1, var(--text)); resize: none; outline: none; overflow: hidden;
    tab-size: 2;
  }
  .ed-code:focus { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }

  /* 行内格式 */
  .ed-edit :global(strong) { font-weight: 700; }
  .ed-edit :global(code) {
    font-family: var(--mono); font-size: 0.88em;
    background: color-mix(in srgb, var(--t1, var(--text)) 9%, transparent);
    color: color-mix(in srgb, var(--feedback-danger) 88%, var(--t1, var(--text)));
    padding: 0.14em 0.4em; border-radius: 4px;
  }
  .ed-edit :global(a) { color: var(--accent); text-underline-offset: 2px; }
  .ed-edit :global(a.wikilink) {
    text-decoration: none;
    background: var(--accent-bg, var(--accent-subtle));
    padding: 0 4px; border-radius: var(--radius-control, 6px);
    color: color-mix(in srgb, var(--accent) 72%, var(--t1, var(--text)));
    box-decoration-break: clone;
  }

  /* ——— 气泡工具条 ——— */
  .ed-bubble {
    position: fixed;
    transform: translate(-50%, calc(-100% - 8px));
    display: flex; align-items: center; gap: 2px;
    background: var(--surface-1, var(--surface));
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 10px);
    box-shadow: var(--pop-shadow); padding: 3px; z-index: 220;
    animation: ed-pop 0.12s ease-out;
  }
  .ed-bubble button {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border: none; background: transparent;
    color: var(--t1, var(--text)); border-radius: 7px; cursor: pointer;
    transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  }
  .ed-bubble button:hover { background: var(--wash-strong); }
  .ed-bubble button.is-on { background: var(--accent-bg, var(--accent-subtle)); color: var(--accent); }
  .ed-bubble-div { width: 1px; height: 18px; margin: 0 2px; background: var(--border); }

  /* ——— 弹出菜单（斜杠 / 双链）——— */
  .ed-menu {
    position: fixed;
    min-width: 260px; max-height: 336px; overflow-y: auto;
    background: var(--surface-1, var(--surface));
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--pop-shadow);
    padding: 6px; z-index: 220;
    animation: ed-pop-menu 0.12s ease-out;
  }
  .ed-slashmenu { min-width: 300px; }
  .ed-menu-section {
    padding: 6px 10px 4px;
    font-size: var(--text-2xs, 10px); font-weight: 600; letter-spacing: 0.05em;
    text-transform: uppercase; color: var(--t3, var(--text-muted));
  }
  .ed-menu-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 6px 8px;
    border: none; background: transparent; border-radius: 8px;
    color: var(--t1, var(--text)); text-align: start; cursor: pointer;
  }
  .ed-menu-item.is-active { background: var(--wash); }
  .ed-menu-ic {
    flex: 0 0 auto;
    width: 34px; height: 34px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--border); border-radius: 7px;
    background: var(--surface-2, color-mix(in srgb, var(--t1, var(--text)) 3%, transparent));
    color: var(--t2, var(--text-secondary));
  }
  .ed-menu-item.is-active .ed-menu-ic { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
  .ed-menu-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .ed-menu-title { font-size: var(--text-base); font-weight: 500; }
  .ed-menu-desc {
    font-size: var(--text-xs); color: var(--t3, var(--text-muted));
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ed-menu-item--link { padding: 8px; }
  .ed-menu-item--link .ed-menu-ic { width: 28px; height: 28px; }

  @keyframes ed-pop {
    from { opacity: 0; transform: translate(-50%, calc(-100% - 8px)) scale(0.97); }
  }
  @keyframes ed-pop-menu {
    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  }
  @keyframes ed-fade { from { opacity: 0; } }
  @keyframes ed-pulse { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .ed-bubble, .ed-menu, .ed-save { animation: none; }
    .ed-save-dot { animation: none; }
  }
  @media (max-width: 640px) {
    .ed-scroll { padding-inline: var(--space-4, 16px); }
    .ed-gutter { display: none; }
  }
</style>
