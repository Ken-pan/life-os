/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').WallGraph} WallGraph */
/** @typedef {import('./types.js').WallGraphVertex} WallGraphVertex */
/** @typedef {import('./types.js').WallGraphEdge} WallGraphEdge */

import {
  build508Project,
  default508Config,
  merge508Config,
} from './layout-508.js'
import {
  deriveWallsAndOpenings,
  reconcileOpeningsWithGraph,
  syncOpeningIdSeq,
} from './graph-openings.js'
import { zonesToRooms } from './zones.js'
import { SPATIAL_SCHEMA_VERSION } from './types.js'
import {
  placementsToFurniture,
  resolveStorageZoneBounds,
} from './placements.js'
import { normalizeZoneItems } from './storage-items.js'

const VERTEX_TOL_PX = 3
let idSeq = 1

function nextId(prefix) {
  return `${prefix}-${idSeq++}`
}

/** 只认本文件生成器的前缀：508 转换会保留 door-main 这类外来 id，不能拿它们喂计数器。 */
const GRAPH_ID_RE = /^(?:v|wg)-(\d+)$/

/**
 * 把 id 计数器推到已有 id 之上。
 *
 * idSeq 是模块级的，刷新页面就归零，但 localStorage 里存回来的墙图 id 不会。
 * 不同步的话，刷新后画的第一条墙必然拿到 v-1/v-2 —— 正好是首条边的两个端点，
 * 于是要么被 addWallSegment 的去重判成「墙段已存在」（toast 却报成功）、
 * 要么自环报「墙段过短」，新墙根本画不出来。
 *
 * 幂等、只增不减，所以 hydrate 每次都跑也没有副作用；
 * export508ToWallGraph 仍会先重置回 1，迁移 id 的确定性不受影响。
 * 同 viewpoints.js 的 syncViewpointIdSeq、storage-items.js 的 syncStorageItemIdSeq。
 *
 * @param {WallGraph} graph
 */
export function syncGraphIdSeq(graph) {
  let max = 0
  for (const id of [
    ...graph.vertices.map((v) => v.id),
    ...graph.edges.map((e) => e.id),
  ]) {
    const m = GRAPH_ID_RE.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  if (max >= idSeq) idSeq = max + 1
}

/** @param {number} x @param {number} y @param {number} pxPerFt */
export function snapGraphPoint(x, y, pxPerFt) {
  const step = pxPerFt / 12
  return {
    x: Math.round(x / step) * step,
    y: Math.round(y / step) * step,
  }
}

/** @param {WallGraph} graph */
export function cloneWallGraph(graph) {
  return JSON.parse(JSON.stringify(graph))
}

/**
 * @param {number} pxPerFt
 * @param {{ x: number, y: number }} margin
 * @returns {WallGraph}
 */
export function createEmptyWallGraph(pxPerFt, margin) {
  return {
    pxPerFt,
    margin: { ...margin },
    vertices: [],
    edges: [],
  }
}

/**
 * @param {WallGraph} graph
 * @param {number} x
 * @param {number} y
 * @returns {WallGraphVertex}
 */
function findOrCreateVertex(graph, x, y) {
  const snapped = snapGraphPoint(x, y, graph.pxPerFt)
  const hit = graph.vertices.find(
    (v) => Math.hypot(v.x - snapped.x, v.y - snapped.y) <= VERTEX_TOL_PX,
  )
  if (hit) return hit
  const v = { id: nextId('v'), x: snapped.x, y: snapped.y }
  graph.vertices.push(v)
  return v
}

/**
 * @param {WallGraph} graph
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {{ exterior?: boolean }} [opts]
 * @returns {{ graph: WallGraph, edgeId: string | null, error?: string }}
 */
export function addWallSegment(graph, x1, y1, x2, y2, opts = {}) {
  const next = cloneWallGraph(graph)
  const a = findOrCreateVertex(next, x1, y1)
  const b = findOrCreateVertex(next, x2, y2)
  if (a.id === b.id) {
    return { graph: next, edgeId: null, error: '墙段过短' }
  }
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < next.pxPerFt / 12) {
    return { graph: next, edgeId: null, error: '墙段过短' }
  }
  const dup = next.edges.find(
    (e) => (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id),
  )
  if (dup) return { graph: next, edgeId: dup.id, error: '墙段已存在' }
  const edge = {
    id: nextId('wg'),
    a: a.id,
    b: b.id,
    exterior: opts.exterior ?? false,
  }
  next.edges.push(edge)
  return { graph: next, edgeId: edge.id }
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @returns {WallGraph}
 */
export function deleteWallEdge(graph, edgeId) {
  const next = cloneWallGraph(graph)
  next.edges = next.edges.filter((e) => e.id !== edgeId)
  const used = new Set(next.edges.flatMap((e) => [e.a, e.b]))
  next.vertices = next.vertices.filter((v) => used.has(v.id))
  return next
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @param {number} x
 * @param {number} y
 * @returns {{ graph: WallGraph, newVertexId: string } | null}
 */
export function splitWallAt(graph, edgeId, x, y) {
  const edge = graph.edges.find((e) => e.id === edgeId)
  if (!edge) return null
  const va = graph.vertices.find((v) => v.id === edge.a)
  const vb = graph.vertices.find((v) => v.id === edge.b)
  if (!va || !vb) return null
  const snapped = snapGraphPoint(x, y, graph.pxPerFt)
  const dx = vb.x - va.x
  const dy = vb.y - va.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return null
  let t = ((snapped.x - va.x) * dx + (snapped.y - va.y) * dy) / len2
  t = Math.max(0.08, Math.min(0.92, t))
  const px = va.x + t * dx
  const py = va.y + t * dy

  let next = deleteWallEdge(graph, edgeId)
  const mid = findOrCreateVertex(next, px, py)
  const r1 = addWallSegment(next, va.x, va.y, mid.x, mid.y, {
    exterior: edge.exterior,
  })
  if (!r1.edgeId) return null
  next = r1.graph
  const r2 = addWallSegment(next, mid.x, mid.y, vb.x, vb.y, {
    exterior: edge.exterior,
  })
  if (!r2.edgeId) return null
  return { graph: r2.graph, newVertexId: mid.id }
}

/**
 * @param {SpatialProject} project
 * @returns {WallGraph}
 */
export function export508ToWallGraph(project) {
  idSeq = 1
  const pxPerFt = project.layoutConfig?.pxPerFt ?? 36
  const margin = project.layoutConfig?.margin ?? { x: 40, y: 40 }
  /** @type {WallGraph} */
  let graph = createEmptyWallGraph(pxPerFt, margin)

  const structural = project.walls.filter((w) => w.kind === 'wall')
  for (const wall of structural) {
    const exterior = wall.id.startsWith('w-outer')
    const result = addWallSegment(
      graph,
      wall.from.x,
      wall.from.y,
      wall.to.x,
      wall.to.y,
      { exterior },
    )
    graph = result.graph
  }
  return graph
}

/**
 * @param {WallGraph} graph
 * @returns {{ width: number, height: number, outerBounds: { x: number, y: number, w: number, h: number } }}
 */
function graphViewport(graph) {
  if (!graph.vertices.length) {
    return {
      width: 640,
      height: 480,
      outerBounds: { x: 40, y: 40, w: 560, h: 400 },
    }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of graph.vertices) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }
  const pad = 48
  const m = graph.margin
  const width = Math.max(480, maxX - minX + m.x + pad)
  const height = Math.max(360, maxY - minY + m.y + pad)
  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
    outerBounds: {
      x: minX - pad / 2,
      y: minY - pad / 2,
      w: maxX - minX + pad,
      h: maxY - minY + pad,
    },
  }
}

/**
 * 墙图浏览模式下无手绘分区时，用 508 参数快照渲染房间色块（与平面页提示一致）。
 * @param {Partial<SpatialProject>} carry
 * @returns {SpatialProject['rooms']}
 */
function snapshot508Rooms(carry) {
  const config = merge508Config(default508Config(), carry.layoutConfig ?? {})
  return build508Project(config, carry).rooms
}

/**
 * 清掉指向已删除分区的 zoneId。
 *
 * 删分区只过滤 zones 本身，不管谁在引用它，于是家具/视角会记着一个不存在的分区
 * （家具因此被归到一个没有的房间下）。zoneId 本来就是派生数据 —— 拖动时会用
 * findZoneAtPoint 重算 —— 所以这里清掉是安全的。
 * 没变化时原样返回原数组，避免 hydrate 每帧制造新引用。
 *
 * @template {{ zoneId?: string }} T
 * @param {T[]} items
 * @param {{ id: string }[]} zones
 * @returns {T[]}
 */
function dropDeadZoneRefs(items, zones) {
  const ids = new Set(zones.map((z) => z.id))
  let changed = false
  const next = items.map((it) => {
    if (!it.zoneId || ids.has(it.zoneId)) return it
    changed = true
    return { ...it, zoneId: undefined }
  })
  return changed ? next : items
}

/**
 * @param {WallGraph} graph
 * @param {Partial<SpatialProject>} [carry]
 * @returns {SpatialProject}
 */
export function buildFromWallGraph(graph, carry = {}) {
  // 每条「墙图进入运行时」的路径都汇到这里（含刷新后从 localStorage 恢复），
  // 所以计数器同步和门窗兜底都放这儿。
  syncGraphIdSeq(graph)
  syncOpeningIdSeq(carry.graphOpenings ?? [])
  const graphOpenings = reconcileOpeningsWithGraph(graph, carry.graphOpenings ?? [])
  const { walls, openings } = deriveWallsAndOpenings(graph, graphOpenings)

  const { width, height, outerBounds } = graphViewport(graph)

  const zones = carry.zones ?? []
  const placements = dropDeadZoneRefs(carry.placements ?? [], zones)
  const viewpoints = dropDeadZoneRefs(carry.viewpoints ?? [], zones)
  const storageZones = resolveStorageZoneBounds(
    normalizeZoneItems(carry.storageZones ?? []),
    zones,
    placements,
  )

  return {
    schemaVersion: SPATIAL_SCHEMA_VERSION,
    meta: carry.meta ?? {
      id: 'avalon-508',
      nameZh: 'Avalon #508',
    },
    viewport: { width, height },
    gridStep: Math.round(graph.pxPerFt * (4 / 12)),
    rooms: zones.length
      ? zonesToRooms(zones)
      : carry.rooms?.length
        ? carry.rooms
        : snapshot508Rooms(carry),
    walls,
    outerBounds,
    openings,
    furniture: placementsToFurniture(placements),
    // Built-in fixtures ride along unchanged. They were positioned against the
    // 508 geometry this graph was exported from, so they are correct right after
    // a rebuild; if the user then moves a wall they stay put, same as placements.
    fixtures: carry.fixtures ?? [],
    storageZones,
    furnitureInventory: [],
    layoutMode: 'wallGraph',
    wallGraph: graph,
    graphOpenings,
    zones,
    placements,
    viewpoints,
    layoutConfig: carry.layoutConfig,
  }
}

/**
 * @param {WallGraph} graph
 * @param {string} vertexId
 * @param {number} x
 * @param {number} y
 * @returns {WallGraph}
 */
export function moveVertex(graph, vertexId, x, y) {
  const next = cloneWallGraph(graph)
  const idx = next.vertices.findIndex((v) => v.id === vertexId)
  if (idx < 0) return next

  const snapped = snapGraphPoint(x, y, next.pxPerFt)
  const mergeTarget = next.vertices.find(
    (v, i) =>
      i !== idx &&
      Math.hypot(v.x - snapped.x, v.y - snapped.y) <= VERTEX_TOL_PX,
  )

  if (mergeTarget) {
    const oldId = vertexId
    for (const edge of next.edges) {
      if (edge.a === oldId) edge.a = mergeTarget.id
      if (edge.b === oldId) edge.b = mergeTarget.id
    }
    next.vertices.splice(idx, 1)
  } else {
    next.vertices[idx] = { ...next.vertices[idx], x: snapped.x, y: snapped.y }
  }

  const seen = new Set()
  next.edges = next.edges.filter((e) => {
    if (e.a === e.b) return false
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const used = new Set(next.edges.flatMap((e) => [e.a, e.b]))
  next.vertices = next.vertices.filter((v) => used.has(v.id))
  return next
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @returns {{ graph: WallGraph, newVertexId: string, edgeAId: string, edgeBId: string, splitT: number } | null}
 */
export function splitWallAtMidpoint(graph, edgeId) {
  const edge = graph.edges.find((e) => e.id === edgeId)
  if (!edge) return null
  const va = graph.vertices.find((v) => v.id === edge.a)
  const vb = graph.vertices.find((v) => v.id === edge.b)
  if (!va || !vb) return null
  const splitT = 0.5
  const px = (va.x + vb.x) / 2
  const py = (va.y + vb.y) / 2
  const result = splitWallAt(graph, edgeId, px, py)
  if (!result) return null
  const newEdges = result.graph.edges.filter(
    (e) =>
      (e.a === result.newVertexId || e.b === result.newVertexId) &&
      e.id !== edgeId,
  )
  if (newEdges.length < 2) return null
  return {
    graph: result.graph,
    newVertexId: result.newVertexId,
    edgeAId: newEdges[0].id,
    edgeBId: newEdges[1].id,
    splitT,
  }
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @param {number} px
 * @returns {boolean}
 */
export function hitTestWallEdge(graph, edgeId, px) {
  const edge = graph.edges.find((e) => e.id === edgeId)
  if (!edge) return false
  const a = graph.vertices.find((v) => v.id === edge.a)
  const b = graph.vertices.find((v) => v.id === edge.b)
  if (!a || !b) return false
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return false
  const t = Math.max(
    0,
    Math.min(1, ((px.x - a.x) * dx + (px.y - a.y) * dy) / len2),
  )
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(px.x - cx, px.y - cy) <= 14
}

/**
 * @param {WallGraph} graph
 * @param {{ x: number, y: number }} pt
 * @param {number} [maxDistPx]
 * @returns {string | null}
 */
export function pickWallEdgeAt(graph, pt, maxDistPx = 16) {
  let best = null
  let bestD = maxDistPx
  for (const edge of graph.edges) {
    const a = graph.vertices.find((v) => v.id === edge.a)
    const b = graph.vertices.find((v) => v.id === edge.b)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 < 1) continue
    const t = Math.max(
      0,
      Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2),
    )
    const cx = a.x + t * dx
    const cy = a.y + t * dy
    const d = Math.hypot(pt.x - cx, pt.y - cy)
    if (d < bestD) {
      bestD = d
      best = edge.id
    }
  }
  return best
}
