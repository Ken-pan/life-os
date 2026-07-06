/**
 * Snap v2 — accessibility-style tree with stable @ref ids (Playwright MCP compatible shape).
 */
;(function initAxSnap() {
  const SKIP_TAGS = new Set([
    'script',
    'style',
    'noscript',
    'svg',
    'path',
    'meta',
    'link',
  ])

  const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'checkbox',
    'radio',
    'textbox',
    'combobox',
    'listbox',
    'menuitem',
    'tab',
    'switch',
    'slider',
    'searchbox',
    'spinbutton',
    'option',
  ])

  const STRUCTURAL_ROLES = new Set([
    'heading',
    'list',
    'listitem',
    'table',
    'row',
    'cell',
    'columnheader',
    'rowheader',
    'navigation',
    'main',
    'form',
    'group',
    'region',
    'article',
    'banner',
    'contentinfo',
  ])

  const core = () => window.__WSD_CORE__

  function isVisible(el) {
    return core()?.isVisible?.(el) ?? false
  }

  function getName(el) {
    return core()?.getAccessibleName?.(el) || ''
  }

  function getSelector(el) {
    return core()?.bestSelector?.(el) || ''
  }

  function inputRole(el) {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'search') return 'searchbox'
    if (['button', 'submit', 'reset'].includes(type)) return 'button'
    return 'textbox'
  }

  function inferRole(el) {
    const explicit = el.getAttribute('role')
    if (explicit) return explicit
    const tag = el.tagName.toLowerCase()
    if (tag === 'a' && el.hasAttribute('href')) return 'link'
    if (tag === 'button') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') return inputRole(el)
    if (/^h[1-6]$/.test(tag)) return 'heading'
    if (tag === 'nav') return 'navigation'
    if (tag === 'main') return 'main'
    if (tag === 'form') return 'form'
    if (tag === 'table') return 'table'
    if (tag === 'tr') return 'row'
    if (tag === 'td' || tag === 'th')
      return tag === 'th' ? 'columnheader' : 'cell'
    if (tag === 'ul' || tag === 'ol') return 'list'
    if (tag === 'li') return 'listitem'
    if (tag === 'article') return 'article'
    return null
  }

  function shouldInclude(el, role, name) {
    if (!isVisible(el)) return false
    if (INTERACTIVE_ROLES.has(role)) return true
    if (STRUCTURAL_ROLES.has(role)) return true
    if (name && name.length <= 120) return true
    if (el.getAttribute('data-testid')) return true
    return false
  }

  function stateFlags(el) {
    const flags = []
    if (el.disabled || el.getAttribute('aria-disabled') === 'true')
      flags.push('disabled')
    if (el.checked) flags.push('checked')
    const expanded = el.getAttribute('aria-expanded')
    if (expanded === 'true') flags.push('expanded')
    if (expanded === 'false') flags.push('collapsed')
    if (el.getAttribute('aria-selected') === 'true') flags.push('selected')
    return flags
  }

  /**
   * @param {Element} [root]
   * @param {{ maxNodes?: number, maxDepth?: number }} [opts]
   */
  function buildSnapV2(root, opts = {}) {
    const maxNodes = opts.maxNodes ?? 400
    const maxDepth = opts.maxDepth ?? 12
    let nodeCount = 0
    let refCounter = 0
    /** @type {Record<string, unknown>} */
    const refs = {}
    const lines = []

    function visit(el, depth) {
      if (!el || nodeCount >= maxNodes || depth > maxDepth) return
      if (el.nodeType !== Node.ELEMENT_NODE) return
      const tag = el.tagName.toLowerCase()
      if (SKIP_TAGS.has(tag)) return

      const role = inferRole(el) || tag
      const name = getName(el).slice(0, 120)
      const include = shouldInclude(el, role, name)

      if (include) {
        nodeCount++
        const ref = `e${++refCounter}`
        const flags = stateFlags(el)
        const flagStr = flags.length ? ` [${flags.join(',')}]` : ''
        const label = name ? `"${name.replace(/"/g, "'")}"` : ''
        lines.push(
          `${'  '.repeat(depth)}- ${role} ${label} [ref=${ref}]${flagStr}`.trim(),
        )

        refs[ref] = {
          role,
          name: name || undefined,
          tag,
          scopedSelector: getSelector(el),
          href: tag === 'a' ? el.href : undefined,
          level: role === 'heading' ? Number(tag[1]) : undefined,
        }
      }

      const childDepth = include ? depth + 1 : depth
      for (const child of el.children) visit(child, childDepth)
      if (el.shadowRoot) {
        for (const child of el.shadowRoot.children) visit(child, childDepth)
      }
    }

    visit(root || document.body, 0)

    return {
      schema: 'web-state-devtools/snap/v2',
      axTree: lines.join('\n'),
      refs,
      stats: { nodeCount, refCount: refCounter },
    }
  }

  window.__WSD_AX_SNAP__ = { buildSnapV2 }
})()
