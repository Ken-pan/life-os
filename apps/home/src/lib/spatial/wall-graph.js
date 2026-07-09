/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').WallGraph} WallGraph */
/** @typedef {import('./types.js').WallGraphVertex} WallGraphVertex */
/** @typedef {import('./types.js').WallGraphEdge} WallGraphEdge */

import { SPATIAL_SCHEMA_VERSION } from './types.js'
import { deriveWallsAndOpenings } from './graph-openings.js'
import { zonesToRooms } from './zones.js'
import {
  placementsToFurniture,
  resolveStorageZoneBounds,
} from './placements.js'

const VERTEX_TOL_PX = 3
let idSeq = 1

function nextId(prefix) {
  return `${prefix}-${idSeq++}`
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
    (v) =>
      Math.hypot(v.x - snapped.x, v.y - snapped.y) <= VERTEX_TOL_PX,
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
    (e) =>
      (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id),
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
 * @param {WallGraph} graph
 * @param {Partial<SpatialProject>} [carry]
 * @returns {SpatialProject}
 */
export function buildFromWallGraph(graph, carry = {}) {
  const graphOpenings = carry.graphOpenings ?? []
  const { walls, openings } = deriveWallsAndOpenings(graph, graphOpenings)

  const { width, height, outerBounds } = graphViewport(graph)

  const zones = carry.zones ?? []
  const placements = carry.placements ?? []
  const storageZones = resolveStorageZoneBounds(
    carry.storageZones ?? [],
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
    rooms: zones.length ? zonesToRooms(zones) : (carry.rooms ?? []),
    walls,
    outerBounds,
    openings,
    furniture: placementsToFurniture(placements),
    storageZones,
    furnitureInventory: [],
    layoutMode: 'wallGraph',
    wallGraph: graph,
    graphOpenings,
    zones,
    placements,
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
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2))
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
