/**
 * 场景图 + 杂乱指数单测。不需要 dev server / Supabase。
 *   node scripts/scene-graph-unit.mjs
 */
import { buildSceneGraph, nearestStorableFurniture } from '../src/lib/spatial/scene-graph.js'
import { scoreClutter } from '../src/lib/spatial/clutter-score.js'
import { analyzeCirculation } from '../src/lib/spatial/circulation.js'
import { SAMPLE_508 } from '../src/lib/spatial/sample-508.js'

let pass = 0
const fails = []
const ok = (n, c, d = '') => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ''}`))

// ---- 手搓户型:关系的精确断言 ----
const stub = {
  meta: { nameZh: '测试屋' },
  zones: [
    { id: 'z-1', nameZh: '厨房', polygon: [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 } ] },
    { id: 'z-2', nameZh: '卧室', polygon: [
      { x: 400, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 300 }, { x: 400, y: 300 } ] },
  ],
  placements: [
    // 台面柜(落地,高 36″)+ 正上方的吊柜(mount wall, elev 54)—— 不构成 on_top_of(悬空)
    { id: 'pl-base', kind: 'base_cabinet', label: '台面下柜', x: 10, y: 10, w: 72, h: 72, rotation: 0, zoneId: 'z-1' },
    { id: 'pl-wall', kind: 'wall_cabinet', label: '吊柜', x: 10, y: 10, w: 72, h: 36, rotation: 0, zoneId: 'z-1' },
    // 微波炉(mount counter, elev 36)骑在台面柜顶(36″)上 → on_top_of
    { id: 'pl-micro', kind: 'microwave', label: '微波炉', x: 20, y: 20, w: 60, h: 45, rotation: 0, zoneId: 'z-1' },
    // 床和床头柜:边距 4″ → next_to
    { id: 'pl-bed', kind: 'bed', label: '床', x: 450, y: 30, w: 180, h: 240, rotation: 0, zoneId: 'z-2' },
    { id: 'pl-night', kind: 'nightstand', label: '床头柜', x: 642, y: 30, w: 66, h: 54, rotation: 0, zoneId: 'z-2' },
    // 厨房的储物柜(storable)
    { id: 'pl-cab', kind: 'cabinet', label: '柜', x: 300, y: 200, w: 90, h: 60, rotation: 0, zoneId: 'z-1' },
  ],
  fixtures: [
    { id: 'fx-stove', kind: 'stove', label: '灶台', bounds: { x: 100, y: 10, w: 90, h: 72 } },
  ],
  storageZones: [
    { id: 's-1', code: 'S1', nameZh: '厨房柜', locationZh: '', formZh: '',
      bounds: { x: 300, y: 200, w: 90, h: 60 }, marker: { x: 345, y: 230 },
      placementId: 'pl-cab',
      items: [
        { id: 'it-1', name: '调料', qty: 3 },
        { id: 'it-2', name: '锅' },
      ] },
  ],
  viewpoints: [
    { id: 'vp-1', x: 200, y: 150, heading: 0, fovDeg: 69, zoneId: 'z-1',
      state: '堆满', items: ['纸箱', '锅'], describedAt: '2026-07-15T10:00:00Z' },
    { id: 'vp-2', x: 600, y: 150, heading: 0, fovDeg: 69, zoneId: 'z-2',
      state: '整洁', items: [], describedAt: '2026-07-15T10:00:00Z' },
  ],
}

const g = buildSceneGraph(stub)
const edge = (type, from, to) =>
  g.edges.some((e) => e.type === type && e.from === from && (!to || e.to === to))

ok('房间挂到 home', edge('in_home', 'z-1', 'home') && edge('in_home', 'z-2', 'home'))
ok('家具进对房间', edge('in_room', 'pl-bed', 'z-2') && edge('in_room', 'pl-base', 'z-1'))
ok('固定设施也进房间', edge('in_room', 'fx-stove', 'z-1'))
ok('微波炉骑在台面柜上', edge('on_top_of', 'pl-micro', 'pl-base'))
ok(
  '吊柜悬空,不算骑在台面柜上',
  !edge('on_top_of', 'pl-wall', 'pl-base'),
  JSON.stringify(g.edges.filter((e) => e.type === 'on_top_of')),
)
ok('床和床头柜相邻', edge('next_to', 'pl-bed', 'pl-night'))
ok(
  '不同房间不算相邻',
  !g.edges.some((e) => e.type === 'next_to' && (e.from === 'pl-cab' || e.to === 'pl-cab') && (e.from === 'pl-bed' || e.to === 'pl-bed')),
)
ok('储物区长在柜上', edge('located_at', 's-1', 'pl-cab'))
ok('物品存放关系', edge('stored_in', 'item-s-1-it-1', 's-1') && edge('stored_in', 'item-s-1-it-2', 's-1'))
ok('物品节点带数量', g.byId['item-s-1-it-1']?.qty === 3)

// 给床边的东西找去处:同房间没有 storable → 跨房间挑最近的柜
const home = nearestStorableFurniture(g, 'pl-bed')
ok('找去处:床头柜(同房间 storable)优先', home?.id === 'pl-night' && home.sameRoom, JSON.stringify(home))

// ---- 杂乱指数:堆满的厨房要比整洁的卧室分高,且理由可解释 ----
const fakeCirc = {
  ok: true,
  zoneStats: [
    { zoneId: 'z-1', nameZh: '厨房', areaSqft: 100, furnitureSqft: 55, freeSqft: 45, usedRatio: 0.55, tightRatio: 0.4 },
    { zoneId: 'z-2', nameZh: '卧室', areaSqft: 100, furnitureSqft: 30, freeSqft: 70, usedRatio: 0.3, tightRatio: 0.05 },
  ],
  bottlenecks: [
    { x: 0, y: 0, widthIn: 26, zoneId: 'z-1', nameZh: '厨房', blockers: [{ id: 'pl-cab', label: '柜' }] },
  ],
  blockedDoors: [{ id: 'op-1', reason: '门口被家具占住' }],
}
const clutter = scoreClutter(stub, fakeCirc)
ok('最乱的是厨房', clutter.worst?.zoneId === 'z-1', JSON.stringify(clutter.worst))
const kitchen = clutter.zones.find((z) => z.zoneId === 'z-1')
const bedroom = clutter.zones.find((z) => z.zoneId === 'z-2')
ok('厨房分数明显高于卧室', kitchen.score >= bedroom.score + 30, `${kitchen.score} vs ${bedroom.score}`)
ok(
  '每一分都有人话理由',
  kitchen.parts.every((p) => p.detail.length > 0) &&
    kitchen.parts.some((p) => p.detail.includes('堆满')),
  JSON.stringify(kitchen.parts),
)
ok('堵门单独列出', clutter.blockedDoors.length === 1)

// 没认过状态的区:几何分按比例放大,不显得比认过的干净
const noVlm = scoreClutter({ ...stub, viewpoints: [] }, fakeCirc)
ok(
  '盲区分数放大且标注未识别',
  noVlm.zones.every((z) => !z.described) &&
    noVlm.zones.find((z) => z.zoneId === 'z-1').score > 0,
)

// blocks 边(带 circulation)
const g2 = buildSceneGraph(stub, fakeCirc)
ok('柜堵动线的 blocks 边', g2.edges.some((e) => e.type === 'blocks' && e.from === 'pl-cab'))

// ---- SAMPLE_508 集成体检:真实户型能建图,层级齐全 ----
const g508 = buildSceneGraph(SAMPLE_508, analyzeCirculation(SAMPLE_508))
const types = new Set(g508.nodes.map((n) => n.type))
ok('508 建图:节点类型齐', ['home', 'room', 'furniture', 'storage', 'item'].every((t) => types.has(t)),
  [...types].join(','))
ok('508 建图:物品都有存放关系',
  g508.nodes.filter((n) => n.type === 'item').length > 0 &&
    g508.nodes.filter((n) => n.type === 'item')
      .every((n) => g508.edges.some((e) => e.type === 'stored_in' && e.from === n.id)))
ok('508 建图:家具都有房间归属(容忍个别户型外)',
  g508.edges.filter((e) => e.type === 'in_room').length >=
    g508.nodes.filter((n) => n.type === 'furniture').length - 2)
const clutter508 = scoreClutter(SAMPLE_508, analyzeCirculation(SAMPLE_508))
ok('508 杂乱指数可算', clutter508.zones.length > 0 && clutter508.worst !== null)

if (fails.length) {
  console.error(`FAIL ${fails.length} (pass ${pass})`)
  for (const f of fails) console.error('  ✗', f)
  process.exit(1)
}
console.log(`PASS ${pass} checks`)
