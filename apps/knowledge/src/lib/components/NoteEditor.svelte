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
  import { tick, onMount, onDestroy } from 'svelte'
  import { LifeOsSheet } from '@life-os/platform-web/svelte/overlay'
  import Menu from '@life-os/platform-web/svelte/menu'
  import {
    Bold, Italic, Code, Strikethrough, Link2, Type, Heading1, Heading2,
    Heading3, List, ListOrdered, CheckSquare, Quote, Minus, GripVertical,
    Plus, FileCode, Eye, Pin, Trash2, Check, MoreHorizontal,
    Info, Lightbulb, TriangleAlert, OctagonAlert, Table,
  } from '@lucide/svelte'
  import {
    markdownToBlocks, blocksToMarkdown, makeBlock, newBlockId, firstHeadingMatchesTitle,
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
  import { S, resolveWikilink } from '$lib/state.svelte.js'
  import { metaWhen } from '$lib/format.js'
  import CategoryChip from '$lib/components/CategoryChip.svelte'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{
   *   item: any | null,
   *   titles?: string[],
   *   inline?: boolean,
   *   onClose?: () => void,
   *   onSave: (patch: { title: string, body: string }, item: any) => void,
   *   onDelete: (item: any) => void,
   *   onTogglePin: (item: any) => void,
   *   onOpenNote?: (item: any) => void,
   * }}
   * inline=true 时渲染为内联文档面板（master-detail 工作台），否则弹窗（LifeOsSheet）。
   * onSave/onDelete/onTogglePin 都带 item —— 内联切换笔记时要把「上一条」落到正确对象。
   * onOpenNote：正文内 [[双链]] 点击→解析→跳到目标笔记（工作台切换选中）。
   */
  let { item, titles = [], inline = false, onClose, onSave, onDelete, onTogglePin, onOpenNote, footer } = $props()

  /** 正文 [[wikilink]] 点击委托（内联工作台用）：resolve 后交给工作台切换选中。 */
  function onBodyClick(e) {
    if (!onOpenNote) return
    const a = e.target.closest('a.wikilink')
    if (!a) return
    e.preventDefault()
    const found = resolveWikilink(a.dataset.target || a.dataset.wikilink || a.textContent)
    if (found) onOpenNote(found)
  }

  let title = $state('')
  let blocks = $state([makeBlock('paragraph', '')])
  // 首个 H1 与标题重复时，渲染层隐藏它（title 输入框才是唯一标题；markdown 不动）。
  const dupHeadingId = $derived(
    firstHeadingMatchesTitle(blocks, title) ? blocks[0].id : null,
  )
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
  let loadedTitle = '' // 载入时快照（判脏，避免只看不改也 bump updatedAt）
  let loadedBody = ''
  let titleEl = $state(null)
  $effect(() => {
    const cur = item
    if (cur === loadedRef) return
    // 内联：切走前先把「上一条」落盘（防抖可能还没触发）或弃空草稿
    if (inline && loadedRef) commitTo(loadedRef)
    loadedRef = cur
    if (!cur) return
    title = cur.title || ''
    blocks = markdownToBlocks(cur.body || '')
    loadedTitle = title
    loadedBody = blocksToMarkdown(blocks) // 归一化后的基准（往返稳定）
    mode = 'wysiwyg'
    sourceText = ''
    confirmDelete = false
    closeMenus()
    // 内联无焦点陷阱：显式聚焦（空笔记→标题；否则→首块）
    if (inline) {
      const isBlank = !cur.title && !(cur.body || '').trim()
      // 首块是被隐藏的重复 H1 时，焦点落到下一个可见块
      const skip = firstHeadingMatchesTitle(blocks, title) ? 1 : 0
      const focusTarget = blocks[skip] || blocks[0]
      tick().then(() => {
        if (isBlank) titleEl?.focus()
        else if (focusTarget) focusBlock(focusTarget.id, 'start')
      })
    }
  })

  // 内联卸载时落盘最后一条（防抖窗口内的编辑不丢）
  onDestroy(() => {
    if (inline && loadedRef) commitTo(loadedRef)
  })

  // 硬刷新 / 关标签 / 切到后台：onDestroy 不触发，防抖窗口内的编辑会丢。
  // 用 pagehide + visibilitychange(hidden) 同步落盘待写内容（只 flush 不弃空）。
  onMount(() => {
    const flush = () => { if (saveState === 'saving') flushSave() }
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  })

  /** 把当前编辑内容提交到 target：全空→弃（onDelete）；无改动→跳过（不 bump updatedAt）；否则保存。 */
  function commitTo(target) {
    if (!target) return
    clearTimeout(saveTimer)
    const body = currentBody()
    if (!title.trim() && !body.trim()) { onDelete(target); return }
    if (title === loadedTitle && body === loadedBody) return // 只看没改，不动
    onSave({ title: title.trim() || t('library.typeNote'), body }, target)
  }

  /** 保存失败后点「重试」：立即把当前内容重推一次（持久层会重置 S.saveError）。 */
  function retrySave() {
    if (!item) return
    onSave({ title: title.trim() || t('library.typeNote'), body: currentBody() }, item)
  }

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
    onSave({ title: title.trim() || t('library.typeNote'), body: currentBody() }, item)
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

  /* ============ 表格块（编辑网格）============ */
  // 单元格 DOM 表：`${blockId}:${r}:${c}` → contenteditable（供 Tab/箭头/结构变动后聚焦）。
  const cellNodes = new Map()
  /** 单元格可编辑动作：初次按坐标从模型灌 inline HTML；结构变动整表换 id 重挂载即自然重灌。 */
  function tableCell(node, params) {
    let key
    const apply = (p) => {
      key = `${p.blockId}:${p.r}:${p.c}`
      const b = blocks[indexOfBlock(p.blockId)]
      node.innerHTML = mdInlineToHtml(b?.meta?.rows?.[p.r]?.[p.c] ?? '') || ''
      cellNodes.set(key, node)
    }
    apply(params)
    return { destroy() { cellNodes.delete(key) } }
  }
  function focusCell(blockId, r, c) {
    const node = cellNodes.get(`${blockId}:${r}:${c}`)
    if (node) setCaretEnd(node)
  }
  function onCellInput(block, r, c, el) {
    const i = indexOfBlock(block.id)
    if (i < 0) return
    blocks[i].meta.rows[r][c] = readBlockMarkdown(el) // 就地写模型，不重灌单元格（保光标）
    scheduleSave()
  }
  function onCellKeydown(block, r, c, e) {
    const i = indexOfBlock(block.id)
    if (i < 0) return
    const rows = blocks[i].meta.rows
    const R = rows.length
    const C = rows[0].length
    if (e.key === 'Tab') {
      e.preventDefault()
      let nr = r
      let nc = c + (e.shiftKey ? -1 : 1)
      if (nc >= C) { nc = 0; nr = r + 1 }
      if (nc < 0) { nc = C - 1; nr = r - 1 }
      if (nr >= R) { addTableRow(block, R); return } // 末格 Tab → 追加一行
      if (nr < 0) return
      focusCell(block.id, nr, nc)
    } else if (e.key === 'Enter') {
      e.preventDefault() // 单元格不换行：下移，末行则追加
      if (r + 1 < R) focusCell(block.id, r + 1, c)
      else addTableRow(block, R)
    }
  }
  /** 改结构：拷贝 rows/align、施加 fn、整表换 id 重挂载（避免按索引 key 的残影）。 */
  function tableUpdate(block, fn) {
    const i = indexOfBlock(block.id)
    if (i < 0) return null
    const rows = blocks[i].meta.rows.map((r) => [...r])
    const align = [...(blocks[i].meta.align || [])]
    fn(rows, align)
    const nb = makeBlock('table', '', { meta: { rows, align } })
    blocks[i] = nb
    scheduleSave()
    return nb
  }
  function addTableRow(block, at) {
    const cols = block.meta.rows[0].length
    const idx = at ?? block.meta.rows.length
    const nb = tableUpdate(block, (rows) => rows.splice(idx, 0, Array(cols).fill('')))
    if (nb) tick().then(() => focusCell(nb.id, idx, 0))
  }
  function addTableCol(block) {
    const newC = block.meta.rows[0].length
    const nb = tableUpdate(block, (rows, align) => { rows.forEach((r) => r.push('')); align.push(null) })
    if (nb) tick().then(() => focusCell(nb.id, 0, newC))
  }
  function delTableRow(block, r) {
    if (block.meta.rows.length <= 1) return // 至少留表头
    tableUpdate(block, (rows) => rows.splice(r, 1))
  }
  function delTableCol(block, c) {
    if (block.meta.rows[0].length <= 1) return
    tableUpdate(block, (rows, align) => { rows.forEach((row) => row.splice(c, 1)); align.splice(c, 1) })
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
    { key: 'table', icon: Table, label: () => t('editor.slTable'), desc: () => t('editor.slTableD'), type: 'table' },
    { key: 'c-note', icon: Info, label: () => t('editor.slCalloutNote'), desc: () => t('editor.slCalloutNoteD'), type: 'callout', meta: { callout: 'note' } },
    { key: 'c-tip', icon: Lightbulb, label: () => t('editor.slCalloutTip'), desc: () => t('editor.slCalloutTipD'), type: 'callout', meta: { callout: 'tip' } },
    { key: 'c-warning', icon: TriangleAlert, label: () => t('editor.slCalloutWarn'), desc: () => t('editor.slCalloutWarnD'), type: 'callout', meta: { callout: 'warning' } },
    { key: 'c-danger', icon: OctagonAlert, label: () => t('editor.slCalloutDanger'), desc: () => t('editor.slCalloutDangerD'), type: 'callout', meta: { callout: 'danger' } },
    { key: 'divider', icon: Minus, label: () => t('editor.slDivider'), desc: () => t('editor.slDividerD'), type: 'divider' },
  ]
  let slash = $state({ open: false, x: 0, y: 0, query: '', index: 0, blockId: null })
  let slashViaPlus = false // 本次斜杠菜单是否由「+」按钮开启（决定放弃时是否清裸「/」）
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
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSlash(); return true }
    return false
  }
  function pickSlash(sel) {
    if (!sel) return
    slashViaPlus = false
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
    } else if (sel.key === 'table') {
      // 起手 3 列 × 3 行（空表头 + 2 空行，表头行加粗+底纹即足够提示），焦点落首格
      const nb = replaceBlock(i, 'table', '', {
        meta: { rows: [['', '', ''], ['', '', ''], ['', '', '']], align: [null, null, null] },
      })
      tick().then(() => focusCell(nb.id, 0, 0))
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
    slashViaPlus = false
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
  // 点「+」= 在下方插入新块并直接唤出「块类型菜单」（复用斜杠菜单：同一套 hover/键盘/Esc/slash）。
  // 预置一个「/」等同用户在新块打斜杠；菜单锚定到加号右下方（非漂在正文中部）。
  function addBlockAfter(block, ev) {
    const i = indexOfBlock(block.id)
    const nb = makeBlock('paragraph', '/')
    blocks.splice(i + 1, 0, nb)
    pendingFocus = { id: nb.id, at: 'end' }
    const r = ev?.currentTarget?.getBoundingClientRect()
    slashViaPlus = true
    tick().then(() => {
      slash = { open: true, x: r ? r.left : 0, y: r ? r.bottom + 6 : 0, query: '', index: 0, blockId: nb.id }
    })
  }
  /** 关闭斜杠菜单；若是「+」开启且新块只剩裸「/」，清掉避免残留用户没打过的字符。 */
  function closeSlash() {
    const bid = slash.blockId
    slash = { ...slash, open: false }
    if (slashViaPlus) {
      const i = indexOfBlock(bid)
      if (i >= 0 && blocks[i].text === '/') {
        replaceBlock(i, 'paragraph', '')
        pendingFocus = { id: blocks[i].id, at: 'start' }
      }
    }
    slashViaPlus = false
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

  /* ============ 关闭前落盘（弹窗模式）============ */
  function close() {
    // 标题正文都空 → 视为放弃草稿，静默丢弃（不留 Untitled 空文件），对齐 Apple Notes/Bear 惯例。
    if (!title.trim() && !currentBody().trim()) {
      clearTimeout(saveTimer)
      onDelete(item)
      return
    }
    flushSave()
    onClose?.()
  }
  function remove() {
    if (!confirmDelete) { confirmDelete = true; return }
    clearTimeout(saveTimer)
    onDelete(item)
  }

  /* ============ 顶栏「···」菜单 ============ */
  const menuItems = $derived([
    { id: 'source', label: mode === 'source' ? t('editor.wysiwyg') : t('editor.source') },
    { id: 'pin', label: item?.pinned ? t('common.unpin') : t('common.pin') },
    { id: 'delete', label: t('common.delete'), danger: true },
  ])
  function onMenuSelect(id) {
    if (id === 'source') toggleMode()
    else if (id === 'pin') onTogglePin(item)
    else if (id === 'delete') confirmDelete = true
  }

  // 全局选区监听（工具条）
  $effect(() => {
    if (!item) return
    const handler = () => refreshToolbar()
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  })

  const CALLOUT_ICON = { note: Info, info: Info, tip: Lightbulb, warning: TriangleAlert, danger: OctagonAlert }

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

{#snippet topbarUi()}
  <div class="ed-topbar">
    <div class="ed-topbar__inner">
      {#if S.saveError}
        <button type="button" class="ed-save is-error" onclick={retrySave} aria-live="polite">
          <TriangleAlert size={13} strokeWidth={2.2} />
          {t('editor.saveFailed')}
        </button>
      {:else}
        <span class="ed-save" class:is-saving={saveState === 'saving'} aria-live="polite">
          {#if saveState === 'saving'}
            <span class="ed-save-dot"></span>{t('editor.saving')}
          {:else}
            <Check class="ed-save-ic" size={13} strokeWidth={2.6} />{t('editor.saved')}
          {/if}
        </span>
      {/if}
      <div class="ed-spacer"></div>
      {#if item?.pinned}
        <span class="ed-pinned" title={t('common.unpin')}><Pin size={13} fill="currentColor" /></span>
      {/if}
      <Menu items={menuItems} onselect={onMenuSelect} align="end" ariaLabel={t('editor.more')}>
        {#snippet trigger({ open, toggle })}
          <button type="button" class="ed-icon" onclick={toggle} aria-expanded={open} title={t('editor.more')}>
            <MoreHorizontal size={18} />
          </button>
        {/snippet}
      </Menu>
    </div>
  </div>
  {#if confirmDelete}
    <div class="ed-confirm" role="alertdialog">
      <span>{t('editor.confirmDeleteQ')}</span>
      <button type="button" class="ed-confirm__cancel" onclick={() => (confirmDelete = false)}>{t('common.cancel')}</button>
      <button type="button" class="ed-confirm__go" onclick={() => onDelete(item)}>{t('common.delete')}</button>
    </div>
  {/if}
{/snippet}

{#snippet bodyUi()}
  {#if item}
    <div class="ed-scroll">
      <div class="ed-canvas">
        <input
          class="ed-title"
          bind:this={titleEl}
          bind:value={title}
          oninput={scheduleSave}
          placeholder={t('editor.titlePlaceholder')}
          aria-label={t('library.fieldTitle')}
        />
        {#if item.updatedAt || item.tags?.length}
          <div class="ed-meta">
            {#if item.updatedAt}<span class="ed-meta__time">{metaWhen(item.updatedAt)}</span>{/if}
            {#each (item.tags || []).slice(0, 6) as tag (tag)}<CategoryChip {tag} />{/each}
          </div>
        {/if}

        {#if mode === 'source'}
          <textarea class="ed-source" value={sourceText} oninput={onSourceInput} spellcheck="false" aria-label={t('editor.source')}></textarea>
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="ed-blocks" onclick={onBodyClick}>
            {#each blocks as block, i (block.id)}
              {#if block.id !== dupHeadingId}
              <div
                class="ed-row ed-row--{block.type}"
                class:is-drop={dropId === block.id}
                class:is-drag={dragId === block.id}
                ondragover={(e) => onDragOver(block, e)}
                ondrop={(e) => onDrop(block, e)}
                role="listitem"
              >
                <div class="ed-gutter">
                  <button type="button" class="ed-handle" title={t('editor.addBlock')} onclick={(e) => addBlockAfter(block, e)} tabindex="-1"><Plus size={15} /></button>
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
                  {:else if block.type === 'callout'}
                    {@const CalloutIcon = CALLOUT_ICON[block.meta?.callout || 'note']}
                    <div class="ed-callout ed-callout--{block.meta?.callout || 'note'}">
                      <span class="ed-callout__icon" aria-hidden="true"><CalloutIcon size={17} /></span>
                      <div
                        class="ed-edit ed-edit--callout"
                        contenteditable="true"
                        role="textbox" tabindex="0" aria-multiline="false"
                        data-ph={t('editor.blockPlaceholder')}
                        use:editable={block}
                        oninput={(e) => onInput(block, e.currentTarget, e)}
                        onkeydown={(e) => onKeydown(block, e.currentTarget, e)}
                      ></div>
                    </div>
                  {:else if block.type === 'table'}
                    {@const rows = block.meta?.rows || []}
                    {@const cols = rows[0]?.length || 0}
                    <div class="ed-tablewrap">
                      <div class="ed-tablescroll">
                        <table class="ed-table">
                          <tbody>
                            {#each rows as row, r (r)}
                              <tr class="ed-tr">
                                {#each row as _cell, c (c)}
                                  <svelte:element this={r === 0 ? 'th' : 'td'} class="ed-td">
                                    <div
                                      class="ed-cell"
                                      contenteditable="true"
                                      role="textbox" tabindex="0" aria-multiline="false"
                                      use:tableCell={{ blockId: block.id, r, c }}
                                      oninput={(e) => onCellInput(block, r, c, e.currentTarget)}
                                      onkeydown={(e) => onCellKeydown(block, r, c, e)}
                                    ></div>
                                    {#if r === 0}
                                      <button type="button" class="ed-tdel ed-tdel--col" tabindex="-1"
                                        title={t('editor.tableDelCol')} onmousedown={(e) => { e.preventDefault(); delTableCol(block, c) }}
                                        aria-label={t('editor.tableDelCol')}><Trash2 size={11} /></button>
                                    {/if}
                                    {#if c === 0 && r > 0}
                                      <button type="button" class="ed-tdel ed-tdel--row" tabindex="-1"
                                        title={t('editor.tableDelRow')} onmousedown={(e) => { e.preventDefault(); delTableRow(block, r) }}
                                        aria-label={t('editor.tableDelRow')}><Trash2 size={11} /></button>
                                    {/if}
                                  </svelte:element>
                                {/each}
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                      <button type="button" class="ed-tadd ed-tadd--col" tabindex="-1"
                        title={t('editor.tableAddCol')} onmousedown={(e) => { e.preventDefault(); addTableCol(block) }}
                        aria-label={t('editor.tableAddCol')}><Plus size={13} /></button>
                      <button type="button" class="ed-tadd ed-tadd--row" tabindex="-1"
                        title={t('editor.tableAddRow')} onmousedown={(e) => { e.preventDefault(); addTableRow(block) }}
                        aria-label={t('editor.tableAddRow')}><Plus size={13} /></button>
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
              {/if}
            {/each}
          </div>
        {/if}
        {@render footer?.()}
      </div>
    </div>
  {/if}
{/snippet}

{#if inline}
  <div class="ed-pane">
    {@render topbarUi()}
    {@render bodyUi()}
  </div>
{:else}
  <LifeOsSheet
    open={Boolean(item)}
    onClose={close}
    ariaLabel={title}
    sheetClass="note-editor"
    closeOnBackdrop={false}
  >
    {#snippet header()}{@render topbarUi()}{/snippet}
    {@render bodyUi()}
    {#snippet actions()}
      <button type="button" class="btn-primary" onclick={close}>{t('common.save')}</button>
    {/snippet}
  </LifeOsSheet>
{/if}

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

  /* 内联文档面板（master-detail 工作台）：复刻弹窗的满高 flex-column + 设计 token */
  .ed-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    --wash: color-mix(in srgb, var(--t1, var(--text)) 6%, transparent);
    --wash-strong: color-mix(in srgb, var(--t1, var(--text)) 10%, transparent);
    --pop-shadow: 0 0 0 1px color-mix(in srgb, var(--t1, var(--text)) 6%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.12), 0 12px 32px rgba(0, 0, 0, 0.18);
  }
  /* 内联顶栏：左右 padding 与写作画布同源（64px），内容再收进 720 测量列 →
     「已保存」贴文档左缘、置顶/··· 贴文档右缘，不再是横跨 viewport 的两座孤岛 */
  .ed-pane .ed-topbar {
    padding: var(--space-3, 12px) 64px var(--space-1, 4px);
    border-bottom: 1px solid var(--border);
  }
  .ed-pane .ed-topbar__inner {
    max-width: 720px;
    margin-inline: auto;
  }

  /* 标题下的元信息行（更新日期 · 标签）——与标题近、与正文远 */
  .ed-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1-5, 6px);
    margin-bottom: 30px;
  }
  .ed-meta__time {
    font-size: var(--text-sm, 12px);
    color: var(--t3, var(--text-muted));
  }
  .ed-meta__time::after {
    content: '·';
    margin-inline-start: var(--space-1-5, 6px);
    color: color-mix(in srgb, var(--t3, var(--text-muted)) 60%, transparent);
  }
  .ed-meta__time:only-child::after { content: none; }

  /* ——— 顶栏 ——— */
  .ed-topbar {
    padding-bottom: var(--space-1);
  }
  .ed-topbar__inner {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
  }
  .ed-spacer { flex: 1; }
  .ed-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px;
    border: none; background: transparent;
    color: var(--t3, var(--text-muted)); border-radius: var(--radius-control, 8px);
    cursor: pointer; transition: background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  }
  .ed-icon:hover { background: var(--wash); color: var(--t1, var(--text)); }
  /* 保存状态：常显（✓已保存 / 正在保存… / 保存失败·重试），左侧指示这是编辑器 */
  .ed-save {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: var(--text-xs); font-weight: 500;
    color: var(--t2, var(--text-secondary));
    border: none; background: transparent; padding: 0; font-family: inherit;
  }
  .ed-save :global(.ed-save-ic) { color: var(--feedback-success); }
  .ed-save-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent);
  }
  .ed-save.is-saving { color: var(--t2, var(--text-secondary)); }
  .ed-save.is-saving .ed-save-dot {
    animation: ed-pulse 1s ease-in-out infinite;
  }
  .ed-save.is-error {
    color: var(--feedback-danger);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ed-save.is-error:hover { filter: brightness(1.1); }
  .ed-save.is-error:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-control); }
  .ed-pinned { display: inline-flex; align-items: center; color: var(--accent); padding-inline: 2px; }

  /* 删除确认条 */
  .ed-confirm {
    display: flex; align-items: center; gap: var(--space-2);
    margin: var(--space-2) var(--space-5) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control, 8px);
    background: var(--feedback-danger-bg);
    color: var(--t1, var(--text)); font-size: var(--text-sm);
  }
  .ed-confirm span { flex: 1; }
  .ed-confirm button {
    border: none; border-radius: var(--radius-control, 8px);
    padding: 4px 12px; font-size: var(--text-sm); cursor: pointer;
  }
  .ed-confirm__cancel { background: transparent; color: var(--t2, var(--text-secondary)); }
  .ed-confirm__go { background: var(--feedback-danger); color: white; font-weight: 600; }

  /* ——— 滚动区 + 居中测量列（写作画布）——— */
  .ed-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: clip;
    padding: var(--space-5, 20px) 64px 34vh;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--t1, var(--text)) 16%, transparent) transparent;
  }
  .ed-canvas {
    max-width: 720px;
    margin-inline: auto;
  }

  .ed-title {
    width: 100%;
    border: none; background: transparent; outline: none;
    font-family: inherit;
    font-size: 2.15rem; font-weight: 750; line-height: 1.25;
    letter-spacing: -0.01em;
    color: var(--t1, var(--text));
    padding: 0 0 var(--space-3, 12px);
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
  .ed-blocks { font-size: var(--text-xl, 16px); line-height: 1.72; caret-color: var(--accent); }
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
  .ed-row--code:hover > .ed-block,
  .ed-row--table:hover > .ed-block { background: transparent; }

  .ed-edit {
    flex: 1; min-width: 0; outline: none;
    color: var(--t1, var(--text));
    white-space: pre-wrap; word-break: break-word;
    cursor: text; /* 始终可编辑：文本光标 + 悬浮块底纹（.ed-block）明示「点即改」 */
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

  /* Callout 高亮块：背景更淡（8%），辨识主要靠左边框 + 图标，避免连续堆叠像 alert 面板 */
  .ed-callout {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius-control, 8px);
    border-inline-start: 3px solid var(--cl-line, var(--cl));
    background: color-mix(in srgb, var(--cl) 8%, transparent);
  }
  .ed-callout__icon {
    flex: 0 0 auto;
    display: inline-flex;
    color: var(--cl-line, var(--cl));
    margin-top: 2px;
  }
  .ed-callout .ed-edit { flex: 1; min-width: 0; }
  .ed-callout--note, .ed-callout--info { --cl: var(--chart-hue-blue); }
  .ed-callout--tip { --cl: var(--chart-hue-green); }
  /* 黄色在米白底上对比最弱：边框/图标向文字色加深一档（背景仍浅） */
  .ed-callout--warning {
    --cl: var(--chart-hue-yellow);
    --cl-line: color-mix(in srgb, var(--chart-hue-yellow) 68%, var(--t1, var(--text)));
  }
  .ed-callout--danger { --cl: var(--chart-hue-red); }

  /* 表格块（可编辑网格）—— 悬浮才露增删控件，静态干净 */
  .ed-tablewrap {
    position: relative;
    flex: 1;
    min-width: 0;
    padding-right: 18px;  /* 右侧「加列」留位 */
    padding-bottom: 16px; /* 底部「加行」留位 */
  }
  .ed-tablescroll { overflow-x: auto; scrollbar-width: thin; border-radius: var(--radius-control, 8px); }
  .ed-table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-base, 14px);
    line-height: 1.5;
  }
  .ed-td {
    position: relative;
    border: 1px solid var(--border);
    padding: 0;
    vertical-align: top;
    min-width: 84px;
  }
  .ed-table th.ed-td {
    background: color-mix(in srgb, var(--t1, var(--text)) 4%, transparent);
    font-weight: 650;
    text-align: start;
  }
  .ed-cell {
    padding: 7px 10px;
    min-height: 1.5em;
    outline: none;
    cursor: text;
    color: var(--t1, var(--text));
    word-break: break-word;
  }
  .ed-cell:focus { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); border-radius: 3px; }
  /* 删除行/列的小按钮：悬浮单元格才显 */
  .ed-tdel {
    position: absolute;
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--wash-strong, var(--bg));
    color: var(--t3, var(--text-muted));
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
    z-index: 2;
  }
  .ed-tdel:hover { color: var(--feedback-danger); border-color: var(--feedback-danger); }
  .ed-tdel--col { top: -10px; inset-inline-end: 3px; }
  .ed-tdel--row { top: 50%; inset-inline-start: -10px; transform: translateY(-50%); }
  .ed-td:hover > .ed-tdel, .ed-cell:focus ~ .ed-tdel { opacity: 1; }
  /* 加行/加列 */
  .ed-tadd {
    position: absolute;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px dashed color-mix(in srgb, var(--t1, var(--text)) 22%, transparent);
    border-radius: var(--radius-control, 8px);
    background: transparent;
    color: var(--t3, var(--text-muted));
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease), background var(--motion-fast) var(--ease), color var(--motion-fast) var(--ease);
  }
  .ed-tadd:hover { background: var(--wash); color: var(--t1, var(--text)); }
  .ed-tadd--col { top: 0; bottom: 16px; inset-inline-end: 0; width: 15px; }
  .ed-tadd--row { inset-inline: 0 18px; bottom: 0; height: 13px; }
  .ed-tablewrap:hover .ed-tadd { opacity: 1; }

  /* 行内格式 */
  .ed-edit :global(strong) { font-weight: 700; }
  .ed-edit :global(mark), .ed-cell :global(mark) {
    background: color-mix(in srgb, var(--chart-hue-yellow) 30%, transparent);
    color: inherit;
    border-radius: 3px;
    padding: 0 2px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
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
