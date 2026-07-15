/**
 * 把扫描到的家具/机位**摆进已有户型** —— 纯函数,无 IO(node 单测直接跑)。
 *
 * 为什么不直接用扫描的墙体:用户手工录的 508 户型是准的(尺寸一寸寸量过),
 * 而 RoomPlan 会漂移(实测同一套房 y 向拉长 14%)。所以户型以本地为准,
 * 扫描只贡献三样它更强的东西:**家具实测尺寸**、**家具在哪个房间的哪个位置**、
 * **机位照片**。
 *
 * 对齐做法(两边都是北向上、同手性,只差漂移):
 * 1. 扫描分区中心 → 就近认领一个本地房间(先把两边包围盒归一化消掉漂移)
 * 2. 每个本地房间:源 bbox(认领它的扫描分区合起来) → 目标 bbox(房间自己)
 * 3. 家具按**相对位置**映射过去(u,v 比例),**尺寸原样保留** —— 尺寸是 LiDAR
 *    实测的,比任何缩放都准
 * 4. **墙距锚定**(比例回退路径内):扫描侧墙距 ≤30″ 的贴墙家具,按实测
 *    墙距钉到本地房间对应墙面;居中家具保持比例。
 *
 * **首选路径是全局刚性配准**(见 scan-register.js):墙不再变,所以先用
 * 整个墙体结构求一次 SE(2) 变换(禁止缩放),把**所有家具统一变换**过来,
 * 墙距只做 ≤5cm 的局部精修与一致性检查 —— 5–10cm 只建议、>10cm 标记
 * 「家具可能被挪过/扫描冲突」,绝不静默吸附。配准不过验收门(残差大/
 * 匹配墙太少)才回退到上面的分区比例路径。
 *
 * 结果:配准成功时全屋家具厘米级落位且误差不被打散;失败时「大致对、能用」。
 */
import {
  registerScanToHome,
  wallSegments,
  roomBoundsSegments,
  transformSegments,
} from './scan-register.js'
import { matchScanObjects } from './scan-identity.js'
import {
  computeWallAnchor,
  diffWallAnchors,
  wallAnchorSegments,
} from './wall-anchor.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 分区认领房间时,中心距超过这个就认为没对应(px;36px=1ft) */
const CLAIM_MAX_DIST_PX = 400

/** 扫描侧墙距 ≤ 这个值(30″=90px)视为「贴墙摆放」,参与锚定/精修 */
const ANCHOR_MAX_PX = 90
/** 墙段要正对家具:垂直向重叠 ≥ 家具对应边长的这个比例,才算「面前的墙」 */
const WALL_FACE_OVERLAP = 0.3
/** 扫描清洗会让家具与墙轻微穿模,容忍到 2″;更深说明找错墙了 */
const WALL_SINK_TOL_PX = -6
/** 配准后的墙距精修上限:≤5cm 自动修,5–10cm 只建议,>10cm 标记冲突 */
const PX_PER_CM = 36 / 30.48
const REFINE_AUTO_PX = 5 * PX_PER_CM
const REFINE_FLAG_PX = 10 * PX_PER_CM

/**
 * 家具某一侧到最近正对墙面的距离(扫描坐标系,px)。找不到返回 null。
 * (导出给 scan-accuracy 校验脚本量墙距)
 * @param {ReturnType<typeof wallSegments>} segs
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {'left'|'right'|'up'|'down'} side
 */
export function gapToWall(segs, box, side) {
  const horizontalSide = side === 'left' || side === 'right'
  const spanLo = horizontalSide ? box.y : box.x
  const spanHi = horizontalSide ? box.y + box.h : box.x + box.w
  const span = spanHi - spanLo
  let best = null
  for (const s of segs) {
    if (s.vertical !== horizontalSide) continue
    const overlap = Math.min(s.hi, spanHi) - Math.max(s.lo, spanLo)
    if (overlap < span * WALL_FACE_OVERLAP) continue
    let gap
    if (side === 'left') gap = box.x - s.at
    else if (side === 'right') gap = s.at - (box.x + box.w)
    else if (side === 'up') gap = box.y - s.at
    else gap = s.at - (box.y + box.h)
    if (gap < WALL_SINK_TOL_PX) continue
    if (best === null || gap < best) best = gap
  }
  return best === null ? null : Math.max(0, best)
}

/**
 * 墙距锚定:某轴向上,扫描侧离墙 ≤30″ 的那一侧,按**实测墙距**贴到
 * 本地房间对应墙面(房间 bounds 边 = 墙内面)。两侧都贴墙取更近的
 * (窄空间里那一侧才是真锚点)。不贴墙的轴保持传入的比例映射值。
 * @param {{x:number,y:number,w:number,h:number}} srcBox 扫描坐标系
 * @param {{x:number,y:number}} pos 比例映射出的本地左上角
 * @param {{x:number,y:number,w:number,h:number}} roomBounds
 * @param {ReturnType<typeof wallSegments>} segs
 * @returns {{ x: number, y: number, anchored: boolean }}
 */
function anchorToWalls(srcBox, pos, roomBounds, segs) {
  let { x, y } = pos
  let anchored = false

  const gl = gapToWall(segs, srcBox, 'left')
  const gr = gapToWall(segs, srcBox, 'right')
  const pickL = gl !== null && gl <= ANCHOR_MAX_PX && (gr === null || gl <= gr)
  const pickR = !pickL && gr !== null && gr <= ANCHOR_MAX_PX
  if (pickL) {
    x = roomBounds.x + gl
    anchored = true
  } else if (pickR) {
    x = roomBounds.x + roomBounds.w - gr - srcBox.w
    anchored = true
  }

  const gu = gapToWall(segs, srcBox, 'up')
  const gd = gapToWall(segs, srcBox, 'down')
  const pickU = gu !== null && gu <= ANCHOR_MAX_PX && (gd === null || gu <= gd)
  const pickD = !pickU && gd !== null && gd <= ANCHOR_MAX_PX
  if (pickU) {
    y = roomBounds.y + gu
    anchored = true
  } else if (pickD) {
    y = roomBounds.y + roomBounds.h - gd - srcBox.h
    anchored = true
  }

  return { x, y, anchored }
}

const bboxOfPoly = (poly) => {
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

const unionBox = (a, b) => {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** 本地户型的房间(508 参数模式用 rooms;扫描来的用 zones) */
function targetRooms(project) {
  if (project.zones?.length) {
    return project.zones.map((z) => ({
      id: z.id,
      nameZh: z.nameZh,
      bounds: bboxOfPoly(z.polygon),
    }))
  }
  return (project.rooms ?? [])
    .filter((r) => r.kind !== 'structural' && r.bounds)
    .map((r) => ({ id: r.id, nameZh: r.nameZh || '房间', bounds: r.bounds }))
}

/**
 * 求把 src 包围盒线性拉到 dst 包围盒的粗对齐(消掉扫描漂移,只为让「就近认领」可靠)。
 */
function coarseAlign(srcBox, dstBox) {
  const sx = srcBox.w > 0 ? dstBox.w / srcBox.w : 1
  const sy = srcBox.h > 0 ? dstBox.h / srcBox.h : 1
  return (p) => ({
    x: dstBox.x + (p.x - srcBox.x) * sx,
    y: dstBox.y + (p.y - srcBox.y) * sy,
  })
}

/**
 * **本地房间**去认领扫描分区(注意方向)。
 *
 * 反过来会错得很难看:扫描的分区是粗的(RoomPlan 一个 Voronoi cell 能罩住
 * 浴室+洗衣间+走廊一整片),本地房间是细的。让分区认领房间,那片家具就会被
 * 离中心最近的**小**洗衣间整个抢走(实测:马桶浴缸全塞进了 3.6ft 宽的洗衣柜)。
 * 让房间认领分区,则同一片的几个房间自然合成一个目标 bbox,家具按相对位置
 * 各归各位。
 *
 * @returns {Map<string, { rooms: object[], dstBox: object }>} 扫描 zoneId → 目标
 */
function claimZones(rooms, scanZones, localOuter, scanOuter) {
  const toScan = coarseAlign(localOuter, scanOuter)
  const zoneCenters = scanZones.map((z) => ({
    id: z.id,
    c: centerOf(bboxOfPoly(z.polygon)),
  }))
  /** @type {Map<string, { rooms: object[], dstBox: object }>} */
  const byZone = new Map()
  for (const room of rooms) {
    const c = toScan(centerOf(room.bounds))
    let best = null
    let bestD = Infinity
    for (const z of zoneCenters) {
      const d = Math.hypot(z.c.x - c.x, z.c.y - c.y)
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    if (!best || bestD > CLAIM_MAX_DIST_PX) continue
    const e = byZone.get(best.id) ?? { rooms: [], dstBox: null }
    e.rooms.push(room)
    e.dstBox = unionBox(e.dstBox, room.bounds)
    byZone.set(best.id, e)
  }
  return byZone
}

/**
 * 把扫描坐标下的一个中心点,映射到本地房间里的对应位置。
 * 位置按相对比例(u,v);尺寸调用方自己保留。
 */
function mapPoint(pt, srcBox, dstBox) {
  const u = srcBox.w > 0 ? (pt.x - srcBox.x) / srcBox.w : 0.5
  const v = srcBox.h > 0 ? (pt.y - srcBox.y) / srcBox.h : 0.5
  return {
    x: dstBox.x + u * dstBox.w,
    y: dstBox.y + v * dstBox.h,
  }
}

/** 让家具整体落在房间里(尺寸不改,只把出界的推回来) */
function clampToRoom(x, y, w, h, room) {
  const b = room.bounds
  return {
    x: Math.max(b.x, Math.min(b.x + b.w - w, x)),
    y: Math.max(b.y, Math.min(b.y + b.h - h, y)),
  }
}

/**
 * 扫描 payload 的家具/机位 → 本地户型坐标系。
 *
 * @param {SpatialProject} project 本地户型(不会被改)
 * @param {any} scanHomeos payload.homeos(已通过 validateScanPayload)
 * @returns {{
 *   placements: any[], fixtures: any[], viewpoints: any[],
 *   report: { mapped: number, skipped: number, anchored: number, rooms: Array<{ nameZh: string, from: string, count: number }> },
 * }}
 */
export function mapScanIntoLayout(project, scanHomeos) {
  const rooms = targetRooms(project)
  const scanZones = scanHomeos.zones ?? []
  const report = {
    mapped: 0,
    skipped: 0,
    anchored: 0,
    refined: 0,
    suggested: 0,
    /** @type {Array<{ label: string, side: string, cm: number }>} */
    conflicts: [],
    /** @type {any} */
    registration: null,
    rooms: [],
  }
  if (!rooms.length || !scanZones.length) {
    return { placements: [], fixtures: [], viewpoints: [], report }
  }
  // 扫描侧的实测墙体 —— 配准与墙距精修的依据(旧 payload 没有就走比例回退)
  const scanWalls = wallSegments(scanHomeos.wallGraph)

  // 首选:全局刚性配准(墙不再变 → 每次扫描是重新定位到同一个家)。
  // 过验收门就统一变换所有家具;不过门绝不强行吸附,回退分区比例路径。
  const localSegs = project.wallGraph
    ? wallSegments(project.wallGraph)
    : roomBoundsSegments(rooms)
  const reg = registerScanToHome(scanHomeos.wallGraph, localSegs)
  report.registration = {
    status: reg.status,
    yawDeg: reg.yawDeg,
    medianCm: reg.medianCm,
    p95Cm: reg.p95Cm,
    matchedWalls: reg.matchedWalls,
    reason: reg.reason,
  }
  if (reg.status === 'ok') {
    return mapRegistered({
      scanHomeos,
      rooms,
      localSegs,
      scanWalls,
      reg,
      report,
      useZoneIds: Boolean(project.zones?.length),
    })
  }

  const scanOuter = scanZones
    .map((z) => bboxOfPoly(z.polygon))
    .reduce((a, b) => unionBox(a, b), null)
  const localOuter = rooms
    .map((r) => r.bounds)
    .reduce((a, b) => unionBox(a, b), null)
  const claims = claimZones(rooms, scanZones, localOuter, scanOuter)
  const zoneById = Object.fromEntries(scanZones.map((z) => [z.id, z]))
  /** 没被任何房间认领的分区(本地压根没这块空间),家具走全局粗对齐兜底 */
  const toLocal = coarseAlign(scanOuter, localOuter)

  /** 扫描物体中心落在哪个扫描分区 */
  const zoneOfPoint = (pt) => {
    for (const z of scanZones) {
      if (pointInPoly(pt, z.polygon)) return z.id
    }
    // 落在分区外(墙缝里):就近挑一个
    let best = null
    let bestD = Infinity
    for (const z of scanZones) {
      const c = centerOf(bboxOfPoly(z.polygon))
      const d = Math.hypot(c.x - pt.x, c.y - pt.y)
      if (d < bestD) {
        bestD = d
        best = z.id
      }
    }
    return best
  }

  /** 落点在哪个本地房间(取最小的,小房间更具体) */
  const roomOfPoint = (pt, candidates) => {
    let best = null
    let bestArea = Infinity
    for (const r of candidates ?? rooms) {
      const b = r.bounds
      const area = b.w * b.h
      if (
        pt.x >= b.x &&
        pt.x <= b.x + b.w &&
        pt.y >= b.y &&
        pt.y <= b.y + b.h &&
        area < bestArea
      ) {
        best = r
        bestArea = area
      }
    }
    return best
  }

  const perRoom = new Map()
  /** @param {{x:number,y:number,w:number,h:number}} box */
  const mapBox = (box) => {
    const pt = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    const zoneId = zoneOfPoint(pt)
    const hit = zoneId && claims.get(zoneId)
    const c = hit
      ? mapPoint(pt, bboxOfPoly(zoneById[zoneId].polygon), hit.dstBox)
      : toLocal(pt)
    const room = roomOfPoint(c, hit?.rooms) ?? roomOfPoint(c)
    let pos = { x: c.x - box.w / 2, y: c.y - box.h / 2 }
    if (room) {
      // 贴墙家具按实测墙距钉到房间墙面(机位是点,不锚定 —— 墙距对它没有摆放语义)
      if (box.w > 0 && box.h > 0 && scanWalls.length) {
        const a = anchorToWalls(box, pos, room.bounds, scanWalls)
        if (a.anchored) report.anchored++
        pos = a
      }
      pos = clampToRoom(pos.x, pos.y, box.w, box.h, room)
    }
    const name = room?.nameZh ?? '(户型外)'
    perRoom.set(name, (perRoom.get(name) ?? 0) + 1)
    return { ...pos, room, srcZone: zoneId }
  }

  const placements = []
  for (const pl of scanHomeos.placements ?? []) {
    const m = mapBox(pl)
    if (!m) {
      report.skipped++
      continue
    }
    placements.push({
      ...pl,
      id: `scan-${pl.id}`,
      x: round1(m.x),
      y: round1(m.y),
      zoneId: project.zones?.length ? m.room?.id : undefined,
    })
    report.mapped++
  }

  const fixtures = []
  for (const fx of scanHomeos.fixtures ?? []) {
    const b = fx.bounds
    if (!b) continue
    const m = mapBox(b)
    if (!m) {
      report.skipped++
      continue
    }
    fixtures.push({
      ...fx,
      id: `scan-${fx.id}`,
      bounds: { x: round1(m.x), y: round1(m.y), w: b.w, h: b.h },
    })
    report.mapped++
  }

  const viewpoints = []
  for (const vp of scanHomeos.viewpoints ?? []) {
    const m = mapBox({ x: vp.x, y: vp.y, w: 0, h: 0 })
    if (!m) {
      report.skipped++
      continue
    }
    viewpoints.push({
      ...vp,
      id: `scan-${vp.id}`,
      x: round1(m.x),
      y: round1(m.y),
      zoneId: project.zones?.length ? m.room?.id : undefined,
    })
    report.mapped++
  }

  for (const [nameZh, count] of perRoom) {
    report.rooms.push({ nameZh, from: '', count })
  }
  return { placements, fixtures, viewpoints, report }
}

/**
 * 配准成功后的映射:所有对象吃同一个刚性变换(尺寸原封不动),
 * 贴墙对象再做**有界**墙距精修 —— 修正量来自「实测墙距 vs 本地墙距」之差:
 * ≤5cm 自动修(配准残差级别的小误差),5–10cm 只计数建议,
 * >10cm 记入 conflicts(家具可能真被挪过,不是扫描错 —— 交给用户/身份层裁决)。
 */
function mapRegistered({ scanHomeos, rooms, localSegs, scanWalls, reg, report, useZoneIds }) {
  // 刚性变换保距,变换后的扫描墙段上量出的墙距 = LiDAR 实测墙距
  const measuredSegs = transformSegments(scanWalls, reg.apply)
  const perRoom = new Map()

  const roomAt = (pt) => {
    let best = null
    let bestArea = Infinity
    for (const r of rooms) {
      const b = r.bounds
      const area = b.w * b.h
      if (
        pt.x >= b.x && pt.x <= b.x + b.w &&
        pt.y >= b.y && pt.y <= b.y + b.h &&
        area < bestArea
      ) {
        best = r
        bestArea = area
      }
    }
    return best
  }

  /** 单轴精修:实测墙距与本地墙距之差,按上限分级处理 */
  const refineAxis = (box, sides, label) => {
    const gaps = sides.map((side) => gapToWall(measuredSegs, box, side))
    let side = null
    let measured = null
    for (let i = 0; i < sides.length; i++) {
      if (gaps[i] === null || gaps[i] > ANCHOR_MAX_PX) continue
      if (measured === null || gaps[i] < measured) {
        measured = gaps[i]
        side = sides[i]
      }
    }
    if (side === null) return 0
    const localGap = gapToWall(localSegs, box, side)
    if (localGap === null) return 0
    const delta = localGap - measured
    const mag = Math.abs(delta)
    if (mag <= REFINE_AUTO_PX) {
      // 让本地墙距 = 实测墙距:靠墙侧在 左/上 时向负方向挪 delta
      return side === 'left' || side === 'up' ? -delta : delta
    }
    if (mag <= REFINE_FLAG_PX) {
      report.suggested++
      return 0
    }
    report.conflicts.push({
      label,
      side,
      cm: Math.round((mag / PX_PER_CM) * 10) / 10,
    })
    return 0
  }

  const place = (srcBox, label) => {
    let box = reg.applyBox(srcBox)
    const dx = refineAxis(box, ['left', 'right'], label)
    const dy = refineAxis({ ...box, x: box.x + dx }, ['up', 'down'], label)
    if (dx !== 0 || dy !== 0) report.refined++
    box = { ...box, x: round1(box.x + dx), y: round1(box.y + dy) }
    const room = roomAt({ x: box.x + box.w / 2, y: box.y + box.h / 2 })
    const name = room?.nameZh ?? '(户型外)'
    perRoom.set(name, (perRoom.get(name) ?? 0) + 1)
    report.mapped++
    return { box, room }
  }

  const rot = (r) => /** @type {0|90|180|270} */ (((r ?? 0) + reg.yawDeg) % 360)

  const placements = (scanHomeos.placements ?? []).map((pl) => {
    const m = place({ x: pl.x, y: pl.y, w: pl.w, h: pl.h }, pl.label ?? pl.kind)
    return {
      ...pl,
      id: `scan-${pl.id}`,
      x: m.box.x,
      y: m.box.y,
      w: round1(m.box.w),
      h: round1(m.box.h),
      rotation: rot(pl.rotation),
      zoneId: useZoneIds ? m.room?.id : undefined,
    }
  })

  const fixtures = (scanHomeos.fixtures ?? [])
    .filter((fx) => fx.bounds)
    .map((fx) => {
      const m = place(fx.bounds, fx.label ?? fx.kind)
      return {
        ...fx,
        id: `scan-${fx.id}`,
        bounds: { x: m.box.x, y: m.box.y, w: round1(m.box.w), h: round1(m.box.h) },
        rotation: rot(fx.rotation),
      }
    })

  const viewpoints = (scanHomeos.viewpoints ?? []).map((vp) => {
    const p = reg.apply({ x: vp.x, y: vp.y })
    const room = roomAt(p)
    report.mapped++
    return {
      ...vp,
      id: `scan-${vp.id}`,
      x: round1(p.x),
      y: round1(p.y),
      heading: Math.round((((vp.heading ?? 0) + reg.yawDeg) % 360) * 10) / 10,
      zoneId: useZoneIds ? room?.id : undefined,
    }
  })

  for (const [nameZh, count] of perRoom) {
    report.rooms.push({ nameZh, from: '', count })
  }
  return { placements, fixtures, viewpoints, report }
}

/**
 * 只把机位照片/状态并进现有项目 —— 日常用法:户型和家具都不动,
 * 只是「今天这里长这样」。同一 photoPath 的机位视为同一处,覆盖更新。
 * @param {SpatialProject} project
 * @param {any[]} mappedViewpoints 已过 mapScanIntoLayout 的机位
 * @returns {SpatialProject}
 */
export function mergeViewpointsOnly(project, mappedViewpoints) {
  const existing = project.viewpoints ?? []
  const byId = new Map(existing.map((v) => [v.id, v]))
  for (const vp of mappedViewpoints) {
    byId.set(vp.id, { ...byId.get(vp.id), ...vp })
  }
  return { ...project, viewpoints: [...byId.values()] }
}

/** 同一件东西的两份记录:实测件落在手录件这么近以内,就认为是同一个 */
const REPLACE_DIST_PX = 108 // 3ft

const boxCenter = (o) => {
  const b = o.bounds ?? o
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/**
 * 家具 + 机位一起并进来(初始摆家具用)。
 *
 * - 上次扫描留下的(id 前缀 `scan-`)先做**身份匹配**(scan-identity.js):
 *   认出是同一件的,**保留旧 id**并沿用旧 attrs 里扫描给不了的成果
 *   (VLM 识别的材质/颜色人话等),几何取新扫描;没匹配上的旧扫描件才丢
 *   (identity.removed 里可见)—— 同一张沙发不再因为重扫变成"新家具"
 * - 手录的设施若与实测件**位置重合**(3ft 内),让实测的顶掉:LiDAR 量的比手录准
 *   (实测 508 里的马桶偏了 2.5ft,淋浴其实是浴缸)
 * - 手录的、实测没扫到的(洗衣机、挂杆…)原样保留 —— 扫描漏检不等于东西不在
 * - storageZones 不动:它靠 bounds/zoneId 定位,与家具无关
 *
 * 「挪过」的家具再过一道**墙锚裁决**(wall-anchor.js):中心位移大但墙距没变,
 * 多半是配准残差/包围盒抖动而不是真挪了 —— `wall.verdict` 把这两种情况分开,
 * 附在 moved 条目上交给上层展示,不在这里替用户改判。
 *
 * @param {SpatialProject} project
 * @param {{ placements: any[], fixtures: any[], viewpoints: any[] }} mapped
 * @param {{ replaceNearby?: boolean }} [opts]
 * @returns {{ project: SpatialProject, identity: {
 *   unchanged: number,
 *   moved: Array<{ label: string, movedFt: number,
 *     wall?: import('./wall-anchor.js').WallAnchorDiff }>,
 *   added: number, removed: string[], possiblySame: number,
 * } }}
 */
/**
 * 「扫描出身」的家具/设施:有跨扫描永久身份,重扫时走 scan-identity 配对
 * (保 id/保名字/合 attrs),而不是被当手录的顶掉。两种长相:
 * - 直接拉取的扫描件:id 是 `scan-` 前缀
 * - 服务端优化副本(replace 整包落地)里的:id 被重铸成 `pl-*`,
 *   但带着只有扫描才有的实测 attrs
 * @param {{ id: string, attrs?: any }} o
 */
const scanBorn = (o) =>
  String(o.id).startsWith('scan-') ||
  o.attrs?.measuredWIn != null ||
  o.attrs?.confidence != null

export function mergeFurnitureWithIdentity(project, mapped, opts = {}) {
  const replaceNearby = opts.replaceNearby !== false
  const identity = { unchanged: 0, moved: [], added: 0, removed: [], possiblySame: 0 }

  // 墙锚裁决的墙段:本地墙图(结构锁定后不变)。能这么量的前提是配准有验收门
  // (过门才走这条路)+ 墙距精修已把 ≤5cm 的残差对齐 —— 此时本地坐标系里的
  // 墙距就是 LiDAR 实测墙距;更大的整体漂移根本过不了配准门,轮不到这里裁决。
  // 设施是装死的,不参与。
  const anchorSegs = wallAnchorSegments(project.wallGraph)
  const anchorPxPerFt = project.wallGraph?.pxPerFt ?? 36
  const wallVerdict = (prev, next) => {
    if (!anchorSegs.length || prev.bounds || next.bounds) return null
    const prevAnchor =
      prev.wallAnchor ?? computeWallAnchor(prev, prev.rotation, anchorSegs, anchorPxPerFt)
    const nextAnchor = computeWallAnchor(next, next.rotation, anchorSegs, anchorPxPerFt)
    const d = diffWallAnchors(prevAnchor, nextAnchor)
    return d.verdict === 'unknown' ? null : d
  }

  /** 上次扫描件 → 身份匹配 → 新几何 + 旧 id/旧成果 */
  const reconcile = (prevAll, incoming) => {
    // 钉死的(即使是手录、没实测 attrs)也进配对池:新扫描扫到同一台
    // 洗衣机时应该被旧身份吸收(照片/attrs 并进来),而不是长出第二台
    const prevScan = (prevAll ?? []).filter((o) => scanBorn(o) || o.fixed)
    const m = matchScanObjects(prevScan, incoming)
    const prevById = Object.fromEntries(prevScan.map((o) => [o.id, o]))
    const pairByNext = Object.fromEntries(m.pairs.map((p) => [p.nextId, p]))
    /** 认不准的旧件也算 removed —— 不许静默消失 */
    const droppedPrevIds = [
      ...m.removed,
      ...m.pairs.filter((p) => p.state === 'possibly_same').map((p) => p.prevId),
    ]
    // 永久身份优先占 id:先给匹配上的保留旧 id,新件再避让(否则新件可能抢注)
    const usedIds = new Set(
      m.pairs.filter((p) => p.state !== 'possibly_same').map((p) => p.prevId),
    )
    const uniq = (id) => {
      let v = id
      while (usedIds.has(v)) v = `${v}-b`
      usedIds.add(v)
      return v
    }
    const out = incoming.map((n) => {
      const pair = pairByNext[n.id]
      if (!pair || pair.state === 'possibly_same') {
        if (pair?.state === 'possibly_same') identity.possiblySame++
        else identity.added++
        return { ...n, id: uniq(n.id) }
      }
      const prev = prevById[pair.prevId]
      // 公寓钉死的(马桶/内嵌橱柜/洗衣机…):扫描认出是同一件就够了,
      // 几何一律以本地为准 —— RoomPlan 的位置抖动对钉死的东西只能是噪声,
      // 不许它把马桶挪了 3 寸再报一条「挪过」吓人
      if (prev.fixed) {
        identity.unchanged++
        return { ...prev, attrs: { ...prev.attrs, ...n.attrs } }
      }
      if (pair.state === 'same_unchanged') identity.unchanged++
      else {
        const entry = { label: n.label ?? n.kind, movedFt: pair.movedFt }
        const wall = wallVerdict(prev, n)
        if (wall) entry.wall = wall
        identity.moved.push(entry)
      }
      return {
        ...n,
        id: prev.id, // 永久身份:重扫不换 id(已预先占位)
        // 名字跟着身份走:用户/服务端起的名(「洗手台下柜」)不被新扫描的
        // 通用名(「柜」)冲掉 —— 扫描认得出这是同一件,就没资格给它改名
        label: prev.label ?? n.label,
        attrs: { ...prev.attrs, ...n.attrs },
      }
    })
    // 钉死的没扫到也不消失:公寓固定件不会自己走掉,只可能是这次没扫全
    const outIds = new Set(out.map((o) => o.id))
    out.push(...prevScan.filter((o) => o.fixed && !outIds.has(o.id)))
    identity.removed.push(
      ...droppedPrevIds.filter((id) => !prevById[id]?.fixed).map((id) => prevById[id]?.label ?? id),
    )
    return out
  }

  const nextPlacements = reconcile(project.placements, mapped.placements)
  const nextFixtures = reconcile(project.fixtures, mapped.fixtures)

  /** 丢掉上次扫描的;手录的按是否被实测件顶掉决定;钉死的谁也顶不掉 */
  const keepLocal = (arr, incoming) => {
    const nextIds = new Set((incoming ?? []).map((m) => m.id))
    return (arr ?? []).filter((o) => {
      // 已被 reconcile 以同 id 收编(钉死件必然如此)—— 别留两份
      if (nextIds.has(o.id)) return false
      if (scanBorn(o)) return false
      if (o.fixed) return true
      if (!replaceNearby) return true
      const c = boxCenter(o)
      return !incoming.some((m) => {
        const mc = boxCenter(m)
        return Math.hypot(mc.x - c.x, mc.y - c.y) < REPLACE_DIST_PX
      })
    })
  }

  const next = {
    ...project,
    placements: [...keepLocal(project.placements, nextPlacements), ...nextPlacements],
    fixtures: [...keepLocal(project.fixtures, nextFixtures), ...nextFixtures],
    viewpoints: [
      ...(project.viewpoints ?? []).filter((v) => !String(v.id).startsWith('scan-')),
      ...mapped.viewpoints,
    ],
  }
  return { project: next, identity }
}

/** 兼容旧调用:只要合并结果 */
export function mergeFurnitureAndViewpoints(project, mapped, opts = {}) {
  return mergeFurnitureWithIdentity(project, mapped, opts).project
}

/**
 * 被实测件顶掉的手录家具 —— 拉取前给用户看「哪些会被替换」。
 * 比对范围必须与 mergeFurnitureAndViewpoints 一致(设施只被设施顶、
 * 家具只被家具顶),否则报告会吓唬人:说挂杆要被柜子换掉,其实根本不会。
 * @returns {Array<{ label: string, byLabel: string, movedFt: number }>}
 */
export function describeReplacements(project, mapped) {
  const out = []
  const scan = (locals, incoming) => {
    for (const local of locals ?? []) {
      if (scanBorn(local) || local.fixed) continue
      const c = boxCenter(local)
      let best = null
      let bestD = Infinity
      for (const m of incoming) {
        const mc = boxCenter(m)
        const d = Math.hypot(mc.x - c.x, mc.y - c.y)
        if (d < bestD) {
          bestD = d
          best = m
        }
      }
      if (best && bestD < REPLACE_DIST_PX) {
        out.push({
          label: local.label ?? local.kind,
          byLabel: best.label ?? best.kind,
          movedFt: Math.round((bestD / 36) * 10) / 10,
        })
      }
    }
  }
  scan(project.fixtures, mapped.fixtures)
  scan(project.placements, mapped.placements)
  return out
}

/** @param {{x:number,y:number}} pt */
function pointInPoly(pt, poly) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

const round1 = (v) => Math.round(v * 10) / 10
