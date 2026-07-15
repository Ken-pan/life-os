import assert from 'node:assert/strict'
import {
  assessPhotoCoverage,
  coverageForZone,
  suggestCameraForZone,
  COVERAGE_ACTION,
  STALE_DAYS,
} from '../src/lib/spatial/photo-coverage.js'
import { pointInPolygon } from '../src/lib/spatial/zones.js'

const NOW = Date.parse('2026-07-15T12:00:00Z')
const daysAgoIso = (d) => new Date(NOW - d * 86400e3).toISOString()

/** 100×100 正方形分区 */
const sq = (id, nameZh, x0 = 0, y0 = 0, size = 100) => ({
  id,
  nameZh,
  polygon: [
    { x: x0, y: y0 },
    { x: x0 + size, y: y0 },
    { x: x0 + size, y: y0 + size },
    { x: x0, y: y0 + size },
  ],
})

const proj = (zones, viewpoints = [], placements = []) => ({
  zones,
  viewpoints,
  placements,
})

// —— 无分区:安静返回空,不炸 ——
assert.deepEqual(assessPhotoCoverage(proj([]), { now: NOW }), { zones: [], needs: [] })
assert.deepEqual(assessPhotoCoverage({}, { now: NOW }), { zones: [], needs: [] })

// —— 全盲分区:missing + 建议机位在区内、朝向对准家具 ——
{
  const zone = sq('z1', '卧室')
  // 家具堆在东侧
  const bed = { id: 'p1', kind: 'bed', label: '床', x: 70, y: 30, w: 25, h: 40, rotation: 0 }
  const { zones, needs } = assessPhotoCoverage(proj([zone], [], [bed]), { now: NOW })
  assert.equal(zones.length, 1)
  assert.equal(zones[0].status, 'missing')
  assert.equal(needs.length, 1)
  const s = zones[0].suggestion
  assert.ok(s, 'missing 必须带建议站位')
  assert.ok(pointInPolygon({ x: s.x, y: s.y }, zone.polygon), '建议站位必须在分区内')
  // 家具在东侧 → 站位应偏西(离目标远),朝向大致朝东(45°~135°)
  assert.ok(s.x < 50, `站位该在西半边,实际 x=${s.x}`)
  assert.ok(s.heading > 45 && s.heading < 135, `朝向该大致朝东,实际 ${s.heading}°`)
  assert.ok(COVERAGE_ACTION[zones[0].status], '每种待办状态都要有按钮文案')
}

// —— 没家具的分区:建议照样给,朝分区形心 ——
{
  const zone = sq('z1', '空房')
  const s = suggestCameraForZone(zone, [])
  assert.ok(s && pointInPolygon({ x: s.x, y: s.y }, zone.polygon))
}

// —— 确定性:同一输入两次调用逐字节一致 ——
{
  const zone = sq('z1', '卧室')
  const p = proj([zone], [], [{ id: 'p1', kind: 'desk', label: '桌', x: 10, y: 10, w: 30, h: 20, rotation: 0 }])
  assert.deepEqual(
    assessPhotoCoverage(p, { now: NOW }),
    assessPhotoCoverage(p, { now: NOW }),
  )
}

// —— L 形(凹)分区:候选点收进来可能落在区外,过滤后仍要给出区内站位 ——
{
  const zone = {
    id: 'zL',
    nameZh: 'L形客厅',
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ],
  }
  const s = suggestCameraForZone(zone, [])
  assert.ok(s && pointInPolygon({ x: s.x, y: s.y }, zone.polygon), 'L形分区站位必须在区内')
}

// —— 机位状态阶梯:noPhoto → undescribed → stale → fresh ——
{
  const zone = sq('z1', '卧室')
  const mk = (extra) => ({ id: 'vp-1', x: 50, y: 50, heading: 0, fovDeg: 69, ...extra })

  let r = assessPhotoCoverage(proj([zone], [mk({})]), { now: NOW })
  assert.equal(r.zones[0].status, 'noPhoto')
  assert.equal(r.zones[0].viewpointId, 'vp-1')

  r = assessPhotoCoverage(proj([zone], [mk({ photoRef: 'ph1' })]), { now: NOW })
  assert.equal(r.zones[0].status, 'undescribed')

  r = assessPhotoCoverage(
    proj([zone], [mk({ photoRef: 'ph1', describedAt: daysAgoIso(STALE_DAYS + 3) })]),
    { now: NOW },
  )
  assert.equal(r.zones[0].status, 'stale')
  assert.equal(r.zones[0].daysAgo, STALE_DAYS + 3)
  assert.ok(r.zones[0].reason.includes(`${STALE_DAYS + 3} 天前`), '过期理由要说人话')

  r = assessPhotoCoverage(
    proj([zone], [mk({ photoRef: 'ph1', describedAt: daysAgoIso(2) })]),
    { now: NOW },
  )
  assert.equal(r.zones[0].status, 'fresh')
  assert.equal(r.needs.length, 0, '新鲜的不该进任务清单')
}

// —— 多机位取 describedAt 最新的那个判新旧 ——
{
  const zone = sq('z1', '卧室')
  const old = { id: 'vp-1', x: 20, y: 20, heading: 0, fovDeg: 69, photoRef: 'a', describedAt: daysAgoIso(30) }
  const fresh = { id: 'vp-2', x: 80, y: 80, heading: 0, fovDeg: 69, photoRef: 'b', describedAt: daysAgoIso(1) }
  const r = assessPhotoCoverage(proj([zone], [old, fresh]), { now: NOW })
  assert.equal(r.zones[0].status, 'fresh')
  assert.equal(r.zones[0].viewpointId, 'vp-2')
}

// —— 机位归区几何优先:zoneId 标着别的区,但坐标落在本区,算本区的 ——
{
  const z1 = sq('z1', '卧室', 0, 0)
  const z2 = sq('z2', '客厅', 200, 0)
  const vp = { id: 'vp-1', x: 50, y: 50, heading: 0, fovDeg: 69, zoneId: 'z2', photoRef: 'a', describedAt: daysAgoIso(1) }
  const r = assessPhotoCoverage(proj([z1, z2], [vp]), { now: NOW })
  assert.equal(r.zones.find((z) => z.zoneId === 'z1').status, 'fresh', '几何命中优先于 zoneId')
  assert.equal(r.zones.find((z) => z.zoneId === 'z2').status, 'missing')
}

// —— 坐标在所有多边形之外时回退 zoneId ——
{
  const z1 = sq('z1', '卧室', 0, 0)
  const vp = { id: 'vp-1', x: 500, y: 500, heading: 0, fovDeg: 69, zoneId: 'z1', photoRef: 'a', describedAt: daysAgoIso(1) }
  const r = assessPhotoCoverage(proj([z1], [vp]), { now: NOW })
  assert.equal(r.zones[0].status, 'fresh', '区外机位按 zoneId 兜底归区')
}

// —— needs 按优先级排:missing 最前,stale 最后 ——
{
  const zs = [sq('za', 'A', 0, 0), sq('zb', 'B', 200, 0), sq('zc', 'C', 400, 0), sq('zd', 'D', 600, 0)]
  const vps = [
    { id: 'vp-b', x: 250, y: 50, heading: 0, fovDeg: 69 }, // B: noPhoto
    { id: 'vp-c', x: 450, y: 50, heading: 0, fovDeg: 69, photoRef: 'c' }, // C: undescribed
    { id: 'vp-d', x: 650, y: 50, heading: 0, fovDeg: 69, photoRef: 'd', describedAt: daysAgoIso(20) }, // D: stale
  ]
  const { needs } = assessPhotoCoverage(proj(zs, vps), { now: NOW })
  assert.deepEqual(
    needs.map((n) => n.status),
    ['missing', 'noPhoto', 'undescribed', 'stale'],
  )
}

// —— 不传 now:跳过过期判断,识别过就算新鲜(UI 忘传也不会误报) ——
{
  const zone = sq('z1', '卧室')
  const vp = { id: 'vp-1', x: 50, y: 50, heading: 0, fovDeg: 69, photoRef: 'a', describedAt: daysAgoIso(100) }
  const r = assessPhotoCoverage(proj([zone], [vp]))
  assert.equal(r.zones[0].status, 'fresh')
}

// —— 站位不能落在家具上 ——
{
  const zone = sq('z1', '卧室')
  // 目标家具在东侧;西侧整面被一张大床占住 —— 「离目标最远」的候选全在床里,必须让开
  const westBed = { id: 'p1', kind: 'bed', label: '床', x: 0, y: 0, w: 40, h: 100, rotation: 0 }
  const eastDesk = { id: 'p2', kind: 'desk', label: '桌', x: 80, y: 40, w: 15, h: 20, rotation: 0 }
  const s = suggestCameraForZone(zone, [westBed, eastDesk])
  assert.ok(s, '有家具挡着也要给出站位')
  assert.ok(pointInPolygon({ x: s.x, y: s.y }, zone.polygon), '站位在分区内')
  const insideBed = s.x >= 0 && s.x <= 40 && s.y >= 0 && s.y <= 100
  const insideDesk = s.x >= 80 && s.x <= 95 && s.y >= 40 && s.y <= 60
  assert.ok(!insideBed && !insideDesk, `站位不能在家具里,实际 (${s.x}, ${s.y})`)
}

// —— 家具占满全部候选点:退回不过滤,仍要给出建议 ——
{
  const zone = sq('z1', '储物间', 0, 0, 40)
  const wallToWall = { id: 'p1', kind: 'cabinet', label: '柜', x: 0, y: 0, w: 40, h: 40, rotation: 0 }
  const s = suggestCameraForZone(zone, [wallToWall])
  assert.ok(s && pointInPolygon({ x: s.x, y: s.y }, zone.polygon), '全屋皆柜也要给个可微调的起点')
}

// —— 508 参数户型没有 zones:拿 rooms 兜底,和动线分析看到同一套分区 ——
{
  const p = {
    zones: [],
    viewpoints: [],
    placements: [],
    rooms: [
      { id: 'r1', nameZh: '厨房', kind: 'room', bounds: { x: 0, y: 0, w: 100, h: 100 } },
      { id: 'r2', nameZh: '', kind: 'structural', bounds: { x: 200, y: 0, w: 50, h: 50 } },
    ],
  }
  const r = assessPhotoCoverage(p, { now: NOW })
  assert.equal(r.zones.length, 1, '承重墙不算房间')
  assert.equal(r.zones[0].zoneId, 'r1')
  assert.equal(r.zones[0].status, 'missing')
  assert.ok(r.zones[0].suggestion, 'rooms 兜底的分区也要给建议站位')
}

// —— coverageForZone:找得到给结论,找不到给 null ——
{
  const zone = sq('z1', '卧室')
  assert.equal(coverageForZone(proj([zone]), 'z1', { now: NOW })?.status, 'missing')
  assert.equal(coverageForZone(proj([zone]), 'nope', { now: NOW }), null)
}

console.log('photo-coverage-unit: all assertions passed')
