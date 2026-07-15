/**
 * 柜内实测消费单测:payload 校验、id 直连/identity 兜底绑定、跨扫描合并、
 * item.level 生命周期(normalize 重建不丢层号)。
 * Usage: node apps/home/scripts/container-scan-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  containerSummary,
  levelLabel,
  levelOptions,
  mergeContainerBindings,
  normalizeContainerPayload,
  resolveScanContainers,
} from '../src/lib/spatial/container-scan.js'
import {
  createStorageItem,
  normalizeLevel,
  normalizeStorageItems,
  patchStorageItem,
} from '../src/lib/spatial/storage-items.js'

/* ---- normalizeContainerPayload ---- */

const rawPayload = {
  formatVersion: 1,
  scanId: 'scan-a',
  placementId: 'p7',
  placementLabel: '柜',
  capturedAt: '2026-07-15T04:00:00Z',
  device: 'iPhone',
  interiorIn: { w: 31.5, d: 13.8, h: 74.8 },
  shelfHeightsIn: [24.4, 49.0],
  compartments: [
    { level: 0, y0In: 0, y1In: 24.4, heightIn: 24.4 },
    { level: 1, y0In: 24.4, y1In: 49.0, heightIn: 24.6 },
    { level: 2, y0In: 49.0, y1In: 74.8, heightIn: 25.8 },
  ],
  interiorVolumeL: 532,
  photos: ['u/s/container-p7-0.jpg'],
  evilExtraField: { nested: 'junk' },
}
const c1 = normalizeContainerPayload(rawPayload)
assert.ok(c1)
assert.equal(c1.placementId, 'p7')
assert.equal(c1.scanId, 'scan-a')
assert.equal(c1.compartments.length, 3)
assert.equal(c1.volumeL, 532)
assert.equal(
  Object.hasOwn(c1, 'evilExtraField'),
  false,
  '白名单:外部 JSON 的野字段不进项目',
)

// 残缺 payload:没有 compartments → 整腔一层兜底
const c2 = normalizeContainerPayload({
  scanId: 's',
  placementId: 'p1',
  interiorIn: { w: 30, d: 14, h: 70 },
})
assert.ok(c2)
assert.equal(c2.compartments.length, 1)
assert.equal(c2.compartments[0].heightIn, 70)

// 非法:缺 placementId / 尺寸非正 / 尺寸超 3.5m
assert.equal(normalizeContainerPayload({ scanId: 's', interiorIn: { w: 1, d: 1, h: 1 } }), null)
assert.equal(
  normalizeContainerPayload({ scanId: 's', placementId: 'p', interiorIn: { w: 0, d: 1, h: 1 } }),
  null,
)
assert.equal(
  normalizeContainerPayload({ scanId: 's', placementId: 'p', interiorIn: { w: 200, d: 10, h: 10 } }),
  null,
)

/* ---- resolveScanContainers:id 直连 ---- */

const zone = {
  id: 'sz-1',
  code: 'S1',
  nameZh: '高柜',
  locationZh: '卧室东墙',
  formZh: '柜',
  items: [],
  placementId: 'p7',
}
const projectPlacements = [
  { id: 'p7', kind: 'cabinet', label: '柜', x: 100, y: 100, w: 90, h: 40, rotation: 0 },
  { id: 'p9', kind: 'sofa', label: '沙发', x: 300, y: 300, w: 200, h: 90, rotation: 0 },
]
const direct = resolveScanContainers({
  containers: [c1],
  scanPlacements: [],
  projectPlacements,
  zones: [zone],
})
assert.equal(direct[0].status, 'bound')
assert.equal(direct[0].zoneId, 'sz-1')
assert.equal(direct[0].projectPlacementId, 'p7')

/* ---- resolveScanContainers:identity 兜底(新扫描换了 id) ---- */

// 新扫描里同一个柜子叫 p2,位置/尺寸与 p7 几乎一样(已配准进家坐标系)
const scanPlacements = [
  { id: 'p2', kind: 'cabinet', label: '柜', x: 103, y: 98, w: 91, h: 40, rotation: 0 },
]
const cNew = normalizeContainerPayload({ ...rawPayload, scanId: 'scan-b', placementId: 'p2' })
const viaIdentity = resolveScanContainers({
  containers: [cNew],
  scanPlacements,
  projectPlacements,
  zones: [zone],
})
assert.equal(viaIdentity[0].status, 'bound', 'identity 兜底应把新 id 匹配回旧家具')
assert.equal(viaIdentity[0].projectPlacementId, 'p7')

// 家具匹配上了,但没绑储藏区 → no_zone(报告出来,不静默丢)
const noZone = resolveScanContainers({
  containers: [c1],
  scanPlacements: [],
  projectPlacements,
  zones: [],
})
assert.equal(noZone[0].status, 'no_zone')
assert.equal(noZone[0].placementLabel, '柜')

// 完全对不上 → unmatched
const unmatched = resolveScanContainers({
  containers: [normalizeContainerPayload({ ...rawPayload, placementId: 'p404' })],
  scanPlacements: [],
  projectPlacements,
  zones: [zone],
})
assert.equal(unmatched[0].status, 'unmatched')

/* ---- mergeContainerBindings:新扫描赢 ---- */

const newer = { ...direct[0], container: { ...direct[0].container, scanId: 'scan-new' } }
const older = { ...direct[0], container: { ...direct[0].container, scanId: 'scan-old' } }
const merged = mergeContainerBindings([[newer], [older]])
assert.equal(merged.byZoneId['sz-1'].scanId, 'scan-new', '同一柜子按扫描新→旧首见即最新')
assert.equal(merged.bound.length, 1)
assert.equal(
  Object.hasOwn(merged.byZoneId['sz-1'], 'placementId'),
  false,
  '落进 zone.container 时应剥掉扫描侧 placementId(那是别的坐标系的 id)',
)

/* ---- 展示辅助 ---- */

assert.equal(containerSummary(c1), '内 80×35×190 cm · 3 层')
assert.equal(levelOptions(c1).length, 3)
assert.ok(levelOptions(c1)[0].label.includes('第 1 层'))
assert.equal(levelLabel(1), '第 2 层')
assert.equal(levelLabel(undefined), '')

/* ---- item.level 生命周期 ---- */

assert.equal(normalizeLevel(2), 2)
assert.equal(normalizeLevel(null), undefined)
assert.equal(normalizeLevel(-1), undefined)
assert.equal(normalizeLevel(1.5), undefined)

const item = createStorageItem('充电器', { level: 1 }, 1000)
assert.equal(item.level, 1)
// patch:undefined 不动,null 清除
assert.equal(patchStorageItem(item, { name: '快充头' }, 2000).level, 1)
assert.equal(patchStorageItem(item, { level: null }, 2000).level, undefined)
assert.equal(patchStorageItem(item, { level: 2 }, 2000).level, 2)

// 关键回归:一件脏数据触发整区重建时,其他物品的 level 不能被抹掉
const rebuilt = normalizeStorageItems(
  [
    { id: 'si-1', name: '充电器', level: 2, updatedAt: 1000 },
    '遗留字符串物品', // 脏数据,触发整区重建
  ],
  'sz-1',
)
assert.equal(rebuilt.length, 2)
assert.equal(rebuilt[0].level, 2, '重建路径必须带上 level,否则全区层号静默清零')

// 非法 level 会让快路径判脏并在重建中被修掉
const repaired = normalizeStorageItems(
  [{ id: 'si-1', name: 'x', level: -3, updatedAt: 1000 }],
  'sz-1',
)
assert.equal(repaired[0].level, undefined)

console.log('container-scan-unit: all assertions passed')
