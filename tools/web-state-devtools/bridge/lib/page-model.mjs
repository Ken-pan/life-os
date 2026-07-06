/**
 * Universal page model — site-agnostic structure for agent reasoning.
 */

/**
 * @param {Record<string, unknown>} snapshot
 */
export function buildPageModel(snapshot) {
  const page = snapshot.page || {}
  const sensor = snapshot.sensor || {}
  const headings = snapshot.headings || []
  const forms = snapshot.forms || []
  const controls = snapshot.controls || []

  const pageType = inferPageType(snapshot)
  const primaryEntity = inferPrimaryEntity(snapshot, pageType)

  const regions = (sensor.regions || []).map((r) => ({
    id: r.id,
    role: r.role,
    label: r.label,
    containerSelector: r.containerSelector,
    itemsCountVisible: r.itemCount,
    items: (r.items || []).map((item) => ({
      index: item.index,
      containerSelector: item.containerSelector,
      preview: item.preview,
      actions: (item.actions || []).map((a) => ({
        label: a.label,
        intent: a.intent,
        scopedSelector: a.scopedSelector,
        globalSelector: a.globalSelector,
        href: a.href,
        reliability: a.reliability,
        ariaExpanded: a.ariaExpanded,
      })),
    })),
  }))

  const globalActions = buildGlobalActions(controls, snapshot.links || [])

  return {
    schema: 'web-state-devtools/page-model/v1',
    pageType,
    primaryEntity,
    navigation: {
      url: page.url,
      pathname: page.pathname,
      title: page.title,
    },
    scroll: sensor.scroll || null,
    disclosureCount: sensor.disclosures?.length ?? 0,
    collapsedDisclosures: (sensor.disclosures || []).filter((d) => d.collapsed).length,
    regions,
    globalActions: globalActions.slice(0, 40),
    stats: {
      regionCount: regions.length,
      scopedItemCount: regions.reduce((n, r) => n + (r.items?.length || 0), 0),
      scopedActionCount: regions.reduce(
        (n, r) => n + (r.items || []).reduce((m, i) => m + (i.actions?.length || 0), 0),
        0,
      ),
      formCount: forms.length,
      headingCount: headings.length,
    },
  }
}

/**
 * @param {Record<string, unknown>} snapshot
 */
function inferPageType(snapshot) {
  const path = (snapshot.page?.pathname || '').toLowerCase()
  const title = (snapshot.page?.title || '').toLowerCase()
  const forms = snapshot.forms || []
  const regions = snapshot.sensor?.regions || []
  const adapter = snapshot.adapter

  if (adapter?.entity) return `${adapter.site || 'site'}.${adapter.entity}.${adapter.items?.length > 1 ? 'list' : 'detail'}`
  if (/login|signin|sign-in|auth/.test(path)) return 'auth.login'
  if (/signup|register/.test(path)) return 'auth.signup'
  if (/settings|preferences|account/.test(path)) return 'settings'
  if (/search/.test(path) || forms.some((f) => f.fields?.some((fd) => fd.type === 'search')))
    return 'search'
  if (regions.some((r) => r.itemCount >= 2)) return 'list'
  if (forms.length >= 1 && regions.length === 0) return 'form'
  if (/detail|item|product|order/.test(path)) return 'detail'
  if (title.includes('dashboard') || path === '/' || path.endsWith('/')) return 'dashboard'
  return 'generic'
}

/**
 * @param {Record<string, unknown>} snapshot
 * @param {string} pageType
 */
function inferPrimaryEntity(snapshot, pageType) {
  if (snapshot.adapter?.entity) return snapshot.adapter.entity
  if (pageType.includes('list')) {
    const r = snapshot.sensor?.regions?.[0]
    if (r?.label) return String(r.label).toLowerCase().replace(/\s+/g, '-')
  }
  const h1 = snapshot.headings?.find((h) => h.level === 1)
  if (h1?.text) return h1.text.toLowerCase().slice(0, 40).replace(/\s+/g, '-')
  return undefined
}

/**
 * @param {Array<Record<string, unknown>>} controls
 * @param {Array<Record<string, unknown>>} links
 */
function buildGlobalActions(controls, links) {
  const actions = []
  const seen = new Set()

  for (const c of controls) {
    const label = c.name || c.type || c.tag
    if (!label || seen.has(label)) continue
    seen.add(label)
    actions.push({
      label,
      intent: inferControlIntent(c),
      selector: c.bestSelector || c.selector,
      role: c.role,
      tag: c.tag,
      ariaExpanded: c.ariaExpanded,
      disabled: c.disabled,
      scope: 'global',
      reliability: c.bestSelector?.includes('data-testid') ? 0.9 : 0.6,
    })
  }

  for (const l of links.slice(0, 15)) {
    if (!l.href || seen.has(l.href)) continue
    seen.add(l.href)
    actions.push({
      label: l.text || l.href,
      intent: 'navigate',
      selector: l.bestSelector || l.selector,
      href: l.href,
      scope: 'global',
      reliability: 0.75,
    })
  }

  return actions
}

/**
 * @param {Record<string, unknown>} c
 */
function inferControlIntent(c) {
  const label = (c.name || '').toLowerCase()
  if (c.ariaExpanded === 'false') return 'expand'
  if (/load more|show more|see more/i.test(label)) return 'reveal'
  if (/search/i.test(label) || c.type === 'search') return 'search'
  if (/filter|sort/i.test(label)) return 'filter'
  if (/submit|save|confirm/i.test(label)) return 'submit'
  if (/next|continue/i.test(label)) return 'paginate'
  if (/back|previous/i.test(label)) return 'back'
  return 'activate'
}
