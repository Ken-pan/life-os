/**
 * Procedural window symbols for floor plans (CAD-style: strokes only, no fill).
 *
 * US drafting convention (ANSI/AIA): a window reads as a gap in the wall with
 * parallel lines spanning the wall *thickness* — outer lines are the wall faces,
 * inner line(s) the glazing. Operation is implied by the inner lines:
 *   fixed    — single glazing line centred in the jamb
 *   sliding  — two panels overlapping at mid-span (one slides past the other)
 *   casement — glazing line + swing arc kept tight to the jamb, which is what
 *              distinguishes it from a door arc
 *   hung     — double glazing line (both sashes operable)
 *
 * Symbols are built in the wall's own frame — `t` runs along the wall from p0
 * to p1, `s` runs across it — so they sit correctly on a wall at any angle, not
 * just axis-aligned ones. The wall graph lets you draw free-angle walls (Shift
 * is only an ortho *snap*), so an axis-aligned symbol would float off a
 * diagonal wall.
 */

/** @typedef {import('./types.js').Point} Point */
/** @typedef {'fixed' | 'sliding' | 'casement' | 'hung'} WindowStyle */

/**
 * Wall-local frame. `u` runs p0→p1; `n` is u rotated +90° in screen space
 * (y-down). The basis is a pure rotation (det = +1), which matters for the
 * casement arc: an orientation-preserving frame keeps SVG's sweep flag meaning
 * the same as it does in the axis-aligned case.
 * @param {Point} p0
 * @param {Point} p1
 */
function wallFrame(p0, p1) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return { ux, uy, nx: -uy, ny: ux, len }
}

/**
 * Point at `t` along the wall and `s` across it, in absolute plan coords.
 * @param {Point} p0
 * @param {ReturnType<typeof wallFrame>} f
 * @param {number} t
 * @param {number} s
 */
function at(p0, f, t, s) {
  return {
    x: p0.x + f.ux * t + f.nx * s,
    y: p0.y + f.uy * t + f.ny * s,
  }
}

/** @param {number} n */
function r2(n) {
  return Math.round(n * 100) / 100
}

/**
 * @param {Point} a
 * @param {Point} b
 */
function seg(a, b) {
  return `M ${r2(a.x)} ${r2(a.y)} L ${r2(b.x)} ${r2(b.y)}`
}

/**
 * The four frame lines that close the opening: two wall faces + two jambs.
 * @param {Point} p0
 * @param {ReturnType<typeof wallFrame>} f
 * @param {number} half
 */
function jambs(p0, f, half) {
  const len = f.len
  return [
    seg(at(p0, f, 0, -half), at(p0, f, len, -half)),
    seg(at(p0, f, 0, half), at(p0, f, len, half)),
    seg(at(p0, f, 0, -half), at(p0, f, 0, half)),
    seg(at(p0, f, len, -half), at(p0, f, len, half)),
  ]
}

/**
 * Casement arc radius. Scaled off the wall thickness rather than the leaf
 * length: the convention is that a casement's arc reads as a small tick near
 * the jamb, while a door's sweeps the full leaf into the room. Matching a
 * door's radius here would erase the distinction the symbol exists to make.
 * @param {number} span
 * @param {number} thickness
 */
function casementRadius(span, thickness) {
  return Math.min(span * 0.5, thickness * 1.3)
}

/**
 * Plan symbol for a window spanning p0→p1 on a wall of the given thickness.
 *
 * @param {WindowStyle | undefined} style
 * @param {Point} p0
 * @param {Point} p1
 * @param {{ thickness?: number, out?: boolean }} [opts]
 *   `out` picks the casement's hinge side; it is relative to the wall's own
 *   direction, not to the building, so the UI offers a flip.
 * @returns {string} SVG path data in absolute plan coordinates
 */
export function windowPath(style, p0, p1, opts = {}) {
  const thickness = opts.thickness ?? 6
  const out = opts.out ?? true
  const f = wallFrame(p0, p1)
  const half = thickness / 2
  const len = f.len
  const parts = jambs(p0, f, half)

  if (style === 'sliding') {
    const inset = half * 0.5
    const mid = len / 2
    const lap = Math.min(len * 0.12, thickness)
    parts.push(seg(at(p0, f, 0, -inset), at(p0, f, mid + lap, -inset)))
    parts.push(seg(at(p0, f, len, inset), at(p0, f, mid - lap, inset)))
    return parts.join(' ')
  }

  if (style === 'hung') {
    const inset = half * 0.4
    parts.push(seg(at(p0, f, 0, -inset), at(p0, f, len, -inset)))
    parts.push(seg(at(p0, f, 0, inset), at(p0, f, len, inset)))
    return parts.join(' ')
  }

  // Glazing line down the middle — shared by fixed and casement.
  parts.push(seg(at(p0, f, 0, 0), at(p0, f, len, 0)))

  if (style === 'casement') {
    const rad = casementRadius(len, thickness)
    const dir = out ? -1 : 1
    const hinge = at(p0, f, 0, 0)
    const tip = at(p0, f, rad, dir * rad)
    parts.push(
      `M ${r2(hinge.x)} ${r2(hinge.y)} A ${r2(rad)} ${r2(rad)} 0 0 ${out ? 1 : 0} ${r2(tip.x)} ${r2(tip.y)}`,
    )
  }

  return parts.join(' ')
}
