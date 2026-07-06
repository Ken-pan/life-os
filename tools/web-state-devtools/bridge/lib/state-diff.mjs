/**
 * Diff two snapshots — what changed after an action (revealed content).
 */

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @param {Record<string, unknown>} [meta]
 */
export function diffSnapshots(before, after, meta = {}) {
  const beforeControls = indexByKey(before.controls || [], controlKey)
  const afterControls = indexByKey(after.controls || [], controlKey)

  const newControls = []
  for (const [k, c] of afterControls) {
    if (!beforeControls.has(k)) newControls.push(summarizeControl(c))
  }

  const beforeLinks = indexByKey(before.links || [], (l) => l.href)
  const afterLinksMap = indexByKey(after.links || [], (l) => l.href)
  const newLinks = []
  for (const [k, l] of afterLinksMap) {
    if (!beforeLinks.has(k)) newLinks.push({ text: l.text, href: l.href, selector: l.bestSelector })
  }

  const beforeHeadings = new Set((before.headings || []).map((h) => h.text))
  const newHeadings = (after.headings || [])
    .filter((h) => !beforeHeadings.has(h.text))
    .map((h) => ({ level: h.level, text: h.text }))

  const beforeRegions = before.sensor?.regions?.length ?? 0
  const afterRegions = after.sensor?.regions?.length ?? 0

  const urlChanged = before.page?.url !== after.page?.url
  const titleChanged = before.page?.title !== after.page?.title

  const revealedContent = []
  if (newControls.length) {
    revealedContent.push({
      id: 'new-controls',
      kind: 'controls',
      count: newControls.length,
      samples: newControls.slice(0, 10),
      revealedBy: meta,
    })
  }
  if (newLinks.length) {
    revealedContent.push({
      id: 'new-links',
      kind: 'links',
      count: newLinks.length,
      samples: newLinks.slice(0, 8),
      revealedBy: meta,
    })
  }
  if (newHeadings.length) {
    revealedContent.push({
      id: 'new-headings',
      kind: 'headings',
      count: newHeadings.length,
      samples: newHeadings.slice(0, 5),
      revealedBy: meta,
    })
  }
  if (afterRegions > beforeRegions) {
    revealedContent.push({
      id: 'new-regions',
      kind: 'regions',
      count: afterRegions - beforeRegions,
      revealedBy: meta,
    })
  }

  const adapterBefore = before.adapter?.items?.length ?? 0
  const adapterAfter = after.adapter?.items?.length ?? 0

  return {
    schema: 'web-state-devtools/state-diff/v1',
    diffedAt: new Date().toISOString(),
    urlChanged,
    titleChanged,
    beforeUrl: before.page?.url,
    afterUrl: after.page?.url,
    stats: {
      newControlCount: newControls.length,
      newLinkCount: newLinks.length,
      newHeadingCount: newHeadings.length,
      regionCountDelta: afterRegions - beforeRegions,
      adapterItemsDelta: adapterAfter - adapterBefore,
    },
    revealedContent,
    newControls: newControls.slice(0, 25),
    newLinks: newLinks.slice(0, 15),
    newHeadings,
    action: meta,
  }
}

function controlKey(c) {
  return `${c.bestSelector || c.selector}|${c.name || ''}`
}

function indexByKey(arr, keyFn) {
  const m = new Map()
  for (const item of arr) m.set(keyFn(item), item)
  return m
}

function summarizeControl(c) {
  return {
    label: c.name,
    selector: c.bestSelector || c.selector,
    role: c.role,
    tag: c.tag,
    ariaExpanded: c.ariaExpanded,
  }
}
