/**
 * Snapping for furniture placement.
 *
 * Real furniture sits flush against walls and lines up with its neighbours, so
 * dragging is snapped rather than free: a piece released near a wall lands
 * against the wall *face* (not its centreline — walls are stroked at their real
 * thickness, so the usable face is half a thickness in).
 *
 * Priority, coarse to fine: wall faces > neighbour edges > neighbour centres.
 * Walls win because "against the wall" is the layout decision people actually
 * mean; alignment to another piece is a refinement on top.
 *
 * Placements are axis-aligned — `rotation` is 0/90/180/270 and w/h is the AABB
 * — so only axis-aligned walls can be snapped to. Snapping to a diagonal wall
 * would mean rotating the piece to match it, which the placement model cannot
 * express.
 */

/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').Rect} Rect */
/** @typedef {import('./types.js').SpatialWall} SpatialWall */

/**
 * A guide line to draw while the snap is live. Shape-compatible with snap.js's
 * SnapGuide so render-svg can draw both with the same code.
 * @typedef {{
 *   kind: 'vertical' | 'horizontal',
 *   pos: number,
 *   from: Point,
 *   to: Point,
 *   source: 'wall' | 'edge' | 'center',
 * }} PlacementGuide
 */

/**
 * @typedef {{ x: number, y: number, guides: PlacementGuide[], snappedX: boolean, snappedY: boolean }} PlacementSnapResult
 */

const SNAP_TOL_PX = 9
const GUIDE_PAD_PX = 20

/** @param {number} n @param {number} m */
const near = (n, m) => Math.abs(n - m) < 0.5

/**
 * Candidate lines a wall offers on one axis, with the span it covers on the
 * other axis (so we only snap to walls the piece is actually beside).
 * @param {SpatialWall[]} walls
 * @param {number} thicknessFor
 */
function wallLines(walls, thicknessFor) {
  /** @type {{ axis: 'x' | 'y', pos: number, lo: number, hi: number }[]} */
  const lines = []
  for (const w of walls) {
    if (w.kind !== 'wall') continue
    const half = thicknessFor(w) / 2
    if (near(w.from.y, w.to.y)) {
      const lo = Math.min(w.from.x, w.to.x)
      const hi = Math.max(w.from.x, w.to.x)
      lines.push({ axis: 'y', pos: w.from.y - half, lo, hi })
      lines.push({ axis: 'y', pos: w.from.y + half, lo, hi })
    } else if (near(w.from.x, w.to.x)) {
      const lo = Math.min(w.from.y, w.to.y)
      const hi = Math.max(w.from.y, w.to.y)
      lines.push({ axis: 'x', pos: w.from.x - half, lo, hi })
      lines.push({ axis: 'x', pos: w.from.x + half, lo, hi })
    }
    // Diagonal walls are skipped — see the module header.
  }
  return lines
}

/** @param {number} a @param {number} b @param {number} c @param {number} d */
const overlaps = (a, b, c, d) => a < d && c < b

/**
 * Best snap for one axis: land one of the rect's reference points on one of the
 * candidate lines, nearest wins.
 *
 * `refs` is explicit per candidate class because the pairing carries meaning:
 * edges align to edges and centres align to centres. Letting an edge land on a
 * neighbour's centre line is not an alignment anyone intends — it just reads as
 * the piece grabbing at nothing.
 *
 * @param {number} lo rect's near edge on this axis
 * @param {number} size rect extent on this axis
 * @param {{ pos: number }[]} lines
 * @param {number} tol
 * @param {readonly ('near' | 'far' | 'center')[]} refs
 * @returns {{ delta: number, pos: number, at: 'near' | 'far' | 'center' } | null}
 */
function bestAxisSnap(lo, size, lines, tol, refs) {
  const valueOf = { near: lo, far: lo + size, center: lo + size / 2 }
  let best = null
  for (const line of lines) {
    for (const at of refs) {
      const delta = line.pos - valueOf[at]
      if (Math.abs(delta) > tol) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, pos: line.pos, at }
      }
    }
  }
  return best
}

/** Edges of the piece — what butts up against a wall or a neighbour. */
const EDGE_REFS = /** @type {const} */ (['near', 'far'])
/** The piece's centre — only ever paired with a neighbour's centre. */
const CENTER_REFS = /** @type {const} */ (['center'])

/**
 * @param {Rect} rect the dragged placement's proposed footprint
 * @param {SpatialWall[]} walls
 * @param {Rect[]} others other placements' footprints
 * @param {{
 *   pxPerFt: number,
 *   zoom?: number,
 *   thicknessFor: (w: SpatialWall) => number,
 *   free?: boolean,
 * }} opts `free` = Alt 按住:只留 1″ 网格,不贴墙不对齐
 * @returns {PlacementSnapResult}
 */
export function resolvePlacementSnap(rect, walls, others, opts) {
  // Alt 临时脱开吸附 —— 建墙工具早有这个手势(freeAngle),家具却没有,同一张画布
  // 上两套规矩。留 1″ 网格:完全自由会落在分数英寸上,之后每次微调都继承那个零头。
  if (opts.free) {
    const s = opts.pxPerFt / 12
    return {
      x: Math.round(rect.x / s) * s,
      y: Math.round(rect.y / s) * s,
      guides: [],
      snappedX: false,
      snappedY: false,
    }
  }
  const tol = SNAP_TOL_PX / Math.max(0.2, opts.zoom ?? 1)
  const lines = wallLines(walls, opts.thicknessFor)

  // Only consider walls that actually run alongside the piece.
  const wallX = lines.filter(
    (l) => l.axis === 'x' && overlaps(rect.y, rect.y + rect.h, l.lo, l.hi),
  )
  const wallY = lines.filter(
    (l) => l.axis === 'y' && overlaps(rect.x, rect.x + rect.w, l.lo, l.hi),
  )

  // Neighbour edges and centres.
  /** @type {{ pos: number }[]} */
  const edgeX = []
  /** @type {{ pos: number }[]} */
  const edgeY = []
  /** @type {{ pos: number }[]} */
  const centerX = []
  /** @type {{ pos: number }[]} */
  const centerY = []
  for (const o of others) {
    edgeX.push({ pos: o.x }, { pos: o.x + o.w })
    edgeY.push({ pos: o.y }, { pos: o.y + o.h })
    centerX.push({ pos: o.x + o.w / 2 })
    centerY.push({ pos: o.y + o.h / 2 })
  }

  const pickAxis = (lo, size, wallCands, edgeCands, centerCands) => {
    const wall = bestAxisSnap(lo, size, wallCands, tol, EDGE_REFS)
    if (wall) return { ...wall, source: /** @type {const} */ ('wall') }
    const edge = bestAxisSnap(lo, size, edgeCands, tol, EDGE_REFS)
    if (edge) return { ...edge, source: /** @type {const} */ ('edge') }
    const center = bestAxisSnap(lo, size, centerCands, tol, CENTER_REFS)
    if (center) return { ...center, source: /** @type {const} */ ('center') }
    return null
  }

  const sx = pickAxis(rect.x, rect.w, wallX, edgeX, centerX)
  const sy = pickAxis(rect.y, rect.h, wallY, edgeY, centerY)

  // Per axis, a real snap wins outright; only an axis that caught nothing falls
  // back to the 1″ grid. Re-gridding a snapped axis would undo it — an interior
  // wall's face sits at centreline ± 2.25″, which is off-grid, so a grid pass
  // would pull the piece back off the wall it just landed on.
  const step = opts.pxPerFt / 12
  const grid = (v) => Math.round(v / step) * step
  const x = sx ? rect.x + sx.delta : grid(rect.x)
  const y = sy ? rect.y + sy.delta : grid(rect.y)

  /** @type {PlacementGuide[]} */
  const guides = []
  if (sx) {
    guides.push({
      kind: 'vertical',
      pos: sx.pos,
      from: { x: sx.pos, y: y - GUIDE_PAD_PX },
      to: { x: sx.pos, y: y + rect.h + GUIDE_PAD_PX },
      source: sx.source,
    })
  }
  if (sy) {
    guides.push({
      kind: 'horizontal',
      pos: sy.pos,
      from: { x: x - GUIDE_PAD_PX, y: sy.pos },
      to: { x: x + rect.w + GUIDE_PAD_PX, y: sy.pos },
      source: sy.source,
    })
  }

  return { x, y, guides, snappedX: Boolean(sx), snappedY: Boolean(sy) }
}

/** 只压住一点点不算撞:吸附落位常有 1px 级的接缝 */
const OVERLAP_SLACK_PX = 2

/**
 * 落位是否压在别的家具身上。**不阻止**,只据实相告 —— 沙发压茶几可能是真的
 * (床下收纳盒、餐桌塞椅子),软件不该替用户否决现实;但压着不知道就是错的。
 * @param {Rect} rect
 * @param {Rect[]} others
 * @returns {boolean}
 */
export function overlapsAny(rect, others) {
  return others.some(
    (o) =>
      rect.x + rect.w - OVERLAP_SLACK_PX > o.x &&
      o.x + o.w - OVERLAP_SLACK_PX > rect.x &&
      rect.y + rect.h - OVERLAP_SLACK_PX > o.y &&
      o.y + o.h - OVERLAP_SLACK_PX > rect.y,
  )
}
