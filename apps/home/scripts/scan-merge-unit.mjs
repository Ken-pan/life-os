/**
 * 扫描家具摆进已有户型的单测。不需要 dev server / Supabase。
 *   node scripts/scan-merge-unit.mjs
 *
 * 核心不变量:**户型永远不动**(墙体/房间/储藏区),扫描只贡献家具位置与照片。
 * 用真实的 508 户型跑,因为坑都是真实数据形状带出来的。
 */
import { SAMPLE_508 } from '../src/lib/spatial/sample-508.js'
import {
  mapScanIntoLayout,
  mergeViewpointsOnly,
  mergeFurnitureAndViewpoints,
  describeReplacements,
} from '../src/lib/spatial/scan-merge.js'

let pass = 0
const fails = []
const ok = (n, c, d = '') => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ''}`))

const PX = 36
/** 508 里落点属于哪个房间(取最小的) */
const roomOf = (cx, cy) => {
  let best = '区外'
  let bestArea = Infinity
  for (const r of SAMPLE_508.rooms) {
    if (r.kind === 'structural' || !r.bounds) continue
    const b = r.bounds
    const area = b.w * b.h
    if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h && area < bestArea) {
      best = r.nameZh || '(无名)'
      bestArea = area
    }
  }
  return best
}

/**
 * 合成一份「扫描」:分区中心与 508 的房间大致对应,但整体有漂移
 * (y 向拉长 14%、原点偏移)—— 复刻 RoomPlan 的真实脾气。
 */
function fakeScan() {
  const zone = (id, nameZh, x, y, w, h) => ({
    id,
    nameZh,
    polygon: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  })
  return {
    zones: [
      zone('z-1', '卧室', 24, 185, 411, 565),
      zone('z-2', '客厅', 414, 256, 440, 396),
      zone('z-3', '厨房', 334, 620, 520, 578),
      zone('z-4', '卫生间', 31, 739, 483, 461),
    ],
    placements: [
      { id: 'pl-1', kind: 'bed', label: '床', x: 60, y: 300, w: 258, h: 225, rotation: 0, zoneId: 'z-1' },
      { id: 'pl-2', kind: 'cabinet', label: '柜', x: 250, y: 960, w: 78, h: 159, rotation: 0, zoneId: 'z-4' },
    ],
    fixtures: [
      { id: 'fx-1', kind: 'toilet', label: '马桶', bounds: { x: 233, y: 1128, w: 93, h: 54 }, rotation: 0 },
      { id: 'fx-2', kind: 'tub', label: '浴缸', bounds: { x: 30, y: 1022, w: 90, h: 177 }, rotation: 0 },
      { id: 'fx-3', kind: 'fridge', label: '冰箱', bounds: { x: 750, y: 1035, w: 99, h: 99 }, rotation: 0 },
    ],
    viewpoints: [
      { id: 'vp-1', x: 200, y: 400, heading: 0, fovDeg: 69, headingSource: 'arkit', photoRef: 'ph-a' },
      { id: 'vp-2', x: 270, y: 950, heading: 90, fovDeg: 69, headingSource: 'arkit', photoRef: 'ph-b' },
    ],
  }
}

const scan = fakeScan()
const mapped = mapScanIntoLayout(SAMPLE_508, scan)

// ---- 映射:东西要落进对的房间 ----
ok('全部映射成功', mapped.report.mapped === 7 && mapped.report.skipped === 0, JSON.stringify(mapped.report))
{
  const bed = mapped.placements.find((p) => p.kind === 'bed')
  ok('床进卧室', roomOf(bed.x + bed.w / 2, bed.y + bed.h / 2) === '卧室', roomOf(bed.x + bed.w / 2, bed.y + bed.h / 2))
  ok('床尺寸不变(实测值最准)', bed.w === 258 && bed.h === 225)
  const toilet = mapped.fixtures.find((f) => f.kind === 'toilet')
  const tc = { x: toilet.bounds.x + toilet.bounds.w / 2, y: toilet.bounds.y + toilet.bounds.h / 2 }
  // 扫描的「卫生间」分区罩住了 508 的浴室+洗衣间+走廊一整片。
  // 若让分区认领房间(方向反了),马桶会被 3.6ft 宽的洗衣间整个抢走。
  ok('马桶进浴室(不是洗衣间)', roomOf(tc.x, tc.y) === '浴室', roomOf(tc.x, tc.y))
  const tub = mapped.fixtures.find((f) => f.kind === 'tub')
  const ub = { x: tub.bounds.x + tub.bounds.w / 2, y: tub.bounds.y + tub.bounds.h / 2 }
  ok('浴缸进浴室', roomOf(ub.x, ub.y) === '浴室', roomOf(ub.x, ub.y))
  const cab = mapped.placements.find((p) => p.kind === 'cabinet')
  ok('卫生间的小收纳进浴室', roomOf(cab.x + cab.w / 2, cab.y + cab.h / 2) === '浴室')
  const fridge = mapped.fixtures.find((f) => f.kind === 'fridge')
  const fc = { x: fridge.bounds.x + fridge.bounds.w / 2, y: fridge.bounds.y + fridge.bounds.h / 2 }
  ok('冰箱进厨房', roomOf(fc.x, fc.y) === '厨房 · 餐区', roomOf(fc.x, fc.y))
}
ok('机位也映射', mapped.viewpoints.length === 2)
ok('映射件带 scan- 前缀', mapped.placements.every((p) => p.id.startsWith('scan-')))

// ---- 只加照片:户型和家具一概不动 ----
{
  const next = mergeViewpointsOnly(SAMPLE_508, mapped.viewpoints)
  ok('只加照片:墙体不动', next.walls === SAMPLE_508.walls)
  ok('只加照片:房间不动', next.rooms === SAMPLE_508.rooms)
  ok('只加照片:储藏区不动', next.storageZones === SAMPLE_508.storageZones)
  ok('只加照片:设施不动', next.fixtures === SAMPLE_508.fixtures)
  ok('只加照片:机位并进来', next.viewpoints.length === 2)
}

// ---- 摆家具:墙体仍不动,重合的手录件让位 ----
{
  const next = mergeFurnitureAndViewpoints(SAMPLE_508, mapped)
  ok('摆家具:墙体不动', next.walls.length === SAMPLE_508.walls.length)
  ok('摆家具:房间不动', next.rooms.length === SAMPLE_508.rooms.length)
  ok('摆家具:储藏区不动(31 件物品可不能丢)', next.storageZones.length === SAMPLE_508.storageZones.length)
  ok('摆家具:实测家具进来了', next.placements.length === 2)

  // 508 手录的马桶(294,953) 与实测马桶相距 <3ft → 让位
  const toilets = next.fixtures.filter((f) => f.kind === 'toilet')
  ok('马桶只剩一个(实测的顶掉手录的)', toilets.length === 1, `got=${toilets.length}`)
  ok('留下的是实测那个', toilets[0]?.id.startsWith('scan-'))

  // 扫描没扫到的手录件必须留着 —— 漏检 ≠ 东西不在
  const kept = next.fixtures.filter((f) => !f.id.startsWith('scan-')).map((f) => f.kind)
  ok('洗衣机/烘干机保留', kept.filter((k) => k === 'appliance').length === 2, kept.join(','))
  ok('挂杆保留', kept.includes('rod'), kept.join(','))
}

// ---- 关掉替换:手录件全留 ----
{
  const next = mergeFurnitureAndViewpoints(SAMPLE_508, mapped, { replaceNearby: false })
  ok(
    '不替换时手录件全留',
    next.fixtures.filter((f) => !f.id.startsWith('scan-')).length === SAMPLE_508.fixtures.length,
  )
}

// ---- 重扫:上次的扫描件整批换掉,不叠加 ----
{
  const once = mergeFurnitureAndViewpoints(SAMPLE_508, mapped)
  const twice = mergeFurnitureAndViewpoints(once, mapped)
  ok('重扫不叠加家具', twice.placements.length === once.placements.length, `${once.placements.length}→${twice.placements.length}`)
  ok('重扫不叠加设施', twice.fixtures.length === once.fixtures.length, `${once.fixtures.length}→${twice.fixtures.length}`)
  ok('重扫不叠加机位', twice.viewpoints.length === once.viewpoints.length)
}

// ---- 替换报告要与实际一致 ----
{
  const rep = describeReplacements(SAMPLE_508, mapped)
  const next = mergeFurnitureAndViewpoints(SAMPLE_508, mapped)
  const actuallyGone = SAMPLE_508.fixtures.filter(
    (f) => !next.fixtures.some((n) => n.id === f.id),
  ).length
  // 报告跨类比过(说挂杆要被柜子换掉),吓唬人且与实际不符
  ok('报告数 = 实际被顶掉数', rep.length === actuallyGone, `报告${rep.length} 实际${actuallyGone}`)
  ok('报告带挪动距离', rep.every((r) => typeof r.movedFt === 'number'))
}

// ---- 没分区的扫描 ----
{
  const m = mapScanIntoLayout(SAMPLE_508, { zones: [], placements: [], fixtures: [], viewpoints: [] })
  ok('空扫描不炸', m.report.mapped === 0 && m.placements.length === 0)
}

if (fails.length) {
  console.error(`FAIL ${fails.length} (pass ${pass})`)
  for (const f of fails) console.error('  ✗', f)
  process.exit(1)
}
console.log(`PASS ${pass} checks`)
