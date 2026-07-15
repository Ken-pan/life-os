/**
 * Procedural door symbols for floor plans (CAD-style: strokes + arcs, no fill).
 *
 * The standard plan symbol for a swinging door is a *leaf* drawn perpendicular
 * to the wall at the hinge, plus a quarter-circle arc **centred on the hinge**
 * whose radius is the leaf's width — sweeping from the open leaf back to the
 * closed position against the far jamb. The arc must pass through the far jamb,
 * not through the hinge.
 *
 * Symbols are built in the wall's own frame (`t` runs hinge→latch, `s` across
 * the wall), so they sit correctly on a wall at any angle — the wall graph
 * allows free-angle walls, where an axis-aligned symbol would float off.
 *
 * Handing is expressed by argument order: pass the hinge jamb first. Which side
 * the door opens to is `side`, relative to the hinge→latch direction.
 */

/** @typedef {import('./types.js').Point} Point */
/** @typedef {'swing' | 'double' | 'sliding' | 'bypass' | 'bifold' | 'pocket'} DoorStyle */

/**
 * Wall-local frame. `u` runs hinge→latch; `n` is 90° clockwise from `u` in
 * screen coords (y-down), i.e. to the *right* of travel. The basis is a pure
 * rotation (det = +1), which keeps SVG's arc sweep flag meaning the same at any
 * wall angle.
 * @param {Point} a
 * @param {Point} b
 */
function frame(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return { ux, uy, nx: -uy, ny: ux, len }
}

/**
 * Point at `t` along the wall and `s` across it.
 * @param {Point} o
 * @param {ReturnType<typeof frame>} f
 * @param {number} t
 * @param {number} s
 */
function at(o, f, t, s) {
  return { x: o.x + f.ux * t + f.nx * s, y: o.y + f.uy * t + f.ny * s }
}

/** @param {number} n */
function r2(n) {
  return Math.round(n * 100) / 100
}

/** @param {Point} a @param {Point} b */
function seg(a, b) {
  return `M ${r2(a.x)} ${r2(a.y)} L ${r2(b.x)} ${r2(b.y)}`
}

/**
 * Quarter arc of radius `rad` from `from` to `to`.
 * @param {Point} from
 * @param {Point} to
 * @param {number} rad
 * @param {number} sweep
 */
function arc(from, to, rad, sweep) {
  return `M ${r2(from.x)} ${r2(from.y)} A ${r2(rad)} ${r2(rad)} 0 0 ${sweep} ${r2(to.x)} ${r2(to.y)}`
}

/**
 * Plan symbol for a door filling the opening from `hinge` to `latch`.
 *
 * @param {DoorStyle | undefined} style
 * @param {Point} hinge jamb the door is hinged on (or the leading jamb for
 *   sliding styles)
 * @param {Point} latch the opposite jamb
 * @param {{ thickness?: number, side?: 'left' | 'right' }} [opts]
 *   `side` is which way the leaf opens, relative to the hinge→latch direction.
 * @returns {string} SVG path data in absolute plan coordinates
 */
export function doorPath(style, hinge, latch, opts = {}) {
  const thickness = opts.thickness ?? 6
  const dir = opts.side === 'right' ? 1 : -1
  // Travelling hinge→latch, +n is to the right, so a right-hand swing sweeps
  // counter-clockwise on screen and a left-hand one clockwise.
  const sweep = dir < 0 ? 1 : 0
  const f = frame(hinge, latch)
  const L = f.len
  const parts = []

  if (style === 'sliding' || style === 'bypass') {
    // Panels ride on tracks offset from the wall centreline. A bypass has two
    // that overlap at mid-span; a single slider has one covering the opening.
    const off = thickness * 0.28
    if (style === 'bypass') {
      parts.push(seg(at(hinge, f, 0, -off), at(hinge, f, L * 0.55, -off)))
      parts.push(seg(at(hinge, f, L * 0.45, off), at(hinge, f, L, off)))
    } else {
      parts.push(seg(at(hinge, f, 0, -off), at(hinge, f, L, -off)))
    }
    // Jamb ticks so the opening reads as an opening, not a gap in the wall.
    parts.push(seg(at(hinge, f, 0, -thickness / 2), at(hinge, f, 0, thickness / 2)))
    parts.push(seg(at(hinge, f, L, -thickness / 2), at(hinge, f, L, thickness / 2)))
    return parts.join(' ')
  }

  if (style === 'pocket') {
    // Panel half-drawn out of a cavity inside the wall; the hidden half is
    // dashed by the .door-pocket class.
    const off = thickness * 0.2
    parts.push(seg(at(hinge, f, 0, -off), at(hinge, f, L * 0.55, -off)))
    parts.push(seg(at(hinge, f, L * 0.55, -off), at(hinge, f, L, -off)))
    parts.push(seg(at(hinge, f, 0, -thickness / 2), at(hinge, f, 0, thickness / 2)))
    parts.push(seg(at(hinge, f, L, -thickness / 2), at(hinge, f, L, thickness / 2)))
    return parts.join(' ')
  }

  if (style === 'bifold') {
    // Double bifold: a shallow V folding out of each jamb, meeting at mid-span.
    const depth = L * 0.42
    const mid = at(hinge, f, L / 2, 0)
    parts.push(seg(at(hinge, f, 0, 0), at(hinge, f, L * 0.25, dir * depth)))
    parts.push(seg(at(hinge, f, L * 0.25, dir * depth), mid))
    parts.push(seg(at(hinge, f, L, 0), at(hinge, f, L * 0.75, dir * depth)))
    parts.push(seg(at(hinge, f, L * 0.75, dir * depth), mid))
    return parts.join(' ')
  }

  if (style === 'double') {
    // Two leaves, each half the opening, hinged at opposite jambs.
    const half = L / 2
    const tipA = at(hinge, f, 0, dir * half)
    const midPt = at(hinge, f, half, 0)
    parts.push(seg(at(hinge, f, 0, 0), tipA))
    parts.push(arc(tipA, midPt, half, sweep))
    const tipB = at(hinge, f, L, dir * half)
    parts.push(seg(at(hinge, f, L, 0), tipB))
    // Leaf B is hinged at the far jamb, so its sweep is mirrored.
    parts.push(arc(tipB, midPt, half, sweep ? 0 : 1))
    return parts.join(' ')
  }

  // Single swing: leaf perpendicular at the hinge + arc centred on the hinge,
  // radius = leaf width, closing onto the far jamb.
  const tip = at(hinge, f, 0, dir * L)
  parts.push(seg(at(hinge, f, 0, 0), tip))
  parts.push(arc(tip, latch, L, sweep))
  return parts.join(' ')
}
