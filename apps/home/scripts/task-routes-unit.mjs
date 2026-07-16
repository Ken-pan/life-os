/**
 * 任务路径单测:锚点解析(入口/分区/家具)、BFS 距离合理性、
 * 缺锚点跳过、堵死如实报 null、家具挪远日常步行变多。
 * 户型 fixture 与 layout-solve-unit 同构:20x10ft 双房,隔墙带 32in 门。
 * Usage: node apps/home/scripts/task-routes-unit.mjs
 */
import assert from 'node:assert/strict'
import { computeTaskRoutes } from '../src/lib/spatial/task-routes.js'
import { buildFromWallGraph } from '../src/lib/spatial/wall-graph.js'

const PX = 36
const ft = (v) => v * PX

function home({ placements = [], zoneNames = ['卧室', '厨房'], extraOpenings = [] } = {}) {
  const W = ft(20)
  const H = ft(10)
  const midX = ft(12)
  const graph = {
    pxPerFt: PX,
    margin: { x: 24, y: 24 },
    vertices: [
      { id: 'v1', x: 24, y: 24 },
      { id: 'v2', x: 24 + W, y: 24 },
      { id: 'v3', x: 24 + W, y: 24 + H },
      { id: 'v4', x: 24, y: 24 + H },
      { id: 'v5', x: 24 + midX, y: 24 },
      { id: 'v6', x: 24 + midX, y: 24 + H },
    ],
    edges: [
      { id: 'e1', a: 'v1', b: 'v5' },
      { id: 'e1b', a: 'v5', b: 'v2' },
      { id: 'e2', a: 'v2', b: 'v3' },
      { id: 'e3', a: 'v3', b: 'v6' },
      { id: 'e3b', a: 'v6', b: 'v4' },
      { id: 'e4', a: 'v4', b: 'v1' },
      { id: 'e5', a: 'v5', b: 'v6' },
    ],
  }
  const zones = [
    { id: 'z-1', nameZh: zoneNames[0], polygon: [
      { x: 24, y: 24 }, { x: 24 + midX, y: 24 }, { x: 24 + midX, y: 24 + H }, { x: 24, y: 24 + H },
    ] },
    { id: 'z-2', nameZh: zoneNames[1], polygon: [
      { x: 24 + midX, y: 24 }, { x: 24 + W, y: 24 }, { x: 24 + W, y: 24 + H }, { x: 24 + midX, y: 24 + H },
    ] },
  ]
  return buildFromWallGraph(graph, {
    graphOpenings: [
      { id: 'op1', edgeId: 'e5', offsetIn: 54, spanIn: 32, type: 'door', style: 'swing' },
      ...extraOpenings,
    ],
    zones,
    placements,
    fixtures: [],
    viewpoints: [],
    storageZones: [],
    meta: { id: 'routes-test', nameZh: 'routes-test' },
  })
}

const bed = (extra = {}) => ({
  id: 'bed', kind: 'bed', label: '床',
  x: 24 + ft(1), y: 24 + ft(1), w: ft(5), h: ft(6.5), rotation: 0, zoneId: 'z-1', ...extra,
})
const desk = (extra = {}) => ({
  id: 'desk', kind: 'desk', label: '桌',
  x: 24 + ft(17), y: 24 + ft(1), w: ft(2.5), h: ft(4), rotation: 0, zoneId: 'z-2', ...extra,
})

/* ---- 床(卧室)↔ 厨房分区的桌子:desk_kitchen 有距离,床↔卫生间没有(无卫生间)---- */
{
  const res = computeTaskRoutes(home({ placements: [bed(), desk()] }))
  assert.ok(res.ok)
  const dk = res.routes.find((r) => r.key === 'desk_kitchen')
  assert.ok(dk, '桌在、厨房在 → 这条链路要算')
  assert.equal(dk.lengthFt, 0, '桌子就在厨房里,踏进分区即到达')
  assert.ok(!res.routes.some((r) => r.key === 'bed_bath'), '没有卫生间,不硬算')
  assert.ok(!res.routes.some((r) => r.key === 'entry_kitchen'), '内门不是入口,入口链路跳过')
}

/* ---- 床 ↔ 衣柜:同屋近距离;搬到隔壁房间要绕门,距离显著变长 ---- */
{
  const wardrobeNear = { id: 'wd', kind: 'wardrobe', label: '衣柜', x: 24 + ft(8), y: 24 + ft(1), w: ft(3), h: ft(2), rotation: 0, zoneId: 'z-1' }
  const near = computeTaskRoutes(home({ placements: [bed(), wardrobeNear] }))
  const bwNear = near.routes.find((r) => r.key === 'bed_wardrobe')
  // 床和衣柜的锚点环相邻甚至重叠 → 0ft 合理:挨着就不用走
  assert.ok(bwNear?.lengthFt !== null && bwNear.lengthFt < 4, `同屋该很近(${bwNear?.lengthFt}ft)`)

  const wardrobeFar = { ...wardrobeNear, x: 24 + ft(17), y: 24 + ft(6), zoneId: 'z-2' }
  const far = computeTaskRoutes(home({ placements: [bed(), wardrobeFar] }))
  const bwFar = far.routes.find((r) => r.key === 'bed_wardrobe')
  assert.ok(bwFar?.lengthFt >= bwNear.lengthFt + 6, `搬去隔壁要绕门(${bwNear.lengthFt} → ${bwFar?.lengthFt}ft)`)
  assert.ok(far.dailyWalkFt > near.dailyWalkFt, '日常步行合计要变多')
}

/* ---- 门被堵死:跨房链路如实报 null,不编数字 ---- */
{
  const blocker = { id: 'blk', kind: 'cabinet', label: '堵门柜', x: 24 + ft(12) - 6, y: 24 + ft(4), w: ft(3), h: ft(4), rotation: 0, zoneId: 'z-2' }
  const wardrobeFar = { id: 'wd', kind: 'wardrobe', label: '衣柜', x: 24 + ft(17), y: 24 + ft(6), w: ft(3), h: ft(2), rotation: 0, zoneId: 'z-2' }
  const res = computeTaskRoutes(home({ placements: [bed(), wardrobeFar, blocker] }))
  const bw = res.routes.find((r) => r.key === 'bed_wardrobe')
  assert.equal(bw?.lengthFt, null, '走不通要如实说,不给假距离')
}

/* ---- 外墙门 = 入口:entry 链路出现且有距离 ---- */
{
  // 西外墙(e4)开一道门
  const res = computeTaskRoutes(
    home({
      placements: [desk()],
      extraOpenings: [{ id: 'op-entry', edgeId: 'e4', offsetIn: 40, spanIn: 36, type: 'door', style: 'swing' }],
    }),
  )
  const ek = res.routes.find((r) => r.key === 'entry_kitchen')
  assert.ok(ek, '外墙门该被认成入口')
  assert.ok(ek.lengthFt > 8, `入口在西、厨房在东,得走一段(${ek.lengthFt}ft)`)
  const ed = res.routes.find((r) => r.key === 'entry_desk')
  assert.ok(ed?.lengthFt > ek.lengthFt - 5, '到桌边至少不比踏进厨房近太多')
}

/* ---- 空房:ok 但没有可算链路 ---- */
{
  const res = computeTaskRoutes(home({ placements: [] }))
  assert.ok(res.ok)
  assert.ok(!res.routes.some((r) => r.key.startsWith('bed')), '没床没桌,家具链路全跳过')
}

console.log('task-routes-unit: all assertions passed')
