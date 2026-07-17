import assert from 'node:assert/strict'
import {
  formatWhereIsResult,
  slimStorageZonesForSnapshot,
  whereIs,
  WHERE_IS_DISPLAY_CAP,
} from '../src/lib/spatial/where-is.js'

const zones = [
  {
    id: 'z1',
    code: 'S7',
    nameZh: '厨房吊柜',
    placementId: 'p-big',
    polygon: [[0, 0]],
    items: [
      {
        id: 'si-1',
        name: '磨豆机',
        qty: 1,
        tags: ['咖啡'],
        note: '手冲用',
        purchase: { title: 'Baratza Encore', price: 99 },
      },
    ],
  },
  {
    id: 'z2',
    code: 'S4',
    nameZh: '走廊储物柜',
    items: [{ id: 'si-2', name: '登山包', qty: 2, tags: ['户外'] }],
  },
]

const slim = slimStorageZonesForSnapshot(zones)
assert.equal(slim[0].placementId, undefined)
assert.equal(slim[0].polygon, undefined)
assert.equal(slim[0].items[0].purchase.title, 'Baratza Encore')
assert.equal(slim[0].items[0].purchase.price, undefined)

assert.match(whereIs(zones, '登山包'), /S4 走廊储物柜/)
assert.match(whereIs(zones, '咖啡'), /磨豆机/)
assert.match(whereIs(zones, '不存在'), /没有找到/)
assert.match(whereIs(zones, ''), /请提供/)

const manyHits = {
  total: WHERE_IS_DISPLAY_CAP + 5,
  hits: Array.from({ length: WHERE_IS_DISPLAY_CAP + 5 }, (_, i) => ({
    item: { name: `物${i}` },
    zoneCode: 'S1',
    zoneNameZh: '区',
  })),
}
const text = formatWhereIsResult(manyHits, '物')
assert.match(text, /已截断/)
assert.equal(text.split('\n').length - 1, WHERE_IS_DISPLAY_CAP)

console.log('where-is-unit: ok')
