/**
 * Universal repeating-region detection + scoped control mapping.
 * Site-agnostic: lists, articles, table rows, card grids.
 */
;(function initWsdRegionScoper() {
  const INTERACTIVE_SEL =
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])'

  function core() {
    return window.__WSD_CORE__
  }

  function text(el) {
    return el?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) || ''
  }

  function isVisible(el) {
    return core()?.isVisible?.(el) ?? false
  }

  function bestSelector(el) {
    return core()?.bestSelector(el) || el?.tagName?.toLowerCase() || ''
  }

  /** Smallest selector that picks exactly this element among siblings */
  function scopedSelector(container, el) {
    const base = bestSelector(container)
    const ctrl = bestSelector(el)
    if (!base || !ctrl) return ctrl || base

    const same = container.querySelectorAll(ctrl)
    if (same.length === 1) return `${base} ${ctrl}`

    const idx = [...same].indexOf(el)
    if (idx >= 0) return `${base} ${ctrl}:nth-of-type(${idx + 1})`

    const all = container.querySelectorAll(INTERACTIVE_SEL)
    const i = [...all].indexOf(el)
    if (i >= 0) {
      const tag = el.tagName.toLowerCase()
      return `${base} ${tag}:nth-of-type(${i + 1})`
    }
    return `${base} ${ctrl}`
  }

  function inferIntent(el, label) {
    const l = (label || '').toLowerCase()
    const href = el.getAttribute('href') || el.href || ''
    if (el.tagName === 'A' && href && href !== '#') {
      if (/detail|view|edit|open|read more/i.test(l)) return 'open_detail'
      if (/track|status|shipping/i.test(l)) return 'track'
      return 'navigate'
    }
    if (/expand|show|more|load/i.test(l)) return 'reveal'
    if (el.getAttribute('aria-expanded') === 'false') return 'expand'
    if (el.type === 'submit' || /submit|save|confirm/i.test(l)) return 'submit'
    if (/search|find/i.test(l) || el.type === 'search') return 'search'
    if (/delete|remove|cancel/i.test(l)) return 'destructive'
    return 'activate'
  }

  function collectItemActions(container, itemEl) {
    const actions = []
    const seen = new Set()
    for (const el of itemEl.querySelectorAll(INTERACTIVE_SEL)) {
      if (!isVisible(el)) continue
      const label = core()?.getAccessibleName?.(el) || text(el).slice(0, 80)
      if (!label || seen.has(label)) continue
      seen.add(label)
      const href = el.href || el.getAttribute('href') || undefined
      actions.push({
        label,
        intent: inferIntent(el, label),
        globalSelector: bestSelector(el),
        scopedSelector: scopedSelector(itemEl, el),
        containerSelector: bestSelector(itemEl),
        tag: el.tagName.toLowerCase(),
        href: href && href !== '#' ? href : undefined,
        ariaExpanded: el.getAttribute('aria-expanded') || undefined,
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        reliability: href || el.getAttribute('data-testid') ? 0.85 : 0.65,
      })
    }
    return actions.slice(0, 20)
  }

  function itemPreview(itemEl) {
    const heading = itemEl.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]')
    const link = itemEl.querySelector('a[href]')
    return {
      title: text(heading) || text(link).slice(0, 120) || text(itemEl).slice(0, 120),
      linkHref: link?.href,
    }
  }

  /** Detect repeating siblings under a list-like parent */
  function findRegionGroups() {
    const groups = []
    const seen = new WeakSet()

    const listParents = document.querySelectorAll(
      'ul, ol, [role="list"], [role="grid"], [role="tree"], table tbody, [data-testid*="list" i]',
    )

    for (const parent of listParents) {
      if (!isVisible(parent)) continue
      let items = [...parent.children].filter(
        (c) => c.nodeType === Node.ELEMENT_NODE && isVisible(c),
      )
      if (items.length < 2) {
        items = [...parent.querySelectorAll('[role="listitem"], li, tr, article')]
          .filter(isVisible)
          .filter((el) => parent.contains(el))
      }
      if (items.length < 2) continue
      if (seen.has(parent)) continue
      seen.add(parent)

      const role =
        parent.getAttribute('role') ||
        (parent.tagName === 'TBODY' ? 'rowgroup' : parent.tagName.toLowerCase())

      groups.push({
        id: `region-${groups.length + 1}`,
        role,
        label:
          core()?.getAccessibleName?.(parent) ||
          parent.getAttribute('aria-label') ||
          parent.id ||
          role,
        containerSelector: bestSelector(parent),
        itemCount: items.length,
        items: items.slice(0, 50).map((itemEl, index) => ({
          index,
          containerSelector: bestSelector(itemEl),
          preview: itemPreview(itemEl),
          actions: collectItemActions(parent, itemEl),
        })),
      })
    }

    // Card grids: 3+ siblings with similar tag and interactive content
    const cardCandidates = document.querySelectorAll(
      '[class*="card" i], [class*="item" i], [data-testid*="card" i], [data-testid*="item" i], article',
    )
    const byParent = new Map()
    for (const el of cardCandidates) {
      if (!isVisible(el)) continue
      const p = el.parentElement
      if (!p || !isVisible(p)) continue
      if (!byParent.has(p)) byParent.set(p, [])
      byParent.get(p).push(el)
    }
    for (const [parent, items] of byParent) {
      if (items.length < 2 || seen.has(parent)) continue
      const tags = new Set(items.map((i) => i.tagName))
      if (tags.size > 2) continue
      seen.add(parent)
      groups.push({
        id: `region-${groups.length + 1}`,
        role: 'card-grid',
        label: parent.getAttribute('aria-label') || parent.id || 'card-grid',
        containerSelector: bestSelector(parent),
        itemCount: items.length,
        items: items.slice(0, 50).map((itemEl, index) => ({
          index,
          containerSelector: bestSelector(itemEl),
          preview: itemPreview(itemEl),
          actions: collectItemActions(parent, itemEl),
        })),
      })
    }

    return groups
  }

  function collectDisclosures(limit = 40) {
    const out = []
    const deep = window.__WSD_DEEP_DOM__
    const nodes = deep
      ? deep.deepQueryAll('[aria-expanded], details, [data-state="closed"], [data-state="open"]')
      : [...document.querySelectorAll('[aria-expanded], details, [data-state="closed"], [data-state="open"]')]

    for (const el of nodes) {
      if (!isVisible(el) && el.getAttribute('aria-expanded') !== 'false') continue
      const label = core()?.getAccessibleName?.(el) || text(el).slice(0, 80)
      const entry = {
        kind: el.tagName === 'DETAILS' ? 'details' : 'disclosure',
        label,
        bestSelector: bestSelector(el),
        ariaExpanded: el.getAttribute('aria-expanded') || undefined,
        open: el.tagName === 'DETAILS' ? el.open : undefined,
        dataState: el.getAttribute('data-state') || undefined,
        collapsed: el.getAttribute('aria-expanded') === 'false' || (el.tagName === 'DETAILS' && !el.open),
      }
      out.push(entry)
      if (out.length >= limit) break
    }
    return out
  }

  function collectScrollHints() {
    const docH = document.documentElement.scrollHeight
    const viewH = window.innerHeight
    const scrollY = window.scrollY
    return {
      scrollY,
      scrollHeight: docH,
      viewportHeight: viewH,
      hasMoreBelow: scrollY + viewH < docH - 40,
      hasMoreAbove: scrollY > 40,
      scrollable: docH > viewH * 1.15,
      percentScrolled: docH > viewH ? Math.round((scrollY / (docH - viewH)) * 100) : 100,
    }
  }

  function buildSensorLayer() {
    return {
      regions: findRegionGroups(),
      disclosures: collectDisclosures(),
      scroll: collectScrollHints(),
    }
  }

  window.__WSD_REGION_SCOPER__ = { buildSensorLayer, findRegionGroups, collectDisclosures }
})()
