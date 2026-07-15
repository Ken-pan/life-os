/**
 * Storage item entity unit tests (schema v4).
 * Usage: node apps/home/scripts/storage-items-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  collectStorageTags,
  countStorageItems,
  createStorageItem,
  formatTagInput,
  MAX_SEARCH_HITS,
  normalizeStorageItems,
  normalizeZoneItems,
  parseTagInput,
  patchStorageItem,
  searchStorageItems,
  syncStorageItemIdSeq,
} from '../src/lib/spatial/storage-items.js'
import { SAMPLE_508 } from '../src/lib/spatial/sample-508.js'
import { hydrateProject } from '../src/lib/spatial/model.js'

/* ---- v3 → v4 migration ---- */

const migrated = normalizeStorageItems(['加湿器', '磨豆机 / 咖啡'], 's7')
assert.equal(migrated.length, 2)
assert.equal(migrated[0].name, '加湿器')
assert.equal(migrated[0].id, 's7-i0')
assert.equal(migrated[0].updatedAt, 0)
assert.equal(migrated[0].qty, undefined)
assert.equal(migrated[1].id, 's7-i1')

// Idempotent: re-normalizing entities must not churn ids, or hydrateProject
// (which runs on every getActiveProject) would break {#each} keys each render.
const again = normalizeStorageItems(migrated, 's7')
assert.deepEqual(again, migrated)

// Blank / malformed entries are dropped, not turned into empty rows.
assert.deepEqual(normalizeStorageItems(['', '   ', null, 42, {}], 's1'), [])
assert.deepEqual(normalizeStorageItems(undefined, 's1'), [])
assert.deepEqual(normalizeStorageItems('nope', 's1'), [])

/* ---- field normalization ---- */

const rich = normalizeStorageItems(
  [{ id: 'si-9', name: ' 蛋白粉 ', qty: '3', tags: ['囤货', '囤货', ' '], note: ' 快过期 ' }],
  's4',
)[0]
assert.equal(rich.name, '蛋白粉')
assert.equal(rich.qty, 3)
assert.deepEqual(rich.tags, ['囤货'], 'tags dedupe + drop blanks')
assert.equal(rich.note, '快过期')

// qty <= 1 collapses to undefined so the UI can skip the ×N badge.
assert.equal(normalizeStorageItems([{ name: 'a', qty: 1 }], 'z')[0].qty, undefined)
assert.equal(normalizeStorageItems([{ name: 'a', qty: 0 }], 'z')[0].qty, undefined)
assert.equal(normalizeStorageItems([{ name: 'a', qty: 'x' }], 'z')[0].qty, undefined)

/* ---- create / patch ---- */

const created = createStorageItem('咖啡豆', { qty: 2, tags: ['囤货'] }, 1000)
assert.ok(/^si-\d+$/.test(created.id), `unexpected id ${created.id}`)
assert.equal(created.qty, 2)
assert.equal(created.updatedAt, 1000)
assert.equal(createStorageItem('   '), null, 'blank name rejected')

const patched = patchStorageItem(created, { qty: 5 }, 2000)
assert.equal(patched.name, '咖啡豆', 'omitted fields keep their value')
assert.equal(patched.qty, 5)
assert.equal(patched.updatedAt, 2000)
assert.deepEqual(patched.tags, ['囤货'])
// A blank name must not wipe the item.
assert.equal(patchStorageItem(created, { name: '  ' }, 2000).name, '咖啡豆')

/* ---- tag input round-trip ---- */

assert.deepEqual(parseTagInput('囤货 厨房'), ['囤货', '厨房'])
assert.deepEqual(parseTagInput('囤货,厨房，冬季'), ['囤货', '厨房', '冬季'])
assert.equal(parseTagInput('   '), undefined)
assert.equal(formatTagInput({ id: 'x', name: 'y', tags: ['a', 'b'] }), 'a b')
assert.equal(formatTagInput({ id: 'x', name: 'y' }), '')

/* ---- search ---- */

const zones = normalizeZoneItems([
  { id: 's1', code: 'S1', nameZh: '走廊储物柜', items: ['外套 / 夹克', '折叠健身垫'] },
  {
    id: 's7',
    code: 'S7',
    nameZh: '床头钢架',
    items: [
      { id: 'si-100', name: '磨豆机', tags: ['咖啡'], note: '手冲用' },
      { id: 'si-101', name: '加湿器' },
    ],
  },
])

assert.equal(countStorageItems(zones), 4)
assert.deepEqual(collectStorageTags(zones), ['咖啡'])

const byName = searchStorageItems(zones, '磨豆机')
assert.equal(byName.hits.length, 1)
assert.equal(byName.total, 1)
assert.equal(byName.hits[0].zoneCode, 'S7', 'hit carries the zone for plan highlight')
assert.equal(byName.hits[0].zoneNameZh, '床头钢架')
assert.deepEqual([...byName.zoneCodes], ['S7'], 'zoneCodes drives the zone filter')

assert.equal(searchStorageItems(zones, '咖啡').hits.length, 1, 'matches tags')
assert.equal(searchStorageItems(zones, '手冲').hits.length, 1, 'matches notes')
assert.equal(searchStorageItems(zones, '').hits.length, 0, 'empty query returns nothing')
assert.equal(searchStorageItems(zones, '不存在的东西').hits.length, 0)

// Multi-term is AND across name/tags/note.
assert.equal(searchStorageItems(zones, '磨豆机 咖啡').hits.length, 1)
assert.equal(searchStorageItems(zones, '磨豆机 不存在').hits.length, 0)

// Name matches outrank note/tag-only matches.
const ranked = searchStorageItems(
  normalizeZoneItems([
    { id: 'z1', code: 'S1', nameZh: 'A', items: [{ id: 'i1', name: '杯子', note: '咖啡用' }] },
    { id: 'z2', code: 'S2', nameZh: 'B', items: [{ id: 'i2', name: '咖啡豆' }] },
  ]),
  '咖啡',
)
assert.equal(ranked.hits.length, 2)
assert.equal(ranked.hits[0].item.name, '咖啡豆', 'name match ranks first')

/* ---- search result cap is disclosed, never silent ---- */

const manyZones = normalizeZoneItems([
  {
    id: 'zBig',
    code: 'S9',
    nameZh: '大区',
    items: Array.from({ length: MAX_SEARCH_HITS + 25 }, (_, i) => ({
      id: `si-big-${i}`,
      name: `批量物品 ${i}`,
    })),
  },
])
const capped = searchStorageItems(manyZones, '批量物品')
assert.equal(capped.hits.length, MAX_SEARCH_HITS, 'hits capped')
assert.equal(capped.total, MAX_SEARCH_HITS + 25, 'total reports the real count')
assert.ok(capped.total > capped.hits.length, 'UI can tell the user what it hid')
assert.deepEqual([...capped.zoneCodes], ['S9'], 'zone filter stays correct past the cap')

/* ---- real project hydrates to entities, stably ---- */

const p1 = hydrateProject(SAMPLE_508)
const s7 = p1.storageZones.find((z) => z.code === 'S7')
assert.ok(s7.items.length > 0)
assert.equal(typeof s7.items[0], 'object', 'sample data migrated off bare strings')
assert.ok(s7.items[0].id, 'every item has an id')

const p2 = hydrateProject(p1)
assert.deepEqual(
  p2.storageZones.map((z) => z.items),
  p1.storageZones.map((z) => z.items),
  're-hydrate must be stable',
)

// Search works against the real project end to end.
const realHits = searchStorageItems(p1.storageZones, '咖啡')
assert.ok(realHits.hits.length > 0, 'expected 咖啡 in sample data')
assert.ok(realHits.hits.every((h) => h.zoneCode.startsWith('S')))

/* ---- perf: normalizing clean data must not rebuild it ---- */

// hydrateProject runs on every getActiveProject() (a $derived). Re-materialising
// every item there made hydrate scale with inventory size — 97% of its cost at
// 5000 items. Clean input must come back by reference.
const cleanZones = normalizeZoneItems([
  { id: 'sA', code: 'S1', nameZh: 'A', items: ['甲', '乙'] },
])
assert.equal(
  normalizeZoneItems(cleanZones),
  cleanZones,
  'clean zones array returned by reference',
)
assert.equal(
  normalizeStorageItems(cleanZones[0].items, 'sA'),
  cleanZones[0].items,
  'clean items array returned by reference',
)
assert.equal(
  normalizeStorageItems(cleanZones[0].items, 'sA')[0],
  cleanZones[0].items[0],
  'item objects not rebuilt',
)
// Dirty input still gets rebuilt (fast path must not swallow real work).
assert.notEqual(
  normalizeStorageItems([{ id: 'x', name: ' 未修剪 ', updatedAt: 0 }], 'sA')[0].name,
  ' 未修剪 ',
)

/* ---- robustness: duplicate ids would crash Svelte's keyed {#each} ---- */

const dupes = normalizeStorageItems(
  [
    { id: 'same', name: '甲', updatedAt: 0 },
    { id: 'same', name: '乙', updatedAt: 0 },
  ],
  'sZ',
)
assert.equal(dupes.length, 2)
assert.notEqual(dupes[0].id, dupes[1].id, 'duplicate ids re-keyed')
assert.deepEqual(dupes.map((i) => i.name), ['甲', '乙'], 'names preserved while re-keying')

// The `${zoneId}-i${index}` fallback can collide with an explicit id.
const collide = normalizeStorageItems([{ id: 'sQ-i1', name: '甲' }, '乙'], 'sQ')
assert.equal(collide.length, 2)
assert.notEqual(collide[0].id, collide[1].id, 'fallback id collision re-keyed')

/* ---- robustness: absurd qty must not reach the UI ---- */

assert.equal(normalizeStorageItems([{ name: 'a', qty: 1e9 }], 'z')[0].qty, 9999, 'qty clamped')
assert.equal(normalizeStorageItems([{ name: 'a', qty: Infinity }], 'z')[0].qty, undefined)
assert.equal(normalizeStorageItems([{ name: 'a', qty: NaN }], 'z')[0].qty, undefined)

/* ---- robustness: new ids must not collide with saved ones ---- */

// normalizeStorageItems no longer advances the counter (its fast path skips clean
// data), so callers must syncStorageItemIdSeq first — otherwise a freshly loaded
// module mints si-1 straight onto an existing si-1. addStorageItem does this.
const saved = normalizeZoneItems([
  {
    id: 'sS',
    code: 'S1',
    nameZh: 'A',
    items: [
      { id: 'si-1', name: '已存在1' },
      { id: 'si-7', name: '已存在7' },
    ],
  },
])
syncStorageItemIdSeq(saved)
const fresh = createStorageItem('新物品')
const savedIds = saved[0].items.map((i) => i.id)
assert.ok(!savedIds.includes(fresh.id), `new id ${fresh.id} collides with ${savedIds}`)
assert.equal(fresh.id, 'si-8', 'counter resumes past the highest saved id')

console.log('storage-items unit: all assertions passed')
