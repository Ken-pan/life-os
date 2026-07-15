/**
 * Storage items — the inventory entities living inside a storage zone (S1–S8).
 *
 * Schema v3 stored these as bare strings (`items: ['加湿器', '磨豆机']`), which
 * made them unaddressable: no edit, no move, no search. v4 promotes them to
 * entities with stable ids so the UI can mutate a single item and so search can
 * point back at the zone that holds it.
 *
 * `normalizeStorageItems` must stay idempotent and deterministic: `hydrateProject`
 * re-derives the project on every `getActiveProject()` call, so a fresh random id
 * per pass would churn `{#each}` keys on every render.
 */

/** @typedef {import('./types.js').SpatialStorageItem} SpatialStorageItem */
/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */

/** 数量上限 —— 挡住 1e9 之类把 UI 撑爆的输入 */
const MAX_QTY = 9999

/** 搜索结果上限；超出部分由调用方如实告知用户，不静默截断 */
export const MAX_SEARCH_HITS = 100

/** 稳定的空数组，避免每次调用都新建一个（引用变化会触发下游重算） */
/** @type {SpatialStorageItem[]} */
const EMPTY_ITEMS = Object.freeze([])
/** @type {SpatialStorageZone[]} */
const EMPTY_ZONES = Object.freeze([])
/** @type {StorageSearchHit[]} */
const EMPTY_HITS = Object.freeze([])
/** @type {Set<string>} */
const EMPTY_CODES = new Set()

let itemSeq = 1

/**
 * Advance the id counter past every id already in use. Must be called before
 * {@link createStorageItem}: `normalizeStorageItems` no longer does it, because
 * its fast path deliberately skips scanning already-clean data.
 * @param {SpatialStorageZone[]} zones
 */
export function syncStorageItemIdSeq(zones) {
  for (const zone of zones ?? []) {
    for (const item of zone.items ?? []) {
      const m = /^si-(\d+)$/.exec(/** @type {SpatialStorageItem} */ (item)?.id ?? '')
      if (m) itemSeq = Math.max(itemSeq, Number(m[1]) + 1)
    }
  }
}

/** @returns {string} */
export function createStorageItemId() {
  return `si-${itemSeq++}`
}

/** @param {unknown} raw */
function normalizeTags(raw) {
  if (!Array.isArray(raw)) return undefined
  const tags = raw
    .map((t) => String(t).trim())
    .filter(Boolean)
    .filter((t, i, all) => all.indexOf(t) === i)
  return tags.length ? tags : undefined
}

/**
 * Parse the comma/space separated tag field used by the editor UI.
 * @param {string} raw
 * @returns {string[] | undefined}
 */
export function parseTagInput(raw) {
  return normalizeTags(String(raw ?? '').split(/[,，\s]+/))
}

/** @param {SpatialStorageItem} item */
export function formatTagInput(item) {
  return (item.tags ?? []).join(' ')
}

/** @param {unknown} raw */
function normalizeQty(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n <= 1) return undefined
  return Math.min(n, MAX_QTY)
}

/**
 * True when `raw` is already exactly what {@link toStorageItem} would return, so
 * the caller can skip rebuilding it. Pure comparison, allocates nothing — this is
 * what keeps `hydrateProject` from re-materialising every item on every read.
 * @param {unknown} raw
 * @returns {boolean}
 */
function isNormalizedItem(raw) {
  if (!raw || typeof raw !== 'object') return false
  const i = /** @type {Record<string, unknown>} */ (raw)
  if (typeof i.id !== 'string' || !i.id) return false
  if (typeof i.name !== 'string' || !i.name || i.name !== i.name.trim()) {
    return false
  }
  if (
    i.qty !== undefined &&
    !(typeof i.qty === 'number' && Number.isInteger(i.qty) && i.qty > 1 && i.qty <= MAX_QTY)
  ) {
    return false
  }
  if (i.tags !== undefined) {
    if (!Array.isArray(i.tags) || !i.tags.length) return false
    const seen = new Set()
    for (const t of i.tags) {
      if (typeof t !== 'string' || !t || t !== t.trim() || seen.has(t)) return false
      seen.add(t)
    }
  }
  if (
    i.note !== undefined &&
    !(typeof i.note === 'string' && i.note && i.note === i.note.trim())
  ) {
    return false
  }
  if (typeof i.updatedAt !== 'number' || !Number.isFinite(i.updatedAt)) return false
  return true
}

/**
 * Coerce one legacy string / partial object into a full item entity.
 * @param {unknown} raw
 * @param {string} zoneId
 * @param {number} index
 * @returns {SpatialStorageItem | null}
 */
function toStorageItem(raw, zoneId, index) {
  // Legacy strings and entities share one code path so that normalizing an
  // already-normalized item is a structural no-op (see normalizeStorageItems).
  const src =
    typeof raw === 'string'
      ? { name: raw }
      : /** @type {Record<string, unknown>} */ (raw)
  if (!src || typeof src !== 'object') return null
  const name = String(src.name ?? '').trim()
  if (!name) return null
  const note = String(src.note ?? '').trim()
  return {
    // Deterministic fallback id so repeated hydrate passes produce identical output.
    id: String(src.id ?? '') || `${zoneId}-i${index}`,
    name,
    qty: normalizeQty(src.qty),
    tags: normalizeTags(src.tags),
    note: note || undefined,
    updatedAt: Number(src.updatedAt) || 0,
  }
}

/**
 * Migrate + validate a zone's item list. Safe to call on already-normalized data.
 *
 * Returns the **input array itself** when nothing needs changing. `hydrateProject`
 * runs on every `getActiveProject()` (a `$derived`), so rebuilding every item each
 * time made hydrate scale with inventory size — measured at 5000 items it was 97%
 * of hydrate's cost. The scan below allocates nothing on the hot path.
 *
 * @param {unknown} items
 * @param {string} zoneId
 * @returns {SpatialStorageItem[]}
 */
export function normalizeStorageItems(items, zoneId) {
  if (!Array.isArray(items)) return EMPTY_ITEMS
  if (!items.length) return items

  let clean = true
  const seenIds = new Set()
  for (const raw of items) {
    if (!isNormalizedItem(raw) || seenIds.has(raw.id)) {
      clean = false
      break
    }
    seenIds.add(raw.id)
  }
  if (clean) return items

  /** @type {SpatialStorageItem[]} */
  const out = []
  const used = new Set()
  items.forEach((raw, i) => {
    const item = toStorageItem(raw, zoneId, i)
    if (!item) return
    // Duplicate ids inside one zone crash Svelte's keyed {#each}. Corrupt saves
    // and the `${zoneId}-i${index}` fallback colliding with an explicit id can
    // both produce them, so re-key rather than trust the input.
    while (used.has(item.id)) item.id = createStorageItemId()
    used.add(item.id)
    out.push(item)
  })
  return out
}

/**
 * @param {SpatialStorageZone[]} zones
 * @returns {SpatialStorageZone[]}
 */
export function normalizeZoneItems(zones) {
  if (!Array.isArray(zones)) return EMPTY_ZONES
  let changed = false
  const next = zones.map((z) => {
    const items = normalizeStorageItems(z.items, z.id)
    if (items === z.items) return z
    changed = true
    return { ...z, items }
  })
  return changed ? next : zones
}

/**
 * @param {string} name
 * @param {{ qty?: number, tags?: string[], note?: string }} [fields]
 * @param {number} [now] epoch ms — injected so callers control the clock
 * @returns {SpatialStorageItem | null}
 */
export function createStorageItem(name, fields = {}, now = Date.now()) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return null
  const note = String(fields.note ?? '').trim()
  return {
    id: createStorageItemId(),
    name: trimmed,
    qty: normalizeQty(fields.qty),
    tags: normalizeTags(fields.tags),
    note: note || undefined,
    updatedAt: now,
  }
}

/**
 * @param {SpatialStorageItem} item
 * @param {Partial<SpatialStorageItem>} patch
 * @param {number} [now]
 * @returns {SpatialStorageItem}
 */
export function patchStorageItem(item, patch, now = Date.now()) {
  const name = patch.name === undefined ? item.name : String(patch.name).trim()
  const note = patch.note === undefined ? item.note : String(patch.note).trim()
  return {
    ...item,
    name: name || item.name,
    qty: patch.qty === undefined ? item.qty : normalizeQty(patch.qty),
    tags: patch.tags === undefined ? item.tags : normalizeTags(patch.tags),
    note: note || undefined,
    updatedAt: now,
  }
}

/** @param {SpatialStorageItem} item */
function haystack(item) {
  return [item.name, item.note ?? '', ...(item.tags ?? [])].join(' ').toLowerCase()
}

/**
 * @typedef {object} StorageSearchHit
 * @property {SpatialStorageItem} item
 * @property {string} zoneId
 * @property {string} zoneCode
 * @property {string} zoneNameZh
 */

/**
 * Find items across every zone. The hit carries its zone so the UI can jump
 * straight to the floor plan marker — the thing a flat list can't do.
 *
 * `hits` is capped at {@link MAX_SEARCH_HITS} (rendering thousands of result rows
 * helps nobody); `total` reports the true match count so the UI can say so out
 * loud instead of silently truncating. `zoneCodes` covers **all** matches, so
 * filtering the zone list stays correct past the cap.
 *
 * @param {SpatialStorageZone[]} zones
 * @param {string} query
 * @returns {{ hits: StorageSearchHit[], total: number, zoneCodes: Set<string> }}
 */
export function searchStorageItems(zones, query) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!q) return { hits: EMPTY_HITS, total: 0, zoneCodes: EMPTY_CODES }
  const terms = q.split(/\s+/).filter(Boolean)
  /** @type {StorageSearchHit[]} */
  const hits = []
  const zoneCodes = new Set()
  for (const zone of zones ?? []) {
    for (const item of zone.items ?? []) {
      const hay = haystack(item)
      let match = true
      for (const t of terms) {
        if (!hay.includes(t)) {
          match = false
          break
        }
      }
      if (!match) continue
      zoneCodes.add(zone.code)
      hits.push({
        item,
        zoneId: zone.id,
        zoneCode: zone.code,
        zoneNameZh: zone.nameZh,
      })
    }
  }
  const total = hits.length
  // Name matches rank above note/tag-only matches.
  hits.sort((a, b) => {
    const an = a.item.name.toLowerCase().includes(terms[0]) ? 0 : 1
    const bn = b.item.name.toLowerCase().includes(terms[0]) ? 0 : 1
    if (an !== bn) return an - bn
    return a.zoneCode.localeCompare(b.zoneCode)
  })
  return {
    hits: total > MAX_SEARCH_HITS ? hits.slice(0, MAX_SEARCH_HITS) : hits,
    total,
    zoneCodes,
  }
}

/**
 * @param {SpatialStorageZone[]} zones
 * @returns {string[]}
 */
export function collectStorageTags(zones) {
  const set = new Set()
  for (const zone of zones ?? []) {
    for (const item of zone.items ?? []) {
      for (const tag of item.tags ?? []) set.add(tag)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * @param {SpatialStorageZone[]} zones
 * @returns {number}
 */
export function countStorageItems(zones) {
  return (zones ?? []).reduce((sum, z) => sum + (z.items?.length ?? 0), 0)
}
