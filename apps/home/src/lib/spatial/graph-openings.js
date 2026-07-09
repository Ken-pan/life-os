/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').GraphOpening} GraphOpening */
/** @typedef {import('./types.js').WallGraph} WallGraph */
/** @typedef {import('./types.js').SpatialWall} SpatialWall */
/** @typedef {import('./types.js').SpatialOpening} SpatialOpening */

import {
  bifoldHorizontalUp,
  bifoldVerticalLeft,
  bifoldVerticalRight,
  slidingHorizontal,
  slidingVertical,
  swingHorizontalUp,
  swingVerticalLeft,
  swingVerticalRight,
} from './doors.js'
import { pickWallEdgeAt } from './wall-graph.js'

let openingSeq = 1

function nextOpeningId(prefix = 'go') {
  return `${prefix}-${openingSeq++}`
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @returns {{ va: import('./types.js').WallGraphVertex, vb: import('./types.js').WallGraphVertex, lenPx: number, lenIn: number } | null}
 */
function edgeEnds(graph, edgeId) {
  const edge = graph.edges.find((e) => e.id === edgeId)
  if (!edge) return null
  const va = graph.vertices.find((v) => v.id === edge.a)
  const vb = graph.vertices.find((v) => v.id === edge.b)
  if (!va || !vb) return null
  const lenPx = Math.hypot(vb.x - va.x, vb.y - va.y)
  const lenIn = (lenPx / graph.pxPerFt) * 12
  return { va, vb, lenPx, lenIn }
}

/**
 * @param {import('./types.js').Point} va
 * @param {import('./types.js').Point} vb
 * @param {number} t
 */
function pointOnEdge(va, vb, t) {
  return {
    x: va.x + (vb.x - va.x) * t,
    y: va.y + (vb.y - va.y) * t,
  }
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @param {import('./types.js').Point} pt
 */
export function projectPointOnEdge(graph, edgeId, pt) {
  const ends = edgeEnds(graph, edgeId)
  if (!ends || ends.lenPx < 1) return null
  const { va, vb, lenPx, lenIn } = ends
  const dx = vb.x - va.x
  const dy = vb.y - va.y
  const t = Math.max(
    0,
    Math.min(1, ((pt.x - va.x) * dx + (pt.y - va.y) * dy) / (lenPx * lenPx)),
  )
  const offsetIn = t * lenIn
  return { offsetIn, t, lenPx, lenIn, va, vb, horizontal: Math.abs(dx) >= Math.abs(dy) }
}

/**
 * @param {SpatialOpening} op
 * @returns {import('./types.js').Point[]}
 */
function openingSamplePoints(op) {
  /** @type {import('./types.js').Point[]} */
  const pts = []
  if (op.hitRect) {
    const { x, y, w, h } = op.hitRect
    pts.push({ x: x + w / 2, y: y + h / 2 })
    if (w >= h) {
      pts.push({ x: x + w * 0.25, y: y + h / 2 })
      pts.push({ x: x + w * 0.75, y: y + h / 2 })
    } else {
      pts.push({ x: x + w / 2, y: y + h * 0.25 })
      pts.push({ x: x + w / 2, y: y + h * 0.75 })
    }
  }
  if (op.from && op.to) {
    pts.push({ x: (op.from.x + op.to.x) / 2, y: (op.from.y + op.to.y) / 2 })
    pts.push(op.from, op.to)
  }
  if (op.rect) {
    const { x, y, w, h } = op.rect
    pts.push({ x: x + w / 2, y: y + h / 2 })
  }
  return pts
}

/**
 * @param {WallGraph} graph
 * @param {SpatialOpening} op
 */
function pickEdgeForOpening(graph, op) {
  const pts = openingSamplePoints(op)
  for (const tol of [64, 128]) {
    for (const pt of pts) {
      const edgeId = pickWallEdgeAt(graph, pt, tol)
      if (edgeId) return edgeId
    }
  }
  return null
}

/**
 * @param {SpatialOpening} op
 * @param {number} pxPerFt
 * @returns {number}
 */
function openingSpanIn(op, pxPerFt) {
  if (op.hitRect) {
    const spanPx = Math.max(op.hitRect.w, op.hitRect.h)
    return (spanPx / pxPerFt) * 12
  }
  if (op.from && op.to) {
    const spanPx = Math.hypot(op.to.x - op.from.x, op.to.y - op.from.y)
    return (spanPx / pxPerFt) * 12
  }
  return op.type === 'window' ? 48 : 32
}

/**
 * @param {SpatialProject} project
 * @param {WallGraph} graph
 * @returns {GraphOpening[]}
 */
export function convert508Openings(project, graph) {
  openingSeq = 1
  /** @type {GraphOpening[]} */
  const out = []
  for (const op of project.openings ?? []) {
    if (op.type === 'ac') continue
    const edgeId = pickEdgeForOpening(graph, op)
    if (!edgeId) continue
    const center = openingSamplePoints(op)[0]
    if (!center) continue
    const proj = projectPointOnEdge(graph, edgeId, center)
    if (!proj) continue
    const spanIn = openingSpanIn(op, graph.pxPerFt)
    let offsetIn = Math.max(0, proj.offsetIn - spanIn / 2)
    if (proj.lenIn > 0) {
      offsetIn = Math.min(offsetIn, Math.max(0, proj.lenIn - spanIn))
    }
    /** @type {GraphOpening} */
    const go = {
      id: op.id.startsWith('door-') || op.id.startsWith('win-') ? op.id : nextOpeningId(),
      edgeId,
      offsetIn,
      spanIn,
      type: op.type === 'window' ? 'window' : 'door',
      style:
        op.doorStyle === 'sliding'
          ? 'sliding'
          : op.doorStyle === 'bifold'
            ? 'bifold'
            : op.doorStyle === 'swing'
              ? 'swing'
              : undefined,
      swing: op.doorStyle === 'swing' ? 'out' : undefined,
    }
    out.push(go)
  }
  return out
}

/**
 * @param {GraphOpening} go
 * @param {import('./types.js').Point} p0
 * @param {import('./types.js').Point} p1
 * @param {boolean} horizontal
 * @returns {SpatialOpening}
 */
function graphOpeningToSpatial(go, p0, p1, horizontal) {
  const id = go.id
  if (go.type === 'window') {
    return {
      id,
      type: 'window',
      from: p0,
      to: p1,
    }
  }

  if (go.style === 'sliding') {
    if (horizontal) {
      const x1 = Math.min(p0.x, p1.x)
      const x2 = Math.max(p0.x, p1.x)
      const y = p0.y
      return {
        id,
        type: 'door',
        doorStyle: 'sliding',
        pathD: slidingHorizontal({ x1, x2, y }),
      }
    }
    const y1 = Math.min(p0.y, p1.y)
    const y2 = Math.max(p0.y, p1.y)
    const x = p0.x
    return {
      id,
      type: 'door',
      doorStyle: 'sliding',
      pathD: slidingVertical({ x, y1, y2 }),
    }
  }

  if (go.style === 'bifold') {
    if (horizontal) {
      const x1 = Math.min(p0.x, p1.x)
      const x2 = Math.max(p0.x, p1.x)
      const y = p0.y
      return {
        id,
        type: 'door',
        doorStyle: 'bifold',
        pathD: bifoldHorizontalUp({ x1, x2, y }),
      }
    }
    const y1 = Math.min(p0.y, p1.y)
    const y2 = Math.max(p0.y, p1.y)
    const x = p0.x
    return {
      id,
      type: 'door',
      doorStyle: 'bifold',
      pathD:
        go.swing === 'in'
          ? bifoldVerticalLeft({ x, y1, y2 })
          : bifoldVerticalRight({ x, y1, y2 }),
    }
  }

  if (horizontal) {
    const x1 = Math.min(p0.x, p1.x)
    const x2 = Math.max(p0.x, p1.x)
    const y = p0.y
    return {
      id,
      type: 'door',
      doorStyle: 'swing',
      pathD:
        go.swing === 'in'
          ? swingHorizontalUp({ x1, x2, y })
          : swingHorizontalUp({ x1, x2, y }),
    }
  }

  const y1 = Math.min(p0.y, p1.y)
  const y2 = Math.max(p0.y, p1.y)
  const x = p0.x
  return {
    id,
    type: 'door',
    doorStyle: 'swing',
    pathD:
      go.swing === 'in'
        ? swingVerticalLeft({ x, y1, y2 })
        : swingVerticalRight({ x, y1, y2 }),
  }
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening[]} graphOpenings
 * @returns {{ walls: SpatialWall[], openings: SpatialOpening[] }}
 */
export function deriveWallsAndOpenings(graph, graphOpenings) {
  /** @type {SpatialWall[]} */
  const walls = []
  /** @type {SpatialOpening[]} */
  const openings = []

  for (const edge of graph.edges) {
    const ends = edgeEnds(graph, edge.id)
    if (!ends || ends.lenPx < 1) continue
    const { va, vb, lenPx, lenIn } = ends
    const dx = vb.x - va.x
    const dy = vb.y - va.y
    const horizontal = Math.abs(dx) >= Math.abs(dy)

    const edgeOpenings = graphOpenings
      .filter((o) => o.edgeId === edge.id && !o.hidden)
      .sort((a, b) => a.offsetIn - b.offsetIn)

    if (!edgeOpenings.length) {
      walls.push({
        id: edge.id,
        from: { x: va.x, y: va.y },
        to: { x: vb.x, y: vb.y },
        kind: 'wall',
      })
      continue
    }

    let cursorIn = 0
    for (const go of edgeOpenings) {
      const startIn = Math.max(0, go.offsetIn)
      const endIn = Math.min(lenIn, startIn + go.spanIn)
      if (startIn > cursorIn + 0.01) {
        const t0 = cursorIn / lenIn
        const t1 = startIn / lenIn
        const w0 = pointOnEdge(va, vb, t0)
        const w1 = pointOnEdge(va, vb, t1)
        walls.push({
          id: `${edge.id}-w-${walls.length}`,
          from: w0,
          to: w1,
          kind: 'wall',
        })
      }
      const t0 = startIn / lenIn
      const t1 = endIn / lenIn
      const p0 = pointOnEdge(va, vb, t0)
      const p1 = pointOnEdge(va, vb, t1)
      openings.push(graphOpeningToSpatial(go, p0, p1, horizontal))
      cursorIn = endIn
    }
    if (cursorIn < lenIn - 0.01) {
      const t0 = cursorIn / lenIn
      const w0 = pointOnEdge(va, vb, t0)
      walls.push({
        id: `${edge.id}-w-${walls.length}`,
        from: w0,
        to: { x: vb.x, y: vb.y },
        kind: 'wall',
      })
    }
  }

  return { walls, openings }
}

/**
 * @param {GraphOpening[]} graphOpenings
 * @param {string} edgeId
 */
export function filterOpeningsForEdge(graphOpenings, edgeId) {
  return graphOpenings.filter((o) => o.edgeId !== edgeId)
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening[]} graphOpenings
 * @param {string} oldEdgeId
 * @param {string} edgeAId
 * @param {string} edgeBId
 * @param {number} splitT
 */
export function remapOpeningsAfterSplit(
  graph,
  graphOpenings,
  oldEdgeId,
  edgeAId,
  edgeBId,
  splitT,
) {
  const ends = edgeEnds(graph, oldEdgeId)
  if (!ends) return graphOpenings
  const splitIn = splitT * ends.lenIn
  return graphOpenings.map((o) => {
    if (o.edgeId !== oldEdgeId) return o
    const centerIn = o.offsetIn + o.spanIn / 2
    if (centerIn <= splitIn) {
      return { ...o, edgeId: edgeAId }
    }
    return {
      ...o,
      edgeId: edgeBId,
      offsetIn: Math.max(0, o.offsetIn - splitIn),
    }
  })
}

/**
 * @param {WallGraph} graph
 * @param {string} edgeId
 * @param {import('./types.js').Point} pt
 * @param {'door' | 'window'} [type]
 * @returns {GraphOpening | null}
 */
export function createOpeningAtPoint(graph, edgeId, pt, type = 'door') {
  const proj = projectPointOnEdge(graph, edgeId, pt)
  if (!proj) return null
  const spanIn = type === 'window' ? 48 : 32
  let offsetIn = Math.max(0, proj.offsetIn - spanIn / 2)
  if (proj.lenIn > 0) {
    offsetIn = Math.min(offsetIn, Math.max(0, proj.lenIn - spanIn))
  }
  return {
    id: nextOpeningId(),
    edgeId,
    offsetIn,
    spanIn,
    type,
    style: type === 'door' ? 'swing' : undefined,
    swing: 'out',
  }
}

export const MIN_OPENING_SPAN_IN = 24

/**
 * @param {number} offsetIn
 * @param {number} spanIn
 * @param {number} lenIn
 */
export function clampGraphOpeningOffset(offsetIn, spanIn, lenIn) {
  const max = Math.max(0, lenIn - spanIn)
  return Math.max(0, Math.min(max, offsetIn))
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening} go
 */
export function graphOpeningBounds(graph, go) {
  const ends = edgeEnds(graph, go.edgeId)
  if (!ends) return null
  const { va, vb, lenIn } = ends
  if (lenIn < 0.01) return null
  const t0 = go.offsetIn / lenIn
  const t1 = (go.offsetIn + go.spanIn) / lenIn
  return {
    p0: pointOnEdge(va, vb, t0),
    p1: pointOnEdge(va, vb, t1),
    lenIn,
    va,
    vb,
    horizontal: Math.abs(vb.x - va.x) >= Math.abs(vb.y - va.y),
  }
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening} go
 */
export function graphOpeningHitRect(graph, go) {
  const b = graphOpeningBounds(graph, go)
  if (!b) return { x: 0, y: 0, w: 32, h: 32, p0: { x: 0, y: 0 }, p1: { x: 32, y: 32 } }
  const pad = 18
  const x1 = Math.min(b.p0.x, b.p1.x)
  const x2 = Math.max(b.p0.x, b.p1.x)
  const y1 = Math.min(b.p0.y, b.p1.y)
  const y2 = Math.max(b.p0.y, b.p1.y)
  return {
    x: x1 - pad,
    y: y1 - pad,
    w: Math.max(x2 - x1, 28) + pad * 2,
    h: Math.max(y2 - y1, 28) + pad * 2,
    p0: b.p0,
    p1: b.p1,
  }
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening} go
 * @param {import('./types.js').Point} pt
 */
export function moveGraphOpeningToPoint(graph, go, pt) {
  const proj = projectPointOnEdge(graph, go.edgeId, pt)
  if (!proj) return go
  const offsetIn = clampGraphOpeningOffset(
    proj.offsetIn - go.spanIn / 2,
    go.spanIn,
    proj.lenIn,
  )
  return { ...go, offsetIn }
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening} go
 * @param {import('./types.js').Point} pt
 * @param {'start' | 'end'} grip
 */
export function resizeGraphOpeningFromPoint(graph, go, pt, grip) {
  const proj = projectPointOnEdge(graph, go.edgeId, pt)
  if (!proj) return go
  const minSpan = MIN_OPENING_SPAN_IN
  if (grip === 'start') {
    const endIn = go.offsetIn + go.spanIn
    let offsetIn = Math.min(proj.offsetIn, endIn - minSpan)
    offsetIn = clampGraphOpeningOffset(offsetIn, endIn - offsetIn, proj.lenIn)
    const spanIn = Math.max(minSpan, endIn - offsetIn)
    return { ...go, offsetIn, spanIn }
  }
  const startIn = go.offsetIn
  let endIn = Math.max(startIn + minSpan, Math.min(proj.lenIn, proj.offsetIn))
  return { ...go, spanIn: endIn - startIn }
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening[]} graphOpenings
 * @param {string} openingId
 * @param {import('./types.js').Point} pt
 * @param {'move' | 'resize-start' | 'resize-end'} mode
 */
export function previewGraphOpeningEdit(graph, graphOpenings, openingId, pt, mode) {
  return graphOpenings.map((o) => {
    if (o.id !== openingId) return o
    if (mode === 'move') return moveGraphOpeningToPoint(graph, o, pt)
    if (mode === 'resize-start') return resizeGraphOpeningFromPoint(graph, o, pt, 'start')
    if (mode === 'resize-end') return resizeGraphOpeningFromPoint(graph, o, pt, 'end')
    return o
  })
}

/**
 * Live drag hint for graph opening HUD (RoomSketcher-style along-wall dimensions).
 * @param {WallGraph} graph
 * @param {GraphOpening[]} graphOpenings
 * @param {string} openingId
 * @param {import('./types.js').Point} pt
 * @param {'move' | 'resize-start' | 'resize-end'} mode
 */
export function describeGraphOpeningDrag(graph, graphOpenings, openingId, pt, mode) {
  const orig = graphOpenings.find((o) => o.id === openingId)
  if (!orig) {
    return {
      valid: false,
      title: '门窗',
      detail: '未找到选中项',
      delta: '',
      gridSnapped: false,
    }
  }
  const next =
    previewGraphOpeningEdit(graph, graphOpenings, openingId, pt, mode).find(
      (o) => o.id === openingId,
    ) ?? orig
  const kind = orig.type === 'window' ? '窗' : '门'
  const title = `${kind} · ${formatInchesLabel(orig.spanIn)}`
  const offsetLabel = formatInchesLabel(next.offsetIn)
  const spanLabel = formatInchesLabel(next.spanIn)

  if (mode === 'move') {
    return {
      valid: true,
      title,
      detail: `沿墙 ${offsetLabel}`,
      delta: `宽 ${spanLabel}`,
      gridSnapped: false,
    }
  }
  if (mode === 'resize-start' || mode === 'resize-end') {
    return {
      valid: true,
      title,
      detail: `宽 ${spanLabel}`,
      delta: `起点 ${offsetLabel}`,
      gridSnapped: false,
    }
  }
  return {
    valid: true,
    title,
    detail: `沿墙 ${offsetLabel} · 宽 ${spanLabel}`,
    delta: '',
    gridSnapped: false,
  }
}

/** @param {number} inches */
function formatInchesLabel(inches) {
  const ft = Math.floor(inches / 12)
  const inch = Math.round(inches - ft * 12)
  if (inch === 0) return `${ft}'`
  return `${ft}'${inch}"`
}

/**
 * @param {GraphOpening} go
 * @returns {GraphOpening}
 */
export function toggleGraphOpeningType(go) {
  const nextType = go.type === 'door' ? 'window' : 'door'
  const spanIn = nextType === 'window' ? Math.max(go.spanIn, 48) : go.spanIn
  return {
    ...go,
    type: nextType,
    spanIn,
    style: nextType === 'door' ? go.style ?? 'swing' : undefined,
    swing: nextType === 'door' ? go.swing ?? 'out' : undefined,
  }
}

/**
 * @param {GraphOpening} go
 * @returns {GraphOpening}
 */
export function flipGraphOpeningSwing(go) {
  if (go.type !== 'door') return go
  return {
    ...go,
    swing: go.swing === 'in' ? 'out' : 'in',
  }
}

/**
 * @param {WallGraph} graph
 * @param {GraphOpening} go
 */
export function fitGraphOpeningOnEdge(graph, go) {
  const ends = edgeEnds(graph, go.edgeId)
  if (!ends) return go
  let spanIn = Math.min(go.spanIn, ends.lenIn)
  spanIn = Math.max(MIN_OPENING_SPAN_IN, spanIn)
  const offsetIn = clampGraphOpeningOffset(go.offsetIn, spanIn, ends.lenIn)
  return { ...go, spanIn, offsetIn }
}
