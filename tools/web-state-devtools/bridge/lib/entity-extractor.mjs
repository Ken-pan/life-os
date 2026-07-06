/**
 * Universal entity extraction — list / table / form without site adapters.
 */
import { extractMergeKey } from './store.mjs'

/**
 * @param {Record<string, unknown>} snapshot
 * @param {{ mergeKeyRules?: string[] }} [opts]
 */
export function extractEntities(snapshot, opts = {}) {
  const mergeKeyRules = opts.mergeKeyRules || [
    'detailUrl:orderID=([^&]+)',
    'href:orderID=([^&]+)',
    'orderId',
    'id',
  ]
  /** @type {Array<Record<string, unknown>>} */
  const entities = []
  const seen = new Set()

  if (snapshot.adapter?.items?.length) {
    const items = snapshot.adapter.items.map((item) =>
      withMergeKey(item, mergeKeyRules),
    )
    entities.push({
      kind: 'list',
      source: 'adapter',
      site: snapshot.adapter.site,
      entity: snapshot.adapter.entity,
      count: items.length,
      items,
    })
  }

  for (const region of snapshot.sensor?.regions || []) {
    if ((region.itemCount || 0) < 1) continue
    const key = `region:${region.id}`
    if (seen.has(key)) continue
    seen.add(key)
    entities.push({
      kind: 'list',
      source: 'region',
      regionId: region.id,
      label: region.label,
      count: region.itemCount,
      items: (region.items || []).map((item) => ({
        index: item.index,
        mergeKey: item.containerSelector || `region-${region.id}-${item.index}`,
        preview: item.preview,
        actions: item.actions,
      })),
    })
  }

  const tables = extractTablesFromSnapshot(snapshot)
  for (const table of tables) {
    entities.push(table)
  }

  if (snapshot.forms?.length) {
    entities.push({
      kind: 'form',
      source: 'forms',
      count: snapshot.forms.length,
      forms: snapshot.forms.map((f) => ({
        name: f.name || f.id,
        action: f.action,
        fieldCount: f.fields?.length ?? 0,
        fields: (f.fields || []).slice(0, 30).map((fd) => ({
          name: fd.name,
          label: fd.label,
          type: fd.type,
          required: fd.required,
          bestSelector: fd.bestSelector,
        })),
      })),
    })
  }

  return {
    schema: 'web-state-devtools/entities/v1',
    extractedAt: new Date().toISOString(),
    pageUrl: snapshot.page?.url,
    entities,
    stats: {
      entityCount: entities.length,
      itemCount: entities.reduce(
        (n, e) => n + (e.count || e.items?.length || 0),
        0,
      ),
    },
  }
}

/**
 * @param {Record<string, unknown>} item
 * @param {string[]} mergeKeyRules
 */
function withMergeKey(item, mergeKeyRules) {
  const mergeKey = extractMergeKey(item, mergeKeyRules)
  return mergeKey ? { ...item, mergeKey } : item
}

/**
 * Table entities from in-page table-walker output.
 * @param {Record<string, unknown>} snapshot
 */
function extractTablesFromSnapshot(snapshot) {
  /** @type {Array<Record<string, unknown>>} */
  const tables = []

  if (snapshot.tables?.length) {
    for (const t of snapshot.tables) {
      tables.push({
        kind: 'table',
        source: t.source || 'table-walker',
        caption: t.caption,
        selector: t.selector,
        headers: t.headers,
        count: t.rowCount ?? t.rows?.length ?? 0,
        rows: (t.rows || []).slice(0, 50),
      })
    }
    return tables
  }

  const tableEls = (snapshot.elements || []).filter((e) => e.tag === 'table')
  for (const t of tableEls.slice(0, 3)) {
    tables.push({
      kind: 'table',
      source: 'elements',
      name: t.name || t.testId || 'table',
      selector: t.bestSelector || t.selector,
      count: 0,
      note: 'No rows — re-capture with table-walker (v0.8+)',
    })
  }
  return tables
}

/**
 * Merge entity items into a Map by mergeKey.
 * @param {Map<string, Record<string, unknown>>} map
 * @param {Array<Record<string, unknown>>} items
 * @param {string[]} [mergeKeyRules]
 */
export function mergeEntityItems(map, items, mergeKeyRules) {
  let added = 0
  for (const item of items) {
    const key = item.mergeKey || extractMergeKey(item, mergeKeyRules)
    if (!key) continue
    if (!map.has(key)) added++
    map.set(key, { ...map.get(key), ...item, mergeKey: key })
  }
  return { added, total: map.size }
}
