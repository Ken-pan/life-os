/**
 * Universal exploration policy — suggest next actions for agent discovery.
 */

/**
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} pageModel
 */
export function buildExplorationCandidates(snapshot, pageModel) {
  /** @type {Array<Record<string, unknown>>} */
  const candidates = []
  const scroll = snapshot.sensor?.scroll || pageModel.scroll

  if (scroll?.scrollable && scroll.hasMoreBelow) {
    candidates.push({
      type: 'scroll',
      action: 'scroll',
      params: { preset: 'bottom' },
      reason: `Document scrollHeight (${scroll.scrollHeight}px) exceeds viewport; ${scroll.percentScrolled ?? 0}% scrolled`,
      priority: 0.92,
      id: 'explore-scroll-bottom',
    })
  }

  if (scroll?.scrollable && (scroll.percentScrolled ?? 0) < 30) {
    candidates.push({
      type: 'scroll',
      action: 'scroll',
      params: { y: 600 },
      reason: 'Sample mid-page content via incremental scroll',
      priority: 0.75,
      id: 'explore-scroll-mid',
    })
  }

  for (const d of snapshot.sensor?.disclosures || []) {
    if (!d.collapsed) continue
    candidates.push({
      type: 'click',
      action: 'click',
      params: { selector: d.bestSelector },
      reason: `Collapsed ${d.kind}: "${d.label || d.bestSelector}" may reveal hidden content`,
      priority: 0.88,
      id: `explore-expand-${candidates.length}`,
      expect: 'new_controls_or_text',
    })
  }

  for (const c of (snapshot.controls || []).filter((x) => x.ariaExpanded === 'false')) {
    candidates.push({
      type: 'click',
      action: 'click',
      params: { selector: c.bestSelector || c.selector },
      reason: `Control aria-expanded=false: ${c.name || c.bestSelector}`,
      priority: 0.86,
      id: `explore-aria-${candidates.length}`,
      expect: 'new_controls_or_text',
    })
  }

  for (const region of pageModel.regions || []) {
    for (const item of region.items || []) {
      for (const action of item.actions || []) {
        if (action.intent === 'open_detail' && action.href) {
          candidates.push({
            type: 'navigate',
            action: 'navigate',
            params: { url: action.href, capture: true },
            reason: `Open detail from ${region.label} item #${item.index}: ${action.label}`,
            priority: 0.95,
            id: `explore-detail-${region.id}-${item.index}`,
            regionId: region.id,
            itemIndex: item.index,
          })
        } else if (action.intent === 'reveal' || action.intent === 'expand') {
          candidates.push({
            type: 'click',
            action: 'click',
            params: { selector: action.scopedSelector },
            reason: `Reveal content in ${region.label} item #${item.index}`,
            priority: 0.84,
            id: `explore-reveal-${region.id}-${item.index}`,
            scoped: true,
          })
        }
      }
    }
  }

  for (const a of pageModel.globalActions || []) {
    if (/load more|show more|see all/i.test(a.label || '')) {
      candidates.push({
        type: 'click',
        action: 'click',
        params: { selector: a.selector },
        reason: `Pagination/reveal control: ${a.label}`,
        priority: 0.9,
        id: 'explore-load-more',
        expect: 'more_list_items',
      })
    }
  }

  if (pageModel.pageType?.includes('list') && pageModel.stats?.scopedItemCount > 0) {
    const missingLineItems = snapshot.adapter?.items?.some(
      (it) => Array.isArray(it.lineItems) && it.lineItems.length === 0,
    )
    if (missingLineItems) {
      candidates.push({
        type: 'policy',
        action: 'run_steps',
        params: {
          steps: [{ action: 'capture' }],
        },
        reason: 'List items lack nested data — explore detail links or expand rows',
        priority: 0.7,
        id: 'explore-missing-nested-data',
      })
    }
  }

  candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0))

  const seen = new Set()
  return candidates.filter((c) => {
    const key = `${c.type}:${c.params?.selector || c.params?.url || c.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
