/**
 * Plan-view furniture symbols.
 *
 * Each builder receives the placement footprint in plan px and returns SVG
 * markup drawn in absolute coordinates, unrotated — the caller wraps it in the
 * placement's rotate() transform. Everything is stroked against the outline
 * rect the caller already drew, so builders only add the *interior* detail that
 * makes the piece readable at a glance (a bed's pillow and turned-down sheet, a
 * sofa's back and arms, burners on a range).
 *
 * Detail is suppressed below a size threshold: at small scales the extra
 * strokes read as mud, so tiny placements keep just their outline.
 *
 * Interior proportions must stay expressed as fractions of the box — never as
 * absolute px. The box arrives in plan px, and plan scale is a variable
 * (pxPerFt), so a px constant silently means a different real-world size per
 * project. DETAIL_MIN_PX is the deliberate exception: it is a legibility
 * threshold about screen space, not about the furniture.
 */

const DETAIL_MIN_PX = 18

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */

const line = (x1, y1, x2, y2) =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" class="furn-line"/>`

const rect = (x, y, w, h, rx = 0) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${rx}" class="furn-line"/>`

const circle = (cx, cy, rad) =>
  `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" class="furn-line"/>`

const ellipse = (cx, cy, rx, ry) =>
  `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" class="furn-line"/>`

const path = (d) => `<path d="${d}" class="furn-line"/>`

/**
 * Dash any of the above.
 *
 * Plan convention, and the reason this exists: a solid line means "you walk
 * into this". Things above the cut plane (wall cabinets, a range hood, a
 * ceiling fan) and things you can step on or fold away (a rug, a mat, a pet
 * pen) are drawn dashed so the plan reads clearance correctly — a dashed
 * upper cabinet does not block the counter under it.
 *
 * `dash` is a length, so callers derive it from the box like every other
 * dimension here; a px constant would mean a different real-world dash per
 * project scale.
 */
const dashed = (markup, dash) =>
  markup.replace('class="furn-line"', `class="furn-line" stroke-dasharray="${r(dash)} ${r(dash)}"`)

/** Round to 2dp — keeps the emitted path readable and the SVG small. */
function r(n) {
  return Math.round(n * 100) / 100
}

/**
 * Bed — pillow band at the head, turned-down sheet across the foot.
 * @param {Box} b
 */
function bed({ x, y, w, h }) {
  const pillowH = h * 0.18
  const inset = Math.min(w, h) * 0.06
  return [
    rect(x + inset, y + inset, w - inset * 2, pillowH, 2),
    line(x, y + h * 0.42, x + w, y + h * 0.42),
  ].join('')
}

/**
 * Sofa — back cushion along the top edge, arms down each side, seat splits.
 * @param {Box} b
 * @param {number} seats
 */
function sofa({ x, y, w, h }, seats = 3) {
  const back = h * 0.26
  const arm = w * 0.1
  const parts = [
    line(x, y + back, x + w, y + back),
    line(x + arm, y + back, x + arm, y + h),
    line(x + w - arm, y + back, x + w - arm, y + h),
  ]
  const seatW = (w - arm * 2) / seats
  for (let i = 1; i < seats; i++) {
    parts.push(line(x + arm + seatW * i, y + back, x + arm + seatW * i, y + h))
  }
  return parts.join('')
}

/** @param {Box} b */
function loveseat(b) {
  return sofa(b, 2)
}

/** @param {Box} b */
function armchair(b) {
  return sofa(b, 1)
}

/** Table — inner outline reads as the top overhanging its base. @param {Box} b */
function table({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.14
  return rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 2)
}

/** Chair — seat pad plus a back rail. @param {Box} b */
function chair({ x, y, w, h }) {
  const back = h * 0.22
  return line(x, y + back, x + w, y + back)
}

/** Cabinet / dresser / nightstand — doors shown as a drawer face. @param {Box} b */
function cabinet({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1)
}

/** Wardrobe — cabinet body + hanging rod line. @param {Box} b */
function wardrobe({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  return [
    rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1),
    line(x + w / 2, y + inset, x + w / 2, y + h - inset),
  ].join('')
}

/**
 * Shelf — open shelving. Bays come off the aspect ratio rather than an absolute
 * width, since the box is in plan px and the scale varies.
 * @param {Box} b
 */
function shelf({ x, y, w, h }) {
  const bays = Math.min(6, Math.max(2, Math.round(w / Math.max(h, 1))))
  const parts = []
  for (let i = 1; i < bays; i++) {
    parts.push(line(x + (w / bays) * i, y, x + (w / bays) * i, y + h))
  }
  return parts.join('')
}

/** Fridge — door face plus the swing side. @param {Box} b */
function fridge({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  return [
    rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1),
    line(x + w * 0.5, y + inset, x + w * 0.5, y + h - inset),
  ].join('')
}

/** Range — four burners and a control strip at the back. @param {Box} b */
function stove({ x, y, w, h }) {
  const strip = h * 0.18
  const top = y + strip
  const bodyH = h - strip
  const rad = Math.min(w, bodyH) * 0.16
  const cxs = [x + w * 0.28, x + w * 0.72]
  const cys = [top + bodyH * 0.3, top + bodyH * 0.72]
  const parts = [line(x, top, x + w, top)]
  for (const cx of cxs) for (const cy of cys) parts.push(circle(cx, cy, rad))
  return parts.join('')
}

/** Kitchen sink — basin with a faucet mark at the back. @param {Box} b */
function kitchenSink({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  const basinY = y + inset * 1.6
  return [
    rect(x + inset, basinY, w - inset * 2, h - inset * 2.6, 2),
    circle(x + w / 2, y + inset * 0.8, Math.min(w, h) * 0.05),
  ].join('')
}

/** Vanity — counter with an oval basin. @param {Box} b */
function vanity({ x, y, w, h }) {
  return [
    ellipse(x + w / 2, y + h * 0.55, w * 0.28, h * 0.3),
    circle(x + w / 2, y + h * 0.16, Math.min(w, h) * 0.06),
  ].join('')
}

/** Toilet — tank across the back, bowl in front. @param {Box} b */
function toilet({ x, y, w, h }) {
  const tankH = h * 0.28
  return [
    rect(x, y, w, tankH, 1),
    ellipse(x + w / 2, y + tankH + (h - tankH) * 0.52, w * 0.38, (h - tankH) * 0.44),
  ].join('')
}

/** Tub — inner basin and the drain end. @param {Box} b */
function tub({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return [
    rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 6),
    circle(x + w - inset * 2.4, y + h / 2, Math.min(w, h) * 0.05),
  ].join('')
}

/** Shower — pan with the diagonal drain slope drafters use. @param {Box} b */
function shower({ x, y, w, h }) {
  return [
    line(x, y, x + w, y + h),
    line(x + w, y, x, y + h),
    circle(x + w / 2, y + h / 2, Math.min(w, h) * 0.07),
  ].join('')
}

/**
 * Dishwasher — a front panel with the control strip above it. Not a drum: that
 * is the laundry symbol, and a plan that draws both the same way loses the one
 * distinction a kitchen elevation actually needs.
 * @param {Box} b
 */
function dishwasher({ x, y, w, h }) {
  const strip = h * 0.2
  const inset = Math.min(w, h) * 0.1
  return [
    line(x, y + strip, x + w, y + strip),
    rect(x + inset, y + strip + inset, w - inset * 2, h - strip - inset * 2, 1),
  ].join('')
}

/**
 * Hanging rod — a single rail across the closet with its shelf above. Drawing
 * this as shelving would read as fixed shelves, which is the opposite of a
 * wardrobe closet.
 * @param {Box} b
 */
function rod({ x, y, w, h }) {
  const inset = w * 0.04
  const bracket = h * 0.07
  return [
    line(x + inset, y + h * 0.3, x + w - inset, y + h * 0.3),
    line(x + inset, y + h * 0.62, x + w - inset, y + h * 0.62),
    circle(x + inset, y + h * 0.62, bracket),
    circle(x + w - inset, y + h * 0.62, bracket),
  ].join('')
}

/** Washer / dryer — drum circle. @param {Box} b */
function appliance({ x, y, w, h }) {
  return circle(x + w / 2, y + h / 2, Math.min(w, h) * 0.3)
}

/**
 * Wall cabinet — dashed, because it hangs above the counter rather than
 * standing on the floor. Solid would read as a base cabinet and double-count
 * the run's footprint.
 * @param {Box} b
 */
function wallCabinet({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return dashed(rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1), Math.min(w, h) * 0.12)
}

/**
 * Base cabinet run — counter nosing along the front edge, door splits across
 * the run. Bays come off the aspect ratio so a long run reads as several doors.
 * @param {Box} b
 */
function counter({ x, y, w, h }) {
  const lip = h * 0.16
  const doors = Math.min(8, Math.max(1, Math.round(w / Math.max(h, 1))))
  const parts = [line(x, y + h - lip, x + w, y + h - lip)]
  for (let i = 1; i < doors; i++) {
    parts.push(line(x + (w / doors) * i, y, x + (w / doors) * i, y + h - lip))
  }
  return parts.join('')
}

/** Range hood — dashed trapezoid narrowing to the duct at the wall. @param {Box} b */
function rangeHood({ x, y, w, h }) {
  const dash = Math.min(w, h) * 0.1
  const taper = w * 0.28
  return [
    dashed(
      path(
        `M${r(x)} ${r(y + h)} L${r(x + taper)} ${r(y)} L${r(x + w - taper)} ${r(y)} L${r(x + w)} ${r(y + h)}`,
      ),
      dash,
    ),
    dashed(rect(x + w * 0.4, y, w * 0.2, h * 0.32), dash),
  ].join('')
}

/** Microwave — door across the face, control panel down the right. @param {Box} b */
function microwave({ x, y, w, h }) {
  const panel = w * 0.24
  const inset = Math.min(w, h) * 0.1
  return [
    line(x + w - panel, y, x + w - panel, y + h),
    rect(x + inset, y + inset, w - panel - inset * 2, h - inset * 2, 1),
  ].join('')
}

/**
 * Island — cabinet body set back from one long edge, leaving the counter
 * overhang that makes it an island rather than a table.
 * @param {Box} b
 */
function island({ x, y, w, h }) {
  const over = h * 0.22
  const inset = Math.min(w, h) * 0.08
  const bx = x + inset
  const by = y + inset
  const bw = w - inset * 2
  const bh = h - over - inset
  const doors = Math.min(8, Math.max(2, Math.round(bw / Math.max(bh, 1))))
  const parts = [rect(bx, by, bw, bh, 1)]
  for (let i = 1; i < doors; i++) {
    parts.push(line(bx + (bw / doors) * i, by, bx + (bw / doors) * i, by + bh))
  }
  return parts.join('')
}

/** Office chair — seat pad over a five-star base. @param {Box} b */
function officeChair({ x, y, w, h }) {
  const cx = x + w / 2
  const rad = Math.min(w, h) / 2
  const hub = y + h / 2 + rad * 0.12
  const parts = [line(x + w * 0.12, y + h * 0.2, x + w * 0.88, y + h * 0.2), circle(cx, hub, rad * 0.16)]
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2
    parts.push(line(cx, hub, cx + Math.cos(a) * rad * 0.76, hub + Math.sin(a) * rad * 0.76))
  }
  return parts.join('')
}

/** Monitor — curved screen on a stand, facing down the box. @param {Box} b */
function monitor({ x, y, w, h }) {
  return [
    path(`M${r(x)} ${r(y + h * 0.1)} Q${r(x + w / 2)} ${r(y + h * 0.6)} ${r(x + w)} ${r(y + h * 0.1)}`),
    line(x + w / 2, y + h * 0.38, x + w / 2, y + h * 0.82),
    line(x + w * 0.34, y + h * 0.9, x + w * 0.66, y + h * 0.9),
  ].join('')
}

/** Divider / acoustic panel — the panel line with a foot at each end. @param {Box} b */
function divider({ x, y, w, h }) {
  const foot = w * 0.06
  return [
    line(x, y + h / 2, x + w, y + h / 2),
    line(x + foot, y, x + foot, y + h),
    line(x + w - foot, y, x + w - foot, y + h),
  ].join('')
}

/**
 * Wire shelving — open mesh with corner posts. Denser than `shelf` on purpose:
 * the whole difference between a wire rack and a cabinet is that you see
 * through it.
 * @param {Box} b
 */
function wireRack({ x, y, w, h }) {
  const cols = Math.min(10, Math.max(3, Math.round(w / Math.max(h, 1)) * 2))
  const parts = [line(x, y + h / 2, x + w, y + h / 2)]
  for (let i = 1; i < cols; i++) {
    parts.push(line(x + (w / cols) * i, y, x + (w / cols) * i, y + h))
  }
  const post = Math.min(w, h) * 0.07
  for (const px of [x + post, x + w - post]) {
    for (const py of [y + post, y + h - post]) parts.push(circle(px, py, post))
  }
  return parts.join('')
}

/** Cube shelf (Kallax-style) — equal cubbies against a back panel. @param {Box} b */
function cubeShelf({ x, y, w, h }) {
  const back = h * 0.14
  const cols = Math.min(6, Math.max(2, Math.round(w / Math.max(h, 1))))
  const parts = [line(x, y + back, x + w, y + back)]
  for (let i = 1; i < cols; i++) {
    parts.push(line(x + (w / cols) * i, y + back, x + (w / cols) * i, y + h))
  }
  return parts.join('')
}

/** Floor mirror — hatched reflective face along the front. @param {Box} b */
function mirror({ x, y, w, h }) {
  const face = h * 0.4
  const parts = [line(x, y + face, x + w, y + face)]
  for (let i = 1; i < 6; i++) {
    const px = x + (w / 6) * i
    parts.push(line(px, y + face, px - w * 0.03, y))
  }
  return parts.join('')
}

/** Rug — dashed border: soft, walk straight over it. @param {Box} b */
function rug({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.08
  return dashed(rect(x + inset, y + inset, w - inset * 2, h - inset * 2), Math.min(w, h) * 0.06)
}

/** Exercise mat — dashed fold creases; rolls away, never an obstruction. @param {Box} b */
function mat({ x, y, w, h }) {
  const dash = Math.min(w, h) * 0.12
  const parts = []
  for (let i = 1; i < 4; i++) {
    parts.push(dashed(line(x + (w / 4) * i, y, x + (w / 4) * i, y + h), dash))
  }
  return parts.join('')
}

/** Floor lamp — the circle-and-cross every plan uses for a luminaire. @param {Box} b */
function floorLamp({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = (Math.min(w, h) / 2) * 0.84
  const d = rad * 0.707
  return [circle(cx, cy, rad), line(cx - d, cy - d, cx + d, cy + d), line(cx + d, cy - d, cx - d, cy + d)].join(
    '',
  )
}

/**
 * Ceiling fan — hub, blades, and the sweep circle, all dashed: it is overhead,
 * so it must not read as floor obstruction.
 * @param {Box} b
 */
function ceilingFan({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  const hub = rad * 0.16
  // Blades are quads, not spokes: a dashed spoke gets chopped into anonymous
  // ticks and stops reading as a fan. The sweep circle stays dashed — it is
  // reach, not an object.
  const parts = [dashed(circle(cx, cy, rad * 0.96), rad * 0.16), circle(cx, cy, hub)]
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const px = -uy * rad * 0.19
    const py = ux * rad * 0.19
    const x0 = cx + ux * hub * 1.2
    const y0 = cy + uy * hub * 1.2
    const x1 = cx + ux * rad * 0.88
    const y1 = cy + uy * rad * 0.88
    parts.push(
      path(
        `M${r(x0 + px)} ${r(y0 + py)} L${r(x1 + px * 0.55)} ${r(y1 + py * 0.55)} L${r(x1 - px * 0.55)} ${r(y1 - py * 0.55)} L${r(x0 - px)} ${r(y0 - py)} Z`,
      ),
    )
  }
  return parts.join('')
}

/** Air purifier / humidifier — round body with its intake ring. @param {Box} b */
function purifier({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  return [circle(cx, cy, rad * 0.84), circle(cx, cy, rad * 0.52), circle(cx, cy, rad * 0.14)].join('')
}

/** Trash can — body with the lid rim and its hinge line. @param {Box} b */
function trash({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  return [
    circle(cx, cy, rad * 0.84),
    circle(cx, cy, rad * 0.62),
    line(cx - rad * 0.62, cy, cx + rad * 0.62, cy),
  ].join('')
}

/** Laundry basket / bin — open weave. @param {Box} b */
function basket({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return [
    rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 3),
    line(x + inset, y + inset, x + w - inset, y + h - inset),
    line(x + w - inset, y + inset, x + inset, y + h - inset),
  ].join('')
}

/** Coat rack / entry hooks — wall rail with the hooks hanging off it. @param {Box} b */
function coatRack({ x, y, w, h }) {
  const rail = y + h * 0.22
  const parts = [line(x + w * 0.04, rail, x + w * 0.96, rail)]
  for (let i = 0; i < 4; i++) {
    parts.push(circle(x + w * (0.16 + (0.68 * i) / 3), rail + h * 0.24, Math.min(w, h) * 0.06))
  }
  return parts.join('')
}

/** Scooter / bike — deck between two wheels. @param {Box} b */
function scooter({ x, y, w, h }) {
  const wheel = h * 0.3
  return [
    rect(x + w * 0.18, y + h * 0.32, w * 0.64, h * 0.36, 1),
    circle(x + w * 0.1, y + h / 2, wheel),
    circle(x + w * 0.9, y + h / 2, wheel),
  ].join('')
}

/**
 * Tub-shower combo — tub basin, drain, showerhead riser, and the curtain track
 * dashed across the open side. `tub` alone loses the riser, which is the one
 * thing that says you cannot put a shelf over this end.
 * @param {Box} b
 */
function tubShower({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  const dash = Math.min(w, h) * 0.08
  return [
    rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 6),
    circle(x + w - inset * 2.4, y + h / 2, Math.min(w, h) * 0.05),
    circle(x + inset * 1.4, y + h / 2, Math.min(w, h) * 0.08),
    dashed(line(x, y + h - inset * 0.35, x + w, y + h - inset * 0.35), dash),
  ].join('')
}

/** Pet pen — dashed enclosure with its hinge posts. @param {Box} b */
function petPen({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.06
  const bx = x + inset
  const by = y + inset
  const bw = w - inset * 2
  const bh = h - inset * 2
  return [
    dashed(rect(bx, by, bw, bh, 2), Math.min(w, h) * 0.08),
    circle(bx, by + bh / 2, inset),
    circle(bx + bw, by + bh / 2, inset),
  ].join('')
}

/** @type {Record<string, (b: Box) => string>} */
const BUILDERS = {
  bed,
  dishwasher,
  rod,
  sofa,
  loveseat,
  armchair,
  table,
  chair,
  cabinet,
  wardrobe,
  shelf,
  fridge,
  stove,
  kitchenSink,
  vanity,
  toilet,
  tub,
  shower,
  appliance,
  wallCabinet,
  counter,
  rangeHood,
  microwave,
  island,
  officeChair,
  monitor,
  divider,
  wireRack,
  cubeShelf,
  mirror,
  rug,
  mat,
  floorLamp,
  ceilingFan,
  purifier,
  trash,
  basket,
  coatRack,
  scooter,
  tubShower,
  petPen,
}

/**
 * Interior detail for a placement, or '' when the symbol is unknown or the
 * footprint is too small for the detail to read.
 * @param {string | undefined} symbol
 * @param {Box} box
 * @returns {string}
 */
export function furnitureSymbol(symbol, box) {
  if (!symbol) return ''
  const build = BUILDERS[symbol]
  if (!build) return ''
  if (Math.min(box.w, box.h) < DETAIL_MIN_PX) return ''
  return build(box)
}
