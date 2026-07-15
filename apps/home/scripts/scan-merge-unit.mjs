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
  // 扫描侧的实测墙体(与 zones 同一坐标系):墙距锚定的依据。
  // 只围出卧室/厨房/卫生间三个矩形,客厅故意不给墙 —— 走比例回退分支。
  const rect = (idBase, x, y, w, h) => ({
    vertices: [
      { id: `${idBase}-1`, x, y },
      { id: `${idBase}-2`, x: x + w, y },
      { id: `${idBase}-3`, x: x + w, y: y + h },
      { id: `${idBase}-4`, x, y: y + h },
    ],
    edges: [
      { id: `${idBase}-e1`, a: `${idBase}-1`, b: `${idBase}-2` },
      { id: `${idBase}-e2`, a: `${idBase}-2`, b: `${idBase}-3` },
      { id: `${idBase}-e3`, a: `${idBase}-3`, b: `${idBase}-4` },
      { id: `${idBase}-e4`, a: `${idBase}-4`, b: `${idBase}-1` },
    ],
  })
  const r1 = rect('w1', 24, 185, 411, 565)
  const r3 = rect('w3', 334, 620, 520, 578)
  const r4 = rect('w4', 31, 739, 483, 461)
  return {
    wallGraph: {
      pxPerFt: 36,
      margin: { x: 24, y: 24 },
      vertices: [...r1.vertices, ...r3.vertices, ...r4.vertices],
      edges: [...r1.edges, ...r3.edges, ...r4.edges],
    },
    zones: [
      zone('z-1', '卧室', 24, 185, 411, 565),
      zone('z-2', '客厅', 414, 256, 440, 396),
      zone('z-3', '厨房', 334, 620, 520, 578),
      zone('z-4', '卫生间', 31, 739, 483, 461),
    ],
    placements: [
      { id: 'pl-1', kind: 'bed', label: '床', x: 60, y: 300, w: 258, h: 225, rotation: 0, zoneId: 'z-1', attrs: { heightIn: 22, colorHex: '#7A8CA3', photoRef: 'ph-bed' } },
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
  ok(
    '外观 attrs 跟着家具走',
    bed.attrs?.colorHex === '#7A8CA3' && bed.attrs?.photoRef === 'ph-bed' && bed.attrs?.heightIn === 22,
    JSON.stringify(bed.attrs),
  )

  // ---- 墙距锚定:贴墙家具按实测墙距落位,不吃分区比例的漂移 ----
  // 床在扫描里离卧室西墙 36px(12″)→ 本地也必须正好离卧室西墙 12″
  const bedroom = SAMPLE_508.rooms.find((r) => r.nameZh === '卧室')
  ok(
    '床按实测墙距锚定西墙',
    Math.abs(bed.x - (bedroom.bounds.x + 36)) < 0.5,
    `bed.x=${bed.x} 期望=${bedroom.bounds.x + 36}`,
  )
  // 浴缸在扫描里贴死西墙(gap 0)、贴死南墙(gap 1px)→ 本地钉在浴室西南角
  const bathroom = SAMPLE_508.rooms.find((r) => r.nameZh === '浴室')
  const tubM = mapped.fixtures.find((f) => f.kind === 'tub')
  ok(
    '浴缸钉在浴室西南角(双向锚定)',
    Math.abs(tubM.bounds.x - bathroom.bounds.x) < 0.5 &&
      Math.abs(tubM.bounds.y + tubM.bounds.h - (bathroom.bounds.y + bathroom.bounds.h - 1)) < 1.5,
    JSON.stringify({ tub: tubM.bounds, room: bathroom.bounds }),
  )
  ok('锚定计数进报告', mapped.report.anchored >= 4, `anchored=${mapped.report.anchored}`)
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

// ---- 家具必须活过 hydrate(508 参数模式曾把它整个丢掉) ----
{
  const { hydrateProject } = await import('../src/lib/spatial/model.js')
  const merged = mergeFurnitureAndViewpoints(SAMPLE_508, mapped)
  const h1 = hydrateProject(merged)
  // 此前 508 分支硬编码 furniture:[] 且不 carry placements ——
  // setActiveProject 当场看得见,刷新一次(load→hydrate)家具就蒸发了
  ok('hydrate 后家具还在', h1.placements.length === merged.placements.length, `${merged.placements.length}→${h1.placements.length}`)
  ok('hydrate 派生出渲染用 furniture', h1.furniture.length === h1.placements.length)
  ok('hydrate 后实测设施还在', h1.fixtures.some((f) => String(f.id).startsWith('scan-')))
  ok('hydrate 不动户型', h1.walls.length === SAMPLE_508.walls.length && h1.rooms.length === SAMPLE_508.rooms.length)
  ok('hydrate 不动储藏区', h1.storageZones.length === SAMPLE_508.storageZones.length)
  // 内置设施每次重新生成,重复 hydrate 不能让它们越并越多
  const h2 = hydrateProject(h1)
  ok('重复 hydrate 幂等', h2.fixtures.length === h1.fixtures.length && h2.placements.length === h1.placements.length,
    `fx ${h1.fixtures.length}→${h2.fixtures.length}`)
}

// ---- 全局刚性配准路径(墙不变 → 一次变换全体家具,墙距只做有界精修) ----
{
  const rect = (idBase, x, y, w, h) => ({
    vertices: [
      { id: `${idBase}-1`, x, y },
      { id: `${idBase}-2`, x: x + w, y },
      { id: `${idBase}-3`, x: x + w, y: y + h },
      { id: `${idBase}-4`, x, y: y + h },
    ],
    edges: [
      { id: `${idBase}-e1`, a: `${idBase}-1`, b: `${idBase}-2` },
      { id: `${idBase}-e2`, a: `${idBase}-2`, b: `${idBase}-3` },
      { id: `${idBase}-e3`, a: `${idBase}-3`, b: `${idBase}-4` },
      { id: `${idBase}-e4`, a: `${idBase}-4`, b: `${idBase}-1` },
    ],
  })
  const graphOf = (...rects) => ({
    pxPerFt: 36,
    margin: { x: 24, y: 24 },
    vertices: rects.flatMap((r) => r.vertices),
    edges: rects.flatMap((r) => r.edges),
  })
  // 极简本地户型:三个矩形房(客厅/卧室/厨房),无 wallGraph → 墙取房间 bounds
  const localStub = {
    rooms: [
      { id: 'r-a', nameZh: '客厅', kind: 'living', bounds: { x: 100, y: 100, w: 400, h: 300 } },
      { id: 'r-b', nameZh: '卧室', kind: 'living', bounds: { x: 500, y: 100, w: 300, h: 300 } },
      { id: 'r-c', nameZh: '厨房', kind: 'living', bounds: { x: 100, y: 400, w: 400, h: 250 } },
    ],
  }
  const zoneStub = [{ id: 'z-x', nameZh: '扫描区', polygon: [
    { x: 190, y: 55 }, { x: 890, y: 55 }, { x: 890, y: 605 }, { x: 190, y: 605 } ] }]

  // 扫描 = 本地整体平移 (+90, -45);厨房西墙故意偏 4px(配准级小误差 → 自动精修),
  // 卧室西墙故意偏 18px(>10cm → 必须报冲突,不许吸附)
  const scanA = {
    wallGraph: graphOf(
      rect('a', 190, 55, 400, 300),
      rect('b', 608, 55, 282, 300),
      rect('c', 194, 355, 396, 250),
    ),
    zones: zoneStub,
    placements: [
      // 沙发:扫描里贴死客厅西墙(gap 0)→ 家坐标必须正好贴本地客厅西墙
      { id: 'p-sofa', kind: 'sofa', label: '沙发', x: 190, y: 155, w: 80, h: 40, rotation: 0 },
      // 柜:贴死厨房西墙(该墙在扫描里偏 4px)→ 自动精修回本地墙面
      { id: 'p-cab', kind: 'cabinet', label: '柜', x: 194, y: 455, w: 60, h: 40, rotation: 0 },
      // 床:贴死卧室西墙(该墙偏 18px ≈ 15cm)→ 冲突上报,位置不吸附
      { id: 'p-bed', kind: 'bed', label: '床', x: 608, y: 155, w: 100, h: 80, rotation: 0 },
    ],
    fixtures: [],
    viewpoints: [
      { id: 'v-1', x: 300, y: 200, heading: 30, fovDeg: 69, headingSource: 'arkit' },
    ],
  }
  const mA = mapScanIntoLayout(localStub, scanA)
  ok('配准:状态 ok', mA.report.registration?.status === 'ok', JSON.stringify(mA.report.registration))
  ok('配准:识别为纯平移(yaw 0)', mA.report.registration?.yawDeg === 0)
  const sofa = mA.placements.find((p) => p.kind === 'sofa')
  const cab = mA.placements.find((p) => p.kind === 'cabinet')
  const bedA = mA.placements.find((p) => p.kind === 'bed')
  ok('配准:贴墙沙发精确回到本地墙面', Math.abs(sofa.x - 100) <= 1, `x=${sofa.x}`)
  ok('配准:4px 墙差被自动精修', Math.abs(cab.x - 100) <= 1, `x=${cab.x}`)
  ok('配准:精修计数', mA.report.refined >= 1, `refined=${mA.report.refined}`)
  ok(
    '配准:18px 墙差报冲突且不吸附',
    mA.report.conflicts.some((c) => c.label === '床') && Math.abs(bedA.x - 518) <= 2.5,
    `x=${bedA.x} conflicts=${JSON.stringify(mA.report.conflicts)}`,
  )
  ok('配准:房间归属正确', sofa.zoneId === undefined && mA.report.rooms.some((r) => r.nameZh === '客厅'))
  const vpA = mA.viewpoints[0]
  ok('配准:机位统一变换', Math.abs(vpA.x - 210) <= 2.5 && Math.abs(vpA.y - 245) <= 2.5 && Math.abs(vpA.heading - 30) <= 0.5,
    JSON.stringify(vpA))

  // ---- 旋转 90° 的扫描:恢复 yaw,家具脚印互换、朝向/heading 跟着转 ----
  const t = { x: 60, y: 30 }
  // 正变换 home = rot90(scan)+t,rot90(p)=(-y,x);构造扫描 = 逆变换本地
  const toScan = (p) => ({ x: p.y - t.y, y: -(p.x - t.x) })
  const rectFromCorners = (idBase, c1, c2) => rect(
    idBase,
    Math.min(c1.x, c2.x),
    Math.min(c1.y, c2.y),
    Math.abs(c2.x - c1.x),
    Math.abs(c2.y - c1.y),
  )
  const scanRect = (idBase, b) => rectFromCorners(
    idBase,
    toScan({ x: b.x, y: b.y }),
    toScan({ x: b.x + b.w, y: b.y + b.h }),
  )
  const bedHome = { x: 500 + 36, y: 100 + 120, w: 100, h: 80 }
  const bedScan = rectFromCorners('bb', toScan({ x: bedHome.x, y: bedHome.y }),
    toScan({ x: bedHome.x + bedHome.w, y: bedHome.y + bedHome.h }))
  const bs = {
    x: Math.min(...bedScan.vertices.map((v) => v.x)),
    y: Math.min(...bedScan.vertices.map((v) => v.y)),
    w: Math.abs(bedScan.vertices[1].x - bedScan.vertices[0].x) || Math.abs(bedScan.vertices[2].x - bedScan.vertices[1].x),
  }
  const scanB = {
    wallGraph: graphOf(
      scanRect('a', localStub.rooms[0].bounds),
      scanRect('b', localStub.rooms[1].bounds),
      scanRect('c', localStub.rooms[2].bounds),
    ),
    zones: zoneStub,
    placements: [
      { id: 'p-bed', kind: 'bed', label: '床', x: bs.x, y: bs.y, w: bedHome.h, h: bedHome.w, rotation: 270 },
    ],
    fixtures: [],
    viewpoints: [
      { id: 'v-1', x: toScan({ x: 300, y: 200 }).x, y: toScan({ x: 300, y: 200 }).y, heading: 270, fovDeg: 69, headingSource: 'arkit' },
    ],
  }
  const mB = mapScanIntoLayout(localStub, scanB)
  ok('旋转配准:恢复 yaw 90', mB.report.registration?.status === 'ok' && mB.report.registration?.yawDeg === 90,
    JSON.stringify(mB.report.registration))
  const bedB = mB.placements[0]
  ok(
    '旋转配准:床落回原位且脚印互换',
    Math.abs(bedB.x - bedHome.x) <= 2.5 && Math.abs(bedB.y - bedHome.y) <= 2.5 &&
      Math.abs(bedB.w - bedHome.w) <= 1 && Math.abs(bedB.h - bedHome.h) <= 1,
    JSON.stringify({ bedB, bedHome }),
  )
  ok('旋转配准:rotation 归位', bedB.rotation === 0, `rot=${bedB.rotation}`)
  ok('旋转配准:heading 跟转', Math.abs(mB.viewpoints[0].heading - 0) <= 0.5, `h=${mB.viewpoints[0].heading}`)

  // ---- 拉伸的扫描必须被验收门拦下(fakeScan 的 y 向 14% 拉伸)----
  ok(
    '拉伸扫描被配准门拦下,走比例回退',
    mapped.report.registration?.status === 'needs_rescan',
    JSON.stringify(mapped.report.registration),
  )
}

// ---- 跨扫描物体身份:重扫不换 id,挪动被量化,消失被点名 ----
{
  const { mergeFurnitureWithIdentity } = await import('../src/lib/spatial/scan-merge.js')
  const { matchScanObjects } = await import('../src/lib/spatial/scan-identity.js')

  // 第一次合并出的项目:两件扫描家具(带 VLM 成果)+ 一件后来消失的椅子
  const prevProject = {
    ...SAMPLE_508,
    placements: [
      { id: 'scan-pl-1', kind: 'sofa', label: '沙发', x: 400, y: 300, w: 261, h: 108, rotation: 0,
        attrs: { colorHex: '#B08968', material: '布艺', styleZh: 'L形', describedAt: '2026-07-14' } },
      { id: 'scan-pl-2', kind: 'cabinet', label: '柜', x: 700, y: 300, w: 78, h: 159, rotation: 0,
        attrs: { colorHex: '#EEEEEE' } },
      { id: 'scan-pl-3', kind: 'chair', label: '椅', x: 500, y: 500, w: 50, h: 50, rotation: 0 },
    ],
    fixtures: [],
    viewpoints: [],
  }
  // 新一轮扫描映射结果:沙发原位(尺寸微抖 2px)、柜挪了 4ft、椅没扫到、新增台灯
  const incoming = {
    placements: [
      { id: 'scan-pl-9', kind: 'sofa', label: '沙发', x: 402, y: 301, w: 259, h: 108, rotation: 0,
        attrs: { colorHex: '#B29070', measuredWIn: 86.3, measuredHIn: 36 } },
      { id: 'scan-pl-8', kind: 'cabinet', label: '柜', x: 700, y: 444, w: 80, h: 160, rotation: 0,
        attrs: { colorHex: '#F0F0F0' } },
      { id: 'scan-pl-7', kind: 'floor_lamp', label: '落地灯', x: 300, y: 300, w: 20, h: 20, rotation: 0 },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const { project: p2, identity } = mergeFurnitureWithIdentity(prevProject, incoming)
  const sofa2 = p2.placements.find((p) => p.kind === 'sofa')
  const cab2 = p2.placements.find((p) => p.kind === 'cabinet')
  ok('同一件沙发保住旧 id', sofa2?.id === 'scan-pl-1', sofa2?.id)
  ok('沙发几何取新扫描', sofa2?.w === 259 && sofa2?.x === 402)
  ok(
    '旧 VLM 成果不被重扫抹掉',
    sofa2?.attrs?.material === '布艺' && sofa2?.attrs?.describedAt === '2026-07-14',
    JSON.stringify(sofa2?.attrs),
  )
  ok('新扫描的实测真值并入', sofa2?.attrs?.measuredWIn === 86.3)
  ok('沙发判原位', identity.unchanged >= 1, JSON.stringify(identity))
  ok('柜保住旧 id 且判挪动', cab2?.id === 'scan-pl-2' && identity.moved.some((m) => m.label === '柜' && m.movedFt === 4),
    JSON.stringify(identity.moved))
  ok('椅消失被点名', identity.removed.includes('椅'), JSON.stringify(identity.removed))
  ok('台灯是新增', identity.added === 1 && p2.placements.some((p) => p.kind === 'floor_lamp'))
  ok('椅不再留在项目里', !p2.placements.some((p) => p.kind === 'chair'))

  // 低置信度尺寸抖动(508 真扫:low 柜子两次测量差 7-28″)不该拆成「消失+新增」
  const lowConfWobble = matchScanObjects(
    [{ id: 'scan-w1', kind: 'cabinet', x: 100, y: 100, w: 300, h: 60,
       attrs: { confidence: 'low' } }],
    [{ id: 'scan-w2', kind: 'cabinet', x: 110, y: 102, w: 354, h: 53,
       attrs: { confidence: 'low' } }],
  )
  ok(
    '低置信度尺寸抖动仍认同一件',
    lowConfWobble.pairs.length === 1 && lowConfWobble.added.length === 0,
    JSON.stringify(lowConfWobble),
  )
  // 同样的抖动在高置信度下不放宽(高置信度尺寸差 18″ 更可能真是两件)
  const highConfSame = matchScanObjects(
    [{ id: 'scan-w1', kind: 'cabinet', x: 100, y: 100, w: 300, h: 60,
       attrs: { confidence: 'high' } }],
    [{ id: 'scan-w2', kind: 'cabinet', x: 110, y: 102, w: 354, h: 53,
       attrs: { confidence: 'high' } }],
  )
  ok('高置信度不放宽尺寸容差', highConfSame.pairs.length === 0, JSON.stringify(highConfSame.pairs))

  // 样式精化翻 kind(转椅↔椅,508 真扫实测)不该拆成两件;跨族(椅↔柜)仍否决
  const kindFlip = matchScanObjects(
    [{ id: 'scan-k1', kind: 'office_chair', x: 100, y: 100, w: 66, h: 75, attrs: { confidence: 'low' } }],
    [{ id: 'scan-k2', kind: 'chair', x: 130, y: 110, w: 78, h: 84, attrs: { confidence: 'low' } }],
  )
  ok('转椅↔椅 同族可匹配', kindFlip.pairs.length === 1, JSON.stringify(kindFlip))
  const crossFamily = matchScanObjects(
    [{ id: 'scan-k1', kind: 'chair', x: 100, y: 100, w: 66, h: 75 }],
    [{ id: 'scan-k2', kind: 'cabinet', x: 100, y: 100, w: 66, h: 75 }],
  )
  ok('椅↔柜 跨族否决', crossFamily.pairs.length === 0)

  // 歧义:两把同尺寸椅子距离接近同一把新椅 → 不敢认,possibly_same
  const amb = matchScanObjects(
    [
      { id: 'scan-c1', kind: 'chair', x: 100, y: 100, w: 50, h: 50 },
      { id: 'scan-c2', kind: 'chair', x: 160, y: 100, w: 50, h: 50 },
    ],
    [{ id: 'scan-n1', kind: 'chair', x: 130, y: 100, w: 50, h: 50 }],
  )
  ok('双胞胎椅子不硬认', amb.pairs.every((p) => p.state === 'possibly_same'), JSON.stringify(amb.pairs))
}

// ---- 双扫描融合:置信度高的尺寸赢,原位家具位置取中点 ----
{
  const { fuseScans } = await import('../src/lib/spatial/scan-fuse.js')
  const rect = (idBase, x, y, w, h) => ({
    vertices: [
      { id: `${idBase}-1`, x, y }, { id: `${idBase}-2`, x: x + w, y },
      { id: `${idBase}-3`, x: x + w, y: y + h }, { id: `${idBase}-4`, x, y: y + h },
    ],
    edges: [
      { id: `${idBase}-e1`, a: `${idBase}-1`, b: `${idBase}-2` },
      { id: `${idBase}-e2`, a: `${idBase}-2`, b: `${idBase}-3` },
      { id: `${idBase}-e3`, a: `${idBase}-3`, b: `${idBase}-4` },
      { id: `${idBase}-e4`, a: `${idBase}-4`, b: `${idBase}-1` },
    ],
  })
  const walls = (dx) => ({
    pxPerFt: 36, margin: { x: 24, y: 24 },
    vertices: [...rect('a', 100 + dx, 100, 400, 300).vertices, ...rect('b', 100 + dx, 400, 400, 250).vertices],
    edges: [...rect('a', 100 + dx, 100, 400, 300).edges, ...rect('b', 100 + dx, 400, 400, 250).edges],
  })
  const base = {
    wallGraph: walls(0),
    zones: [],
    placements: [
      // 问题柜:base 低置信度量成 300px 宽;other 用 medium 量成 220px → 该采 220
      { id: 'pl-1', kind: 'cabinet', label: '柜', x: 110, y: 110, w: 300, h: 60, rotation: 0,
        attrs: { confidence: 'low' } },
      // 沙发:两次都原位,中心差 12px → 融合后取中点
      { id: 'pl-2', kind: 'sofa', label: '沙发', x: 200, y: 300, w: 240, h: 100, rotation: 0,
        attrs: { confidence: 'high' } },
      // base 独有的:保留
      { id: 'pl-3', kind: 'chair', label: '椅', x: 150, y: 500, w: 60, h: 60, rotation: 0 },
      // 公寓钉死的:另一次扫描置信度再高也没得融
      { id: 'pl-9', kind: 'washer', label: '洗衣机', x: 130, y: 420, w: 80, h: 90, rotation: 0,
        fixed: true, attrs: { confidence: 'low' } },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const other = {
    wallGraph: walls(80), // 整体平移 80px 的另一次扫描
    zones: [],
    placements: [
      { id: 'o-1', kind: 'cabinet', label: '柜', x: 190, y: 112, w: 240, h: 58, rotation: 0,
        attrs: { confidence: 'medium', heightIn: 36 } },
      { id: 'o-2', kind: 'sofa', label: '沙发', x: 292, y: 302, w: 238, h: 102, rotation: 0,
        attrs: { confidence: 'high' } },
      // 洗衣机在 other 帧里(整体 +80)且「测得」更大、位置漂了 20px、置信度 high
      { id: 'o-9', kind: 'washer', label: '洗衣机', x: 230, y: 425, w: 90, h: 95, rotation: 0,
        attrs: { confidence: 'high' } },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const { homeos, report } = fuseScans(base, other)
  ok('融合:配准 ok', report.registration.status === 'ok', JSON.stringify(report.registration))
  const cab = homeos.placements.find((p) => p.id === 'pl-1')
  ok('融合:低置信度尺寸被 medium 的替换', Math.abs(cab.w - 240) <= 1, `w=${cab.w}`)
  ok('融合:置信度跟着升级', cab.attrs.confidence === 'medium' && cab.attrs.heightIn === 36)
  ok('融合:实测真值同步更新', Math.abs(cab.attrs.measuredWIn - 240 / 3) <= 0.2, `mW=${cab.attrs.measuredWIn}`)
  ok('融合:尺寸分歧留了备注', report.adopted.length === 1, JSON.stringify(report.adopted))
  const sofa = homeos.placements.find((p) => p.id === 'pl-2')
  // base 中心 (320,350),other 变换后中心 (331,353) → 中点 (325.5,351.5)
  ok('融合:原位沙发位置取中点', Math.abs(sofa.x + sofa.w / 2 - 325.5) <= 1.5 && report.averaged >= 1,
    `cx=${sofa.x + sofa.w / 2}`)
  ok('融合:独有件保留', homeos.placements.some((p) => p.id === 'pl-3'))
  const fixedWasher = homeos.placements.find((p) => p.id === 'pl-9')
  ok('融合:钉死的洗衣机几何纹丝不动(高置信度也不采)',
    fixedWasher.x === 130 && fixedWasher.w === 80 && fixedWasher.attrs.confidence === 'low',
    JSON.stringify(fixedWasher))
  // 对不齐的两次扫描不硬融
  const bad = fuseScans(base, { ...other, wallGraph: { pxPerFt: 36, margin: { x: 0, y: 0 }, vertices: [], edges: [] } })
  ok('融合:没墙就不融,原样返回', bad.report.registration.status === 'needs_rescan' &&
    bad.homeos.placements.find((p) => p.id === 'pl-1').w === 300)
}

// ---- 名字跟着身份走 + 优化副本(pl-* id)的家具也有身份 ----
{
  const { mergeFurnitureWithIdentity } = await import('../src/lib/spatial/scan-merge.js')
  // 服务端优化副本落地后的项目:id 是 pl-*(非 scan- 前缀),但带实测 attrs;
  // 名字是人起的(「电视格子柜」),重扫不许改回「柜」
  const prevProject = {
    ...SAMPLE_508,
    placements: [
      { id: 'pl-10', kind: 'cabinet', label: '电视格子柜', x: 700, y: 300, w: 158, h: 59, rotation: 0,
        attrs: { measuredWIn: 52.7, measuredHIn: 19.7, confidence: 'high', colorHex: '#FFFFFF' } },
      // 手录的(无实测 attrs)仍是手录语义
      { id: 'p-manual', kind: 'rug', label: 'Onyx', x: 100, y: 700, w: 60, h: 48, rotation: 0 },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const incoming = {
    placements: [
      { id: 'scan-pl-3', kind: 'cabinet', label: '柜', x: 702, y: 302, w: 156, h: 60, rotation: 0,
        attrs: { measuredWIn: 52, measuredHIn: 20, confidence: 'high', colorHex: '#F8F8F8' } },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const { project: p2, identity } = mergeFurnitureWithIdentity(prevProject, incoming)
  const cab = p2.placements.find((p) => p.kind === 'cabinet')
  ok('优化副本的 pl-* id 参与身份配对(不被当手录顶掉)', cab?.id === 'pl-10', cab?.id)
  ok('自定义名字不被新扫描的通用名冲掉', cab?.label === '电视格子柜', cab?.label)
  ok('几何仍取新扫描', cab?.w === 156 && cab?.x === 702)
  ok('配对判原位', identity.unchanged === 1, JSON.stringify(identity))
  ok('无实测 attrs 的手录件保留', p2.placements.some((p) => p.id === 'p-manual'))
  ok('柜不重复出现', p2.placements.filter((p) => p.kind === 'cabinet').length === 1)
}

// ---- 公寓钉死(fixed):扫描永远动不了、扫不到也不消失、不长第二台 ----
{
  const { mergeFurnitureWithIdentity } = await import('../src/lib/spatial/scan-merge.js')
  const prevProject = {
    ...SAMPLE_508,
    placements: [
      // 钉死 + 手录(无实测 attrs):洗衣机 —— 也要进配对池
      { id: 'pl-22', kind: 'washer', label: '洗衣机', x: 300, y: 380, w: 81, h: 90, rotation: 0,
        fixed: true },
      // 钉死 + 扫描出身:内嵌下柜
      { id: 'pl-3', kind: 'cabinet', label: '厨房下柜', x: 400, y: 800, w: 224, h: 78, rotation: 0,
        fixed: true, attrs: { measuredWIn: 74.7, confidence: 'high' } },
      // 钉死但这次没扫到
      { id: 'pl-31', kind: 'air_purifier', label: '窗式空调', x: 1188, y: 604, w: 24, h: 78, rotation: 0,
        fixed: true },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const incoming = {
    placements: [
      // 扫描说洗衣机挪了约 3ft、还变大了 —— 对钉死的东西这只能是噪声
      { id: 'scan-a', kind: 'washer', label: '洗衣机', x: 400, y: 390, w: 85, h: 92, rotation: 0,
        attrs: { confidence: 'high', colorHex: '#EEEEEE' } },
      { id: 'scan-b', kind: 'cabinet', label: '柜', x: 405, y: 803, w: 230, h: 80, rotation: 0,
        attrs: { measuredWIn: 76.7, confidence: 'high' } },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const { project: p2, identity } = mergeFurnitureWithIdentity(prevProject, incoming)
  const washer = p2.placements.find((p) => p.kind === 'washer')
  ok('钉死的洗衣机几何纹丝不动', washer?.x === 300 && washer?.w === 81 && washer?.id === 'pl-22',
    JSON.stringify(washer))
  ok('钉死件不报「挪过」', identity.moved.length === 0, JSON.stringify(identity.moved))
  ok('扫描的 attrs 仍并进钉死件(照片/颜色不浪费)', washer?.attrs?.colorHex === '#EEEEEE')
  const cab = p2.placements.find((p) => p.kind === 'cabinet')
  ok('钉死的下柜几何/名字都不动', cab?.x === 400 && cab?.label === '厨房下柜')
  ok('没扫到的钉死件不消失', p2.placements.some((p) => p.id === 'pl-31'))
  ok('没扫到的钉死件不进 removed', !identity.removed.includes('窗式空调'),
    JSON.stringify(identity.removed))
  ok('洗衣机没长出第二台', p2.placements.filter((p) => p.kind === 'washer').length === 1)
}

// ---- 房间更新(scanScope=partial):只动扫到的那片 ----
{
  const { mergeFurnitureWithIdentity } = await import('../src/lib/spatial/scan-merge.js')
  const prevProject = {
    ...SAMPLE_508,
    placements: [
      // 片内(coverage 覆盖 0..400 × 0..400):扫描出身的柜,这次没扫到 → 应消失并点名
      { id: 'pl-in', kind: 'cabinet', label: '片内柜', x: 100, y: 100, w: 60, h: 60, rotation: 0,
        attrs: { measuredWIn: 20, confidence: 'high' } },
      // 片外:扫描出身的床 —— 房间更新绝不能动它、更不能说它消失了
      { id: 'pl-out', kind: 'bed', label: '片外床', x: 700, y: 700, w: 258, h: 225, rotation: 0,
        attrs: { measuredWIn: 86, confidence: 'high' } },
      // 片外手录件也原样
      { id: 'p-hand', kind: 'rug', label: '片外地毯', x: 900, y: 200, w: 60, h: 48, rotation: 0 },
    ],
    fixtures: [],
    viewpoints: [
      { id: 'scan-vp-out', x: 800, y: 800, heading: 0, fovDeg: 69 },
    ],
  }
  const mapped = {
    scope: 'partial',
    coverage: [[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }]],
    placements: [
      { id: 'scan-new', kind: 'chair', label: '椅', x: 200, y: 200, w: 20, h: 20, rotation: 0,
        attrs: { confidence: 'high' } },
    ],
    fixtures: [],
    viewpoints: [],
  }
  const { project: p2, identity } = mergeFurnitureWithIdentity(prevProject, mapped)
  ok('片外扫描件原封不动', p2.placements.some((p) => p.id === 'pl-out' && p.x === 700))
  ok('片外不算消失', !identity.removed.includes('片外床'), JSON.stringify(identity.removed))
  ok('片内没扫到的算消失', identity.removed.includes('片内柜'), JSON.stringify(identity.removed))
  ok('片内新件进来了', p2.placements.some((p) => p.id === 'scan-new'))
  ok('片外手录件保留', p2.placements.some((p) => p.id === 'p-hand'))
  ok('片外旧扫描机位保留', p2.viewpoints.some((v) => v.id === 'scan-vp-out'))

  // 同一份数据按 full 合并:片外床没被新扫描匹配 → 应消失(对照组,证明 partial 生效)
  const full = mergeFurnitureWithIdentity(prevProject, { ...mapped, scope: 'full', coverage: [] })
  ok('对照:full 语义下片外床会消失', full.identity.removed.includes('片外床'),
    JSON.stringify(full.identity.removed))
}

// ---- 没分区的扫描 ----
{
  const m = mapScanIntoLayout(SAMPLE_508, { zones: [], placements: [], fixtures: [], viewpoints: [] })
  ok('空扫描不炸', m.report.mapped === 0 && m.placements.length === 0)
}

// —— 点到线小角度精修:手持扫描残余 1.2° 角差要被补掉 ——
// 真实管线里 wallGraph 顶点已被主方向拉直(轴对齐),残余角差的形态是
// 「墙位置随所在方位带系统性错位」:把每段墙独立顶点化,at 值按该段
// 中点被 1.2° 旋转后的位移偏移 —— 这正是精修要解的病。
{
  const { registerScanToHome, wallSegments } = await import(
    '../src/lib/spatial/scan-register.js'
  )
  const mk = (vertices, edges) => ({ pxPerFt: PX, margin: { x: 0, y: 0 }, vertices, edges })
  // 本地:20×10ft 矩形(每面墙拆两段,中点偏离旋转中心 —— θ 才可观测;
  // 整段墙的中点全落在旋转中心轴上时,旋转对 at 无影响,精修无从解起)
  const localWalls = [
    { vertical: false, at: 0, lo: 0, hi: 340 },
    { vertical: false, at: 0, lo: 380, hi: 720 },
    { vertical: false, at: 360, lo: 0, hi: 340 },
    { vertical: false, at: 360, lo: 380, hi: 720 },
    { vertical: true, at: 0, lo: 0, hi: 170 },
    { vertical: true, at: 0, lo: 190, hi: 360 },
    { vertical: true, at: 720, lo: 0, hi: 170 },
    { vertical: true, at: 720, lo: 190, hi: 360 },
    { vertical: true, at: 432, lo: 0, hi: 360 },
  ]
  const graphFromSegs = (segs) =>
    mk(
      segs.flatMap((s, i) =>
        s.vertical
          ? [
              { id: `v${i}a`, x: s.at, y: s.lo },
              { id: `v${i}b`, x: s.at, y: s.hi },
            ]
          : [
              { id: `v${i}a`, x: s.lo, y: s.at },
              { id: `v${i}b`, x: s.hi, y: s.at },
            ],
      ),
      segs.map((_, i) => ({ id: `e${i}`, a: `v${i}a`, b: `v${i}b` })),
    )

  const theta = (1.2 * Math.PI) / 180
  const ccx = 360
  const ccy = 180
  const rotShift = (x, y) => ({
    dx: (x - ccx) * Math.cos(theta) - (y - ccy) * Math.sin(theta) + ccx - x + 30,
    dy: (x - ccx) * Math.sin(theta) + (y - ccy) * Math.cos(theta) + ccy - y + 18,
  })
  const scanWalls = localWalls.map((s) => {
    const midX = s.vertical ? s.at : (s.lo + s.hi) / 2
    const midY = s.vertical ? (s.lo + s.hi) / 2 : s.at
    const { dx, dy } = rotShift(midX, midY)
    return {
      ...s,
      at: s.at + (s.vertical ? dx : dy),
      lo: s.lo + (s.vertical ? dy : dx),
      hi: s.hi + (s.vertical ? dy : dx),
    }
  })
  const localGraph = graphFromSegs(localWalls)
  const reg = registerScanToHome(graphFromSegs(scanWalls), wallSegments(localGraph))
  ok('小角场景配准成功', reg.status === 'ok', reg.reason ?? '')
  ok('精修角度被解出(≈-1.2°)', Math.abs(reg.refineDeg + 1.2) < 0.5, `got ${reg.refineDeg}`)
  ok('精修后中位残差 <3cm', reg.medianCm < 3, `got ${reg.medianCm}`)
  // 尺寸永不缩放:精修后盒子 w/h 原样
  const box = reg.applyBox({ x: 100, y: 100, w: 90, h: 60 })
  ok('精修后盒子尺寸不变', Math.abs(box.w - 90) < 1e-6 && Math.abs(box.h - 60) < 1e-6)
}

if (fails.length) {
  console.error(`FAIL ${fails.length} (pass ${pass})`)
  for (const f of fails) console.error('  ✗', f)
  process.exit(1)
}
console.log(`PASS ${pass} checks`)
