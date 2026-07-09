/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').SpatialZone} SpatialZone */
/** @typedef {import('./types.js').SpatialRoom} SpatialRoom */
/** @typedef {import('./types.js').WallGraph} WallGraph */

/** @type {string[]} */
export const ZONE_COLORS = [
  '#e4eaef',
  '#eee9f0',
  '#e8edf1',
  '#e6eef0',
  '#eef1f4',
  '#efece5',
  '#eaeee9',
  '#e8edf1',
]

let zoneSeq = 1

export function resetZoneIdSeq() {
  zoneSeq = 1
}

/** @param {SpatialZone[]} existing */
export function syncZoneIdSeq(existing) {
  for (const z of existing) {
    const m = /^zone-(\d+)$/.exec(z.id)
    if (m) zoneSeq = Math.max(zoneSeq, Number(m[1]) + 1)
  }
}

/** @returns {string} */
export function createZoneId() {
  return `zone-${zoneSeq++}`
}

/**
 * @param {SpatialZone[]} zones
 * @param {number} [index]
 */
export function nextZoneColor(zones, index = zones.length) {
  const used = new Set(zones.map((z) => z.color).filter(Boolean))
  for (let i = 0; i < ZONE_COLORS.length; i++) {
    const c = ZONE_COLORS[(index + i) % ZONE_COLORS.length]
    if (!used.has(c)) return c
  }
  return ZONE_COLORS[index % ZONE_COLORS.length]
}

/**
 * @param {Point} pt
 * @param {Point[]} polygon
 */
export function pointInPolygon(pt, polygon) {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * @param {Point[]} polygon
 */
export function zoneCentroid(polygon) {
  if (!polygon.length) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of polygon) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / polygon.length, y: sy / polygon.length }
}

/**
 * @param {Point[]} polygon
 */
export function polygonBbox(polygon) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of polygon) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * @param {Point} a
 * @param {Point} b
 * @param {number} tol
 */
export function isNearPoint(a, b, tol = 8) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol
}

/**
 * @param {Point} pt
 * @param {Point} first
 * @param {number} tol
 */
export function canClosePolygon(pt, first, tol = 8) {
  return isNearPoint(pt, first, tol)
}

/**
 * @param {Point} a1 @param {Point} a2
 * @param {Point} b1 @param {Point} b2
 */
function segmentsIntersect(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x
  const d1y = a2.y - a1.y
  const d2x = b2.x - b1.x
  const d2y = b2.y - b1.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-9) return false
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

/**
 * @param {{ from: Point, to: Point }} seg
 * @param {Point[]} polygon
 */
export function segmentIntersectsPolygon(seg, polygon) {
  if (polygon.length < 3) return false
  if (pointInPolygon(seg.from, polygon) || pointInPolygon(seg.to, polygon)) {
    return true
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (
      segmentsIntersect(
        seg.from,
        seg.to,
        polygon[j],
        polygon[i],
      )
    ) {
      return true
    }
  }
  return false
}

/**
 * @param {WallGraph} oldGraph
 * @param {WallGraph} newGraph
 * @returns {{ from: Point, to: Point }[]}
 */
export function findChangedWallSegments(oldGraph, newGraph) {
  /** @type {{ from: Point, to: Point }[]} */
  const changed = []
  const oldVerts = Object.fromEntries(oldGraph.vertices.map((v) => [v.id, v]))
  const newVerts = Object.fromEntries(newGraph.vertices.map((v) => [v.id, v]))

  const oldEdgeMap = new Map(
    oldGraph.edges.map((e) => [
      e.id,
      { a: oldVerts[e.a], b: oldVerts[e.b] },
    ]),
  )
  const newEdgeMap = new Map(
    newGraph.edges.map((e) => [
      e.id,
      { a: newVerts[e.a], b: newVerts[e.b] },
    ]),
  )

  for (const [id, oldE] of oldEdgeMap) {
    const newE = newEdgeMap.get(id)
    if (!newE || !oldE.a || !oldE.b) {
      if (oldE?.a && oldE?.b) {
        changed.push({ from: oldE.a, to: oldE.b })
      }
      continue
    }
    if (
      !newE.a ||
      !newE.b ||
      oldE.a.x !== newE.a.x ||
      oldE.a.y !== newE.a.y ||
      oldE.b.x !== newE.b.x ||
      oldE.b.y !== newE.b.y
    ) {
      if (newE.a && newE.b) changed.push({ from: newE.a, to: newE.b })
      if (oldE.a && oldE.b) changed.push({ from: oldE.a, to: oldE.b })
    }
  }

  for (const [id, newE] of newEdgeMap) {
    if (!oldEdgeMap.has(id) && newE.a && newE.b) {
      changed.push({ from: newE.a, to: newE.b })
    }
  }

  return changed
}

/**
 * @param {WallGraph | undefined} oldGraph
 * @param {WallGraph | undefined} newGraph
 * @param {SpatialZone[]} zones
 */
export function markZonesStaleOnWallChange(oldGraph, newGraph, zones) {
  if (!oldGraph || !newGraph || !zones.length) return zones
  const changed = findChangedWallSegments(oldGraph, newGraph)
  if (!changed.length) return zones
  return zones.map((z) => {
    if (z.stale) return z
    const hit = changed.some((seg) => segmentIntersectsPolygon(seg, z.polygon))
    return hit ? { ...z, stale: true } : z
  })
}

/**
 * @param {SpatialZone[]} zones
 * @returns {SpatialRoom[]}
 */
export function zonesToRooms(zones) {
  return zones.map((z, i) => {
    const bbox = polygonBbox(z.polygon)
    return {
      id: z.id,
      nameZh: z.nameZh,
      nameEn: z.id,
      bounds: bbox,
      fill: z.color ?? ZONE_COLORS[i % ZONE_COLORS.length],
      kind: /** @type {'room'} */ ('room'),
    }
  })
}

/**
 * @param {Point[]} chain
 * @param {string} [nameZh]
 * @param {SpatialZone[]} existing
 */
export function createZoneFromChain(chain, nameZh, existing) {
  if (chain.length < 3) return null
  syncZoneIdSeq(existing)
  const id = createZoneId()
  const n = existing.filter((z) => /^分区 \d+$/.test(z.nameZh)).length
  return {
    id,
    nameZh: nameZh ?? `分区 ${n + 1}`,
    color: nextZoneColor(existing),
    polygon: chain.map((p) => ({ ...p })),
    stale: false,
  }
}

/**
 * @param {SpatialZone[]} zones
 * @param {string} zoneId
 */
export function findZoneAtPoint(zones, pt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (pointInPolygon(pt, zones[i].polygon)) return zones[i]
  }
  return null
}

/**
 * @param {Point[]} polygon
 */
export function polygonPointsAttr(polygon) {
  return polygon.map((p) => `${p.x},${p.y}`).join(' ')
}
