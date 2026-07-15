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
 *
 * 结果是「大致对、能用」:家具落在正确房间的正确角落,细节靠用户在 /plan 拖两下。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 分区认领房间时,中心距超过这个就认为没对应(px;36px=1ft) */
const CLAIM_MAX_DIST_PX = 400

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
 *   report: { mapped: number, skipped: number, rooms: Array<{ nameZh: string, from: string, count: number }> },
 * }}
 */
export function mapScanIntoLayout(project, scanHomeos) {
  const rooms = targetRooms(project)
  const scanZones = scanHomeos.zones ?? []
  const report = { mapped: 0, skipped: 0, rooms: [] }
  if (!rooms.length || !scanZones.length) {
    return { placements: [], fixtures: [], viewpoints: [], report }
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
    const pos = room
      ? clampToRoom(c.x - box.w / 2, c.y - box.h / 2, box.w, box.h, room)
      : { x: c.x - box.w / 2, y: c.y - box.h / 2 }
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
 * - 上次扫描留下的(id 前缀 `scan-`)整批换掉 —— 重扫就是重新对一次,不该越堆越多
 * - 手录的设施若与实测件**位置重合**(3ft 内),让实测的顶掉:LiDAR 量的比手录准
 *   (实测 508 里的马桶偏了 2.5ft,淋浴其实是浴缸)
 * - 手录的、实测没扫到的(洗衣机、挂杆…)原样保留 —— 扫描漏检不等于东西不在
 * - storageZones 不动:它靠 bounds/zoneId 定位,与家具无关
 *
 * @param {SpatialProject} project
 * @param {{ placements: any[], fixtures: any[], viewpoints: any[] }} mapped
 * @param {{ replaceNearby?: boolean }} [opts]
 * @returns {SpatialProject}
 */
export function mergeFurnitureAndViewpoints(project, mapped, opts = {}) {
  const replaceNearby = opts.replaceNearby !== false
  /** 丢掉上次扫描的;手录的按是否被实测件顶掉决定 */
  const keepLocal = (arr, incoming) =>
    (arr ?? []).filter((o) => {
      if (String(o.id).startsWith('scan-')) return false
      if (!replaceNearby) return true
      const c = boxCenter(o)
      return !incoming.some((m) => {
        const mc = boxCenter(m)
        return Math.hypot(mc.x - c.x, mc.y - c.y) < REPLACE_DIST_PX
      })
    })

  return {
    ...project,
    placements: [...keepLocal(project.placements, mapped.placements), ...mapped.placements],
    fixtures: [...keepLocal(project.fixtures, mapped.fixtures), ...mapped.fixtures],
    viewpoints: [
      ...(project.viewpoints ?? []).filter((v) => !String(v.id).startsWith('scan-')),
      ...mapped.viewpoints,
    ],
  }
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
      if (String(local.id).startsWith('scan-')) continue
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
