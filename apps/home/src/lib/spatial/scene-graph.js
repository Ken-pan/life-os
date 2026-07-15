/**
 * 功能性场景图 —— 把户型从「图形列表」升级成「AI 能推理的关系网」
 * (纯函数,无 IO,node 单测直接跑)。
 *
 * 层级:Home → Room → Furniture → StorageZone → Item。
 * 关系(edges,有类型有方向):
 * - in_room      家具在哪个房间(zoneId 优先,兜底按中心点落位)
 * - on_top_of    A 架在 B 上(吊柜在台面柜上、微波炉在台面上 —— 用
 *                placementSpec 的 mount/elev/tall 判高度衔接 + 平面重叠)
 * - next_to      同房间、边距 ≤12″ 的落地家具(整理时「顺手放旁边」的依据)
 * - located_at   储物区长在哪件家具上(placementId)/哪个分区里(zoneId)
 * - stored_in    物品存放在哪个储物区
 * - blocks       家具堵了哪条动线/哪道门(来自 circulation 的 blockers)
 *
 * 消费方:整理计划(把「放进柜子」升级成「放进哪个柜」)、布局求解器
 * (硬约束来源)、未来的三维问答。这一层只描述**事实**,不做建议。
 */
import { placementSpec } from './placements.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 边距 ≤12″(36px)算相邻 */
const NEXT_TO_GAP_PX = 36
/** on_top_of 的平面重叠比例下限(占上层脚印) */
const ON_TOP_OVERLAP = 0.5
/** 上层底面与下层顶面的高度衔接容差(英寸) */
const ON_TOP_SEAT_TOL_IN = { below: 4, above: 10 }

const boxOf = (o) => o.bounds ?? { x: o.x, y: o.y, w: o.w, h: o.h }
const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

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

/** 房间列表:zones 优先(扫描/墙图),508 参数模式用 rooms */
function roomNodes(project) {
  if (project.zones?.length) {
    return project.zones.map((z) => ({
      id: z.id,
      type: 'room',
      nameZh: z.nameZh,
      polygon: z.polygon,
    }))
  }
  return (project.rooms ?? [])
    .filter((r) => r.kind !== 'structural' && r.bounds)
    .map((r) => ({ id: r.id, type: 'room', nameZh: r.nameZh || '房间', bounds: r.bounds }))
}

function roomAt(rooms, pt) {
  let best = null
  let bestArea = Infinity
  for (const r of rooms) {
    if (r.polygon) {
      if (!pointInPoly(pt, r.polygon)) continue
      const xs = r.polygon.map((p) => p.x)
      const ys = r.polygon.map((p) => p.y)
      const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
      if (area < bestArea) {
        best = r
        bestArea = area
      }
    } else if (r.bounds) {
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
  }
  return best
}

/** 平面重叠面积 */
function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** 两盒的边缘间隙(px;重叠为 0) */
function edgeGap(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
  return Math.hypot(dx, dy)
}

/**
 * @param {SpatialProject} project
 * @param {ReturnType<import('./circulation.js').analyzeCirculation>} [circ]
 *   传入则生成 blocks 边(不传就只有静态关系)
 * @returns {{
 *   nodes: Array<any>,
 *   edges: Array<{ type: string, from: string, to: string, [k: string]: any }>,
 *   byId: Record<string, any>,
 * }}
 */
export function buildSceneGraph(project, circ) {
  const rooms = roomNodes(project)
  /** @type {any[]} */
  const nodes = [
    { id: 'home', type: 'home', nameZh: project.meta?.nameZh ?? '家' },
    ...rooms,
  ]
  /** @type {Array<{ type: string, from: string, to: string, [k: string]: any }>} */
  const edges = rooms.map((r) => ({ type: 'in_home', from: r.id, to: 'home' }))

  // ---- 家具节点(placements 可动 + fixtures 固定) ----
  const furniture = []
  for (const p of project.placements ?? []) {
    const spec = placementSpec(p.kind)
    furniture.push({
      id: p.id,
      type: 'furniture',
      kind: p.kind,
      label: p.label,
      box: boxOf(p),
      movable: true,
      storable: Boolean(spec?.storable),
      mount: spec?.mount ?? 'floor',
      elevIn: spec?.elev ?? 0,
      tallIn: spec?.tall ?? 0,
      attrs: p.attrs,
      zoneId: p.zoneId,
    })
  }
  for (const f of project.fixtures ?? []) {
    furniture.push({
      id: f.id,
      type: 'furniture',
      kind: f.kind,
      label: f.label,
      box: boxOf(f),
      movable: false,
      storable: false,
      mount: 'floor',
      elevIn: 0,
      tallIn: 0,
      attrs: f.attrs,
      zoneId: undefined,
    })
  }
  nodes.push(...furniture)

  // in_room:zoneId 可信就用,否则按中心点落房间
  for (const fu of furniture) {
    const room =
      (fu.zoneId && rooms.find((r) => r.id === fu.zoneId)) ||
      roomAt(rooms, centerOf(fu.box))
    if (room) edges.push({ type: 'in_room', from: fu.id, to: room.id })
  }

  // on_top_of:上层底面(elev)接在下层顶面(elev+tall)附近 + 平面重叠够大
  const floors = furniture.filter((f) => f.mount === 'floor' && f.tallIn > 0)
  const raised = furniture.filter((f) => f.mount === 'wall' || f.mount === 'counter')
  for (const top of raised) {
    for (const base of floors) {
      if (top.id === base.id) continue
      const ov = overlapArea(top.box, base.box)
      if (ov < top.box.w * top.box.h * ON_TOP_OVERLAP) continue
      const seat = base.elevIn + base.tallIn
      if (
        top.elevIn >= seat - ON_TOP_SEAT_TOL_IN.below &&
        top.elevIn <= seat + ON_TOP_SEAT_TOL_IN.above
      ) {
        edges.push({ type: 'on_top_of', from: top.id, to: base.id })
      }
    }
  }

  // next_to:同房间、落地、边距 ≤12″(对称关系只发一条,id 排序定向)
  const roomOfF = Object.fromEntries(
    edges.filter((e) => e.type === 'in_room').map((e) => [e.from, e.to]),
  )
  const floorsAll = furniture.filter((f) => f.mount === 'floor')
  for (let i = 0; i < floorsAll.length; i++) {
    for (let j = i + 1; j < floorsAll.length; j++) {
      const a = floorsAll[i]
      const b = floorsAll[j]
      if (!roomOfF[a.id] || roomOfF[a.id] !== roomOfF[b.id]) continue
      const gap = edgeGap(a.box, b.box)
      if (gap <= NEXT_TO_GAP_PX) {
        const [from, to] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
        edges.push({ type: 'next_to', from, to, gapIn: Math.round(gap / 3) })
      }
    }
  }

  // ---- 储物区与物品 ----
  for (const sz of project.storageZones ?? []) {
    nodes.push({
      id: sz.id,
      type: 'storage',
      code: sz.code,
      nameZh: sz.nameZh,
      itemCount: (sz.items ?? []).length,
    })
    if (sz.placementId && furniture.some((f) => f.id === sz.placementId)) {
      edges.push({ type: 'located_at', from: sz.id, to: sz.placementId })
    } else if (sz.zoneId && rooms.some((r) => r.id === sz.zoneId)) {
      edges.push({ type: 'located_at', from: sz.id, to: sz.zoneId })
    }
    for (const it of sz.items ?? []) {
      const itemId = `item-${sz.id}-${it.id}`
      nodes.push({
        id: itemId,
        type: 'item',
        nameZh: it.name,
        qty: it.qty ?? 1,
        tags: it.tags ?? [],
      })
      edges.push({ type: 'stored_in', from: itemId, to: sz.id })
    }
  }

  // ---- blocks:家具堵动线/堵门(要传 circulation 结果才有) ----
  if (circ?.ok) {
    for (const bn of circ.bottlenecks ?? []) {
      for (const blocker of bn.blockers ?? []) {
        if (!blocker.id || !furniture.some((f) => f.id === blocker.id)) continue
        edges.push({
          type: 'blocks',
          from: blocker.id,
          to: bn.zoneId ?? 'home',
          what: 'path',
          widthIn: bn.widthIn,
        })
      }
    }
  }

  return {
    nodes,
    edges,
    byId: Object.fromEntries(nodes.map((n) => [n.id, n])),
  }
}

/**
 * 给一件物品挑「该放进哪个具体储物家具」:场景图版的 suggestHome ——
 * 只在 storable 家具里挑,优先同房间、然后最近。
 * @param {ReturnType<typeof buildSceneGraph>} graph
 * @param {string} nearFurnitureId 物品现在在哪件家具附近(锚点)
 * @returns {{ id: string, label: string, sameRoom: boolean } | null}
 */
export function nearestStorableFurniture(graph, nearFurnitureId) {
  const anchor = graph.byId[nearFurnitureId]
  if (!anchor?.box) return null
  const roomOf = Object.fromEntries(
    graph.edges.filter((e) => e.type === 'in_room').map((e) => [e.from, e.to]),
  )
  const c = centerOf(anchor.box)
  let best = null
  let bestScore = -Infinity
  for (const n of graph.nodes) {
    if (n.type !== 'furniture' || !n.storable || n.id === nearFurnitureId) continue
    const nc = centerOf(n.box)
    const d = Math.hypot(nc.x - c.x, nc.y - c.y)
    const sameRoom = roomOf[n.id] && roomOf[n.id] === roomOf[nearFurnitureId]
    const score = (sameRoom ? 1000 : 0) - d
    if (score > bestScore) {
      bestScore = score
      best = { id: n.id, label: n.label, sameRoom: Boolean(sameRoom) }
    }
  }
  return best
}
