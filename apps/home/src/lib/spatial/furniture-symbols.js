/**
 * Plan-view furniture symbols.
 *
 * Each builder receives the placement footprint in plan px and returns two
 * strings, both drawn in absolute coordinates and unrotated — the caller wraps
 * them in the placement's rotate() transform:
 *
 *   - `body`   the piece's **silhouette**. Filled, and it inherits both fill and
 *              stroke from the caller's <g>, which is what lets a placement carry
 *              its real scanned colour (see furniture-tint.js) and still light up
 *              when selected. `''` means "no shape of my own" — the caller falls
 *              back to a plain rounded rect.
 *   - `detail` interior strokes over the body: a bed's turned-down sheet, burners
 *              on a range. Never filled.
 *
 * Why body exists at all: this module used to draw *only* interior detail on top
 * of a rect the caller had already drawn, so every symbol was a box plus a few
 * lines. That is right for a cabinet — a cabinet in plan really is a rectangle —
 * but it is wrong for anything whose outline is the whole point. A dining chair
 * drawn that way was a square with one line across it, which reads as a box, not
 * a chair. Builders now own their outline, so a chair can be seat + backrest.
 *
 * Pieces that genuinely are rectangles in plan (cabinets, counters, tables) keep
 * a rect body on purpose. That is drafting convention, not laziness.
 *
 * Orientation convention: every symbol is drawn facing **down** (+y) with its
 * back at the top, unrotated. layout-508 and the placement editor both rely on
 * this — rotation 90 turns that back to the east.
 *
 * Detail is suppressed below a size threshold: at small scales the extra strokes
 * read as mud. The silhouette survives further down, since a shape stays legible
 * long after its interior stops being.
 *
 * Interior proportions must stay expressed as fractions of the box — never as
 * absolute px. The box arrives in plan px, and plan scale is a variable
 * (pxPerFt), so a px constant silently means a different real-world size per
 * project. The two *_MIN_PX values are the deliberate exception: they are
 * legibility thresholds about screen space, not about the furniture.
 */

import { shibaArt } from './shiba-art.js'

/** Below this, interior strokes collapse into mud — outline only. */
const DETAIL_MIN_PX = 18

/** Below this, even the silhouette is noise — the caller's plain rect is kinder. */
const BODY_MIN_PX = 9

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ body: string, detail: string }} Symbol */

// —— detail primitives: stroked, never filled ——

const line = (x1, y1, x2, y2) =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" class="furn-line"/>`

const rect = (x, y, w, h, rx = 0) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(rx)}" class="furn-line"/>`

const circle = (cx, cy, rad) =>
  `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" class="furn-line"/>`

const ellipse = (cx, cy, rx, ry) =>
  `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" class="furn-line"/>`

const path = (d) => `<path d="${d}" class="furn-line"/>`

// —— body primitives: inherit fill+stroke from the caller's <g> ——

const bRect = (x, y, w, h, rx = 0) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(rx)}" class="furn-body"/>`

const bCircle = (cx, cy, rad) =>
  `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" class="furn-body"/>`

const bEllipse = (cx, cy, rx, ry) =>
  `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(ry)}" class="furn-body"/>`

const bPath = (d) => `<path d="${d}" class="furn-body"/>`

/**
 * Mark a body shape as **hollow** — outline only, the floor shows through.
 *
 * Not the same as returning no body at all: an empty body makes the caller fall
 * back to a plain filled rect, which is the exact opposite of hollow. That bug
 * shipped once — a pet pen, a rug and a yoga mat all rendered as solid slabs
 * while the builders here "returned no fill", and the unit test asserted the
 * builders' intent (`body === ''`) rather than what actually got drawn.
 *
 * **A barrier is hollow; a container is not.** The test is what is inside the
 * outline, not whether the thing is pet-related or made of wire:
 *   - hollow — a pet **pen**: panels standing around a patch of *your floor*.
 *     Fill it and you have claimed 9sqft of room as solid object, and told the
 *     clutter score the same lie.
 *   - solid — a pet **crate**, a bird **cage**, a wire shelf: objects with their
 *     own base and walls. You see the crate's floor, not the room's. It sits on
 *     the floor the way a cabinet does, and it draws like one.
 * Reaching for `hollow` because something is "a cage" is how that line gets
 * crossed. Reach for it only when the enclosed area is genuinely still floor.
 */
const hollow = (markup) => markup.replace('class="furn-body"', 'class="furn-body furn-body-hollow"')

/**
 * Dash any of the above.
 *
 * Plan convention, and the reason this exists: a solid line means "you walk into
 * this". Things above the cut plane (wall cabinets, a range hood, a ceiling fan)
 * and things you can step on or fold away (a rug, a mat, a pet pen) are drawn
 * dashed so the plan reads clearance correctly — a dashed upper cabinet does not
 * block the counter under it.
 *
 * `dash` is a length, so callers derive it from the box like every other
 * dimension here; a px constant would mean a different real-world dash per
 * project scale.
 */
const dashed = (markup, dash) =>
  markup.replace(/class="(furn-line|furn-body)"/, `class="$1" stroke-dasharray="${r(dash)} ${r(dash)}"`)

/**
 * Mark a body as "not standing on the floor" — dashed outline plus a thinned
 * fill, so an overhead piece never reads as an obstruction you must walk around.
 */
const overhead = (markup, dash) =>
  dashed(markup, dash).replace('class="furn-body"', 'class="furn-body furn-body-overhead"')

/** Round to 2dp — keeps the emitted path readable and the SVG small. */
function r(n) {
  return Math.round(n * 100) / 100
}

/** Corner radius that stays proportional but never swallows a thin piece. */
const soft = (w, h, f = 0.12) => Math.min(w, h) * f

/**
 * Curved backrest band for a seat facing down (+y): crown at `yMid`, ends sweeping
 * forward to `yEnd`, `t` thick.
 *
 * The curve is the point. A back wraps the sitter, so its centre sits furthest
 * back and its ends come forward — and that shape reads as a back even where it
 * touches the seat. The straight pill this replaced could not: butted against the
 * seat the two merged into one square outline, so it had to be held off by a gap,
 * and a bar floating in a gap reads as a shelf behind a box. Curved, it can touch.
 *
 * Callers pass fractions of their own box, so the band scales with the footprint
 * like everything else here.
 */
function backBand(cx, halfW, yMid, yEnd, t) {
  const x0 = cx - halfW
  const x1 = cx + halfW
  // A quadratic's midpoint is (start + 2*ctrl + end)/4, so this is the control
  // point that lands the crown exactly on yMid. It sits outside the box — that is
  // arithmetic, not a bug: the curve itself never goes near it.
  const ctrl = 2 * yMid - yEnd
  return bPath(
    `M${r(x0)},${r(yEnd)}Q${r(cx)},${r(ctrl)} ${r(x1)},${r(yEnd)}` +
      `L${r(x1)},${r(yEnd + t)}Q${r(cx)},${r(ctrl + t)} ${r(x0)},${r(yEnd + t)}Z`,
  )
}

// —— 卧室 ——

/**
 * Bed — mattress with two pillows at the head and the sheet turned down across
 * the foot. Two pillows rather than one band: it says which end you sleep at
 * from across the plan, and a single band read as a shelf.
 * @param {Box} b
 * @returns {Symbol}
 */
function bed({ x, y, w, h }) {
  const pad = Math.min(w, h) * 0.05
  const pillowH = h * 0.16
  const gap = w * 0.04
  const pillowW = (w - pad * 2 - gap) / 2
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.05)),
    detail: [
      rect(x + pad, y + pad, pillowW, pillowH, pillowH * 0.4),
      rect(x + pad + pillowW + gap, y + pad, pillowW, pillowH, pillowH * 0.4),
      line(x, y + h * 0.42, x + w, y + h * 0.42),
    ].join(''),
  }
}

/**
 * Nightstand / dresser / cabinet — a rectangle in plan, correctly. The drawer
 * face is what distinguishes it from a table.
 * @param {Box} b
 * @returns {Symbol}
 */
function cabinet({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.06)),
    detail: rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1),
  }
}

/** Wardrobe — cabinet body plus the hanging rod's centre split. @param {Box} b @returns {Symbol} */
function wardrobe({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.05)),
    detail: [
      rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1),
      line(x + w / 2, y + inset, x + w / 2, y + h - inset),
    ].join(''),
  }
}

// —— 座具 ——
// The reason this file was rewritten. Seating is the one category where the
// outline carries the meaning: a box with a line across it is a box.

/**
 * Dining chair — seat pad with a backrest bar behind it.
 *
 * The seat is inset from the footprint on purpose: a chair's footprint includes
 * the space its back and legs splay into, but the *seat* is smaller, and drawing
 * the seat at full width is what made this read as a box.
 * @param {Box} b
 * @returns {Symbol}
 */
function chair({ x, y, w, h }) {
  const seatY = y + h * 0.18
  const seatH = h - (seatY - y)
  const seatInset = w * 0.1
  return {
    // The curve is what says "front" now. This used to be a straight bar held off
    // the seat by a gap, because butted together the two merged into one square
    // outline — but the gap made the bar read as a shelf standing behind a box.
    // A curved back can touch: its ends wrap forward past the seat's top corners
    // and get covered by the seat, so the two read as one chair facing you.
    body: [
      backBand(x + w / 2, w * 0.44, y + h * 0.02, y + h * 0.13, h * 0.1),
      bRect(x + seatInset, seatY, w - seatInset * 2, seatH, soft(w, seatH, 0.26)),
    ].join(''),
    detail: '',
  }
}

/**
 * Sofa — back slab, an arm down each side, and real seat cushions between them.
 *
 * Arms are clamped: on a loveseat `w*0.09` is a believable arm, but on a narrow
 * armchair the same fraction leaves no seat at all.
 * @param {Box} b
 * @param {number} seats
 * @returns {Symbol}
 */
function sofa({ x, y, w, h }, seats = 3) {
  const backH = h * 0.24
  // A one-seater is nearly square, so a fraction that looks like an arm on a
  // 84″ sofa disappears on it — and the arms are most of what says "armchair"
  // rather than "ottoman". Widen them, then clamp so they can never eat the seat.
  const armFrac = seats === 1 ? 0.18 : 0.12
  const arm = Math.min(w * armFrac, w / (seats * 2 + 2))
  const seatY = y + backH
  const seatH = h - backH
  const innerW = w - arm * 2
  const seatW = innerW / seats
  const pad = Math.min(seatW, seatH) * 0.08
  const cushions = []
  for (let i = 0; i < seats; i++) {
    cushions.push(
      bRect(
        x + arm + seatW * i + pad,
        seatY + pad,
        seatW - pad * 2,
        seatH - pad * 1.6,
        soft(seatW, seatH, 0.16),
      ),
    )
  }
  return {
    body: [
      bRect(x, y, w, h, soft(w, h, 0.1)),
      bRect(x, y, w, backH, soft(w, backH, 0.3)),
      bRect(x, seatY, arm, seatH, soft(arm, seatH, 0.3)),
      bRect(x + w - arm, seatY, arm, seatH, soft(arm, seatH, 0.3)),
      ...cushions,
    ].join(''),
    detail: '',
  }
}

/** @param {Box} b @returns {Symbol} */
function loveseat(b) {
  return sofa(b, 2)
}

/** @param {Box} b @returns {Symbol} */
function armchair(b) {
  return sofa(b, 1)
}

/**
 * Task chair — five-star caster base under a seat, wrapped by a curved back, with
 * an armrest down each side.
 *
 * **The base is drawn first and the seat covers it.** That ordering is the symbol.
 * The base used to be `detail`, on the theory that a filled star would read as a
 * slab rather than legs with floor between them — but detail paints *over* the
 * body, so five strokes ran clean across the seat and the chair read as a pizza
 * sliced into five. Laid down first, the star is occluded exactly where the real
 * seat occludes it, and what survives is what you actually see from above: five
 * casters peeking out from under the seat. Legs you can see the floor between,
 * which was the original goal, now for the right reason.
 *
 * The seat is deliberately big and set high in the box. That is what lets the two
 * rear casters fall under it: they land at ~0.24h, inside the seat, so three
 * casters show — front and both sides — exactly what you see standing over a real
 * chair. Shrink the seat and they crawl out into the gap below the back as two
 * loose bumps, which is worse than either hiding or showing them properly.
 *
 * The arms overlap the seat and get covered too, so they read as attached. They
 * are most of what separates this from a stool.
 * @param {Box} b
 * @returns {Symbol}
 */
function officeChair({ x, y, w, h }) {
  const cx = x + w / 2
  const hub = y + h * 0.54
  // The star is a circle, so it takes whichever half-dimension is tighter. Scaling
  // it per axis would splay the legs into an ellipse — a squashed footprint would
  // read as a collapsed chair rather than a narrow one.
  //
  // Sized against the seat, not the footprint: `hub - reach*cos36 - caster` is
  // where the rear casters land, and it has to stay below seatY or they surface in
  // the gap between seat and back. Widening the star past this is what puts a
  // long lonely spoke out the front, too — the base would outrun the seat forward.
  const reach = Math.min(w * 0.44, h * 0.36)
  const caster = reach * 0.12
  const seatW = w * 0.64
  const seatH = h * 0.62
  const seatY = y + h * 0.2
  const armW = w * 0.17
  const armH = h * 0.3
  const armY = y + h * 0.28

  const base = []
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 + Math.PI / 2
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const tx = cx + ux * reach
    const ty = hub + uy * reach
    // Each leg tapers hub → caster, like the real aluminium spider. (-uy, ux) is
    // the unit normal, so these four corners are the leg's own width, not the box's.
    const hw = reach * 0.1
    const tw = reach * 0.05
    base.push(
      bPath(
        `M${r(cx - uy * hw)},${r(hub + ux * hw)}L${r(tx - uy * tw)},${r(ty + ux * tw)}` +
          `L${r(tx + uy * tw)},${r(ty - ux * tw)}L${r(cx + uy * hw)},${r(hub - ux * hw)}Z`,
      ),
      bCircle(tx, ty, caster),
    )
  }

  return {
    body: [
      ...base,
      backBand(cx, w * 0.3, y + h * 0.02, y + h * 0.14, h * 0.09),
      bRect(cx - w * 0.47, armY, armW, armH, soft(armW, armH, 0.4)),
      bRect(cx + w * 0.47 - armW, armY, armW, armH, soft(armW, armH, 0.4)),
      bRect(cx - seatW / 2, seatY, seatW, seatH, soft(seatW, seatH, 0.3)),
    ].join(''),
    detail: '',
  }
}

// —— 桌台 ——

/** Table — inner outline reads as the top overhanging its base. @param {Box} b @returns {Symbol} */
function table({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.14
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.05)),
    detail: rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 2),
  }
}

/**
 * Base cabinet run — counter nosing along the front edge, door splits across the
 * run. Bays come off the aspect ratio so a long run reads as several doors.
 * @param {Box} b
 * @returns {Symbol}
 */
function counter({ x, y, w, h }) {
  const lip = h * 0.16
  const doors = Math.min(8, Math.max(1, Math.round(w / Math.max(h, 1))))
  const parts = [line(x, y + h - lip, x + w, y + h - lip)]
  for (let i = 1; i < doors; i++) {
    parts.push(line(x + (w / doors) * i, y, x + (w / doors) * i, y + h - lip))
  }
  return { body: bRect(x, y, w, h, 1), detail: parts.join('') }
}

/**
 * Island — cabinet body set back from one long edge, leaving the counter
 * overhang that makes it an island rather than a table.
 * @param {Box} b
 * @returns {Symbol}
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
  return { body: bRect(x, y, w, h, soft(w, h, 0.04)), detail: parts.join('') }
}

// —— 储物 ——

/**
 * Shelf — open shelving. Bays come off the aspect ratio rather than an absolute
 * width, since the box is in plan px and the scale varies.
 * @param {Box} b
 * @returns {Symbol}
 */
function shelf({ x, y, w, h }) {
  const bays = Math.min(6, Math.max(2, Math.round(w / Math.max(h, 1))))
  const parts = []
  for (let i = 1; i < bays; i++) {
    parts.push(line(x + (w / bays) * i, y, x + (w / bays) * i, y + h))
  }
  return { body: bRect(x, y, w, h, 1), detail: parts.join('') }
}

/**
 * Wire shelving — open mesh with corner posts. Denser than `shelf` on purpose:
 * the whole difference between a wire rack and a cabinet is that you see through
 * it.
 * @param {Box} b
 * @returns {Symbol}
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
  return { body: bRect(x, y, w, h, 1), detail: parts.join('') }
}

/** Rolling utility cart — inset tray and four casters make it distinct from a fixed rack. @param {Box} b @returns {Symbol} */
function utilityCart({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.13
  const wheel = Math.min(w, h) * 0.07
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.12)),
    detail: [
      rect(x + inset, y + inset, w - inset * 2, h - inset * 2, inset * 0.4),
      ...[
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + h - inset],
        [x + w - inset, y + h - inset],
      ].map(([cx, cy]) => circle(cx, cy, wheel)),
    ].join(''),
  }
}

/** Cube shelf (Kallax-style) — equal cubbies against a back panel. @param {Box} b @returns {Symbol} */
function cubeShelf({ x, y, w, h }) {
  const back = h * 0.14
  const cols = Math.min(6, Math.max(2, Math.round(w / Math.max(h, 1))))
  const parts = [line(x, y + back, x + w, y + back)]
  for (let i = 1; i < cols; i++) {
    parts.push(line(x + (w / cols) * i, y + back, x + (w / cols) * i, y + h))
  }
  return { body: bRect(x, y, w, h, 1), detail: parts.join('') }
}

/**
 * Hanging rod — a single rail across the closet with its shelf above. Drawing
 * this as shelving would read as fixed shelves, which is the opposite of a
 * wardrobe closet. No body: a closet rod is a rail in open air, and filling its
 * footprint would claim the floor under it.
 * @param {Box} b
 * @returns {Symbol}
 */
function rod({ x, y, w, h }) {
  const inset = w * 0.04
  const bracket = h * 0.07
  return {
    // The shelf above the rail is a real surface, so it reads as an outline —
    // but hollow: what is under a closet rod is hanging clothes and floor, not
    // a solid block.
    body: hollow(bRect(x + inset, y + h * 0.18, w - inset * 2, h * 0.24, 1)),
    detail: [
      line(x + inset, y + h * 0.62, x + w - inset, y + h * 0.62),
      circle(x + inset, y + h * 0.62, bracket),
      circle(x + w - inset, y + h * 0.62, bracket),
    ].join(''),
  }
}

/**
 * Wall cabinet — dashed, because it hangs above the counter rather than standing
 * on the floor. Solid would read as a base cabinet and double-count the run's
 * footprint.
 * @param {Box} b
 * @returns {Symbol}
 */
function wallCabinet({ x, y, w, h }) {
  const dash = Math.min(w, h) * 0.12
  const inset = Math.min(w, h) * 0.12
  return {
    body: overhead(bRect(x, y, w, h, 1), dash),
    detail: dashed(rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1), dash),
  }
}

/** Laundry basket / bin — open weave. @param {Box} b @returns {Symbol} */
function basket({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.18)),
    detail: [
      line(x + inset, y + inset, x + w - inset, y + h - inset),
      line(x + w - inset, y + inset, x + inset, y + h - inset),
    ].join(''),
  }
}

// —— 厨房 ——

/** Fridge — door face plus the swing split. @param {Box} b @returns {Symbol} */
function fridge({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.05)),
    detail: [
      rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 1),
      line(x + w * 0.5, y + inset, x + w * 0.5, y + h - inset),
    ].join(''),
  }
}

/** Range — four burners and a control strip at the back. @param {Box} b @returns {Symbol} */
function stove({ x, y, w, h }) {
  const strip = h * 0.18
  const top = y + strip
  const bodyH = h - strip
  const rad = Math.min(w, bodyH) * 0.16
  const parts = [line(x, top, x + w, top)]
  for (const cx of [x + w * 0.28, x + w * 0.72]) {
    for (const cy of [top + bodyH * 0.3, top + bodyH * 0.72]) parts.push(circle(cx, cy, rad))
  }
  return { body: bRect(x, y, w, h, soft(w, h, 0.05)), detail: parts.join('') }
}

/** Kitchen sink — basin with a faucet mark at the back. @param {Box} b @returns {Symbol} */
function kitchenSink({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.05)),
    detail: [
      rect(x + inset, y + inset * 1.6, w - inset * 2, h - inset * 2.6, 2),
      circle(x + w / 2, y + inset * 0.8, Math.min(w, h) * 0.05),
    ].join(''),
  }
}

/**
 * Dishwasher — a front panel with the control strip above it. Not a drum: that is
 * the laundry symbol, and a plan that draws both the same way loses the one
 * distinction a kitchen elevation actually needs.
 * @param {Box} b
 * @returns {Symbol}
 */
function dishwasher({ x, y, w, h }) {
  const strip = h * 0.2
  const inset = Math.min(w, h) * 0.1
  return {
    body: bRect(x, y, w, h, 1),
    detail: [
      line(x, y + strip, x + w, y + strip),
      rect(x + inset, y + strip + inset, w - inset * 2, h - strip - inset * 2, 1),
    ].join(''),
  }
}

/** Washer / dryer — drum circle. @param {Box} b @returns {Symbol} */
function appliance({ x, y, w, h }) {
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.06)),
    detail: circle(x + w / 2, y + h / 2, Math.min(w, h) * 0.3),
  }
}

/** Range hood — dashed trapezoid narrowing to the duct at the wall. @param {Box} b @returns {Symbol} */
function rangeHood({ x, y, w, h }) {
  const dash = Math.min(w, h) * 0.1
  const taper = w * 0.28
  return {
    body: overhead(
      bPath(
        `M${r(x)} ${r(y + h)} L${r(x + taper)} ${r(y)} L${r(x + w - taper)} ${r(y)} L${r(x + w)} ${r(y + h)} Z`,
      ),
      dash,
    ),
    detail: dashed(rect(x + w * 0.4, y, w * 0.2, h * 0.32), dash),
  }
}

/** Microwave — door across the face, control panel down the right. @param {Box} b @returns {Symbol} */
function microwave({ x, y, w, h }) {
  const panel = w * 0.24
  const inset = Math.min(w, h) * 0.1
  return {
    body: bRect(x, y, w, h, 1),
    detail: [
      line(x + w - panel, y, x + w - panel, y + h),
      rect(x + inset, y + inset, w - panel - inset * 2, h - inset * 2, 1),
    ].join(''),
  }
}

// —— 卫浴 ——

/** Vanity — counter with an oval basin. @param {Box} b @returns {Symbol} */
function vanity({ x, y, w, h }) {
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.05)),
    detail: [
      ellipse(x + w / 2, y + h * 0.55, w * 0.28, h * 0.3),
      circle(x + w / 2, y + h * 0.16, Math.min(w, h) * 0.06),
    ].join(''),
  }
}

/**
 * Toilet — tank across the back, bowl in front. The bowl is body, not detail:
 * the tank-plus-bowl silhouette is the whole symbol, and a toilet drawn as a
 * rectangle with an oval on it reads as a cabinet with a sink.
 * @param {Box} b
 * @returns {Symbol}
 */
function toilet({ x, y, w, h }) {
  const tankH = h * 0.28
  const bowlTop = y + tankH
  const bowlH = h - tankH
  return {
    body: [
      bRect(x + w * 0.06, y, w * 0.88, tankH, tankH * 0.25),
      bEllipse(x + w / 2, bowlTop + bowlH * 0.52, w * 0.36, bowlH * 0.46),
    ].join(''),
    detail: ellipse(x + w / 2, bowlTop + bowlH * 0.52, w * 0.22, bowlH * 0.3),
  }
}

/** Tub — inner basin and the drain end. @param {Box} b @returns {Symbol} */
function tub({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.1)),
    detail: [
      rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 6),
      circle(x + w - inset * 2.4, y + h / 2, Math.min(w, h) * 0.05),
    ].join(''),
  }
}

/** Shower — pan with the diagonal drain slope drafters use. @param {Box} b @returns {Symbol} */
function shower({ x, y, w, h }) {
  return {
    body: bRect(x, y, w, h, 1),
    detail: [
      line(x, y, x + w, y + h),
      line(x + w, y, x, y + h),
      circle(x + w / 2, y + h / 2, Math.min(w, h) * 0.07),
    ].join(''),
  }
}

/**
 * Tub-shower combo — tub basin, drain, showerhead riser, and the curtain track
 * dashed across the open side. `tub` alone loses the riser, which is the one
 * thing that says you cannot put a shelf over this end.
 * @param {Box} b
 * @returns {Symbol}
 */
function tubShower({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.1
  const dash = Math.min(w, h) * 0.08
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.1)),
    detail: [
      rect(x + inset, y + inset, w - inset * 2, h - inset * 2, 6),
      circle(x + w - inset * 2.4, y + h / 2, Math.min(w, h) * 0.05),
      circle(x + inset * 1.4, y + h / 2, Math.min(w, h) * 0.08),
      dashed(line(x, y + h - inset * 0.35, x + w, y + h - inset * 0.35), dash),
    ].join(''),
  }
}

// —— 电器 / 杂项 ——

/** Monitor — curved screen on a stand, facing down the box. @param {Box} b @returns {Symbol} */
function monitor({ x, y, w, h }) {
  const t = h * 0.16
  return {
    body: bPath(
      `M${r(x)} ${r(y + h * 0.1)} Q${r(x + w / 2)} ${r(y + h * 0.6)} ${r(x + w)} ${r(y + h * 0.1)} L${r(x + w)} ${r(y + h * 0.1 + t)} Q${r(x + w / 2)} ${r(y + h * 0.6 + t)} ${r(x)} ${r(y + h * 0.1 + t)} Z`,
    ),
    detail: [
      line(x + w / 2, y + h * 0.45, x + w / 2, y + h * 0.82),
      line(x + w * 0.34, y + h * 0.9, x + w * 0.66, y + h * 0.9),
    ].join(''),
  }
}

/** Divider / acoustic panel — a thin slab with a foot at each end. @param {Box} b @returns {Symbol} */
function divider({ x, y, w, h }) {
  const foot = w * 0.06
  const t = h * 0.24
  return {
    body: [
      bRect(x, y + h / 2 - t / 2, w, t, t * 0.3),
      bRect(x, y, foot * 2, h, foot),
      bRect(x + w - foot * 2, y, foot * 2, h, foot),
    ].join(''),
    detail: '',
  }
}

/** Floor mirror — hatched reflective face along the front. @param {Box} b @returns {Symbol} */
function mirror({ x, y, w, h }) {
  const face = h * 0.4
  const parts = []
  for (let i = 1; i < 6; i++) {
    const px = x + (w / 6) * i
    parts.push(line(px, y + face, px - w * 0.03, y))
  }
  return { body: bRect(x, y, w, face, 1), detail: parts.join('') }
}

/**
 * Rug — dashed, no fill of its own: soft, walk straight over it. Giving a rug a
 * filled body would let its scanned colour swamp the room it sits in, and a rug
 * is exactly the piece whose colour is least worth that.
 * @param {Box} b
 * @returns {Symbol}
 */
function rug({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.08
  const dash = Math.min(w, h) * 0.06
  return {
    body: hollow(dashed(bRect(x, y, w, h, 2), dash)),
    detail: dashed(rect(x + inset, y + inset, w - inset * 2, h - inset * 2), dash),
  }
}

/** Exercise mat — dashed fold creases; rolls away, never an obstruction. @param {Box} b @returns {Symbol} */
function mat({ x, y, w, h }) {
  const dash = Math.min(w, h) * 0.12
  const parts = []
  for (let i = 1; i < 4; i++) {
    parts.push(dashed(line(x + (w / 4) * i, y, x + (w / 4) * i, y + h), dash))
  }
  return { body: hollow(dashed(bRect(x, y, w, h, 2), dash)), detail: parts.join('') }
}

/** Floor lamp — the circle-and-cross every plan uses for a luminaire. @param {Box} b @returns {Symbol} */
function floorLamp({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = (Math.min(w, h) / 2) * 0.84
  const d = rad * 0.707
  return {
    body: bCircle(cx, cy, rad),
    detail: [line(cx - d, cy - d, cx + d, cy + d), line(cx + d, cy - d, cx - d, cy + d)].join(''),
  }
}

/** Studio softbox on a tripod — three legs plus the directional lamp head. @param {Box} b @returns {Symbol} */
function studioLight({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) * 0.42
  const hub = rad * 0.14
  return {
    body: bCircle(cx, cy, rad),
    detail: [
      line(cx, cy, cx, cy - rad),
      line(cx, cy, cx - rad * 0.87, cy + rad * 0.5),
      line(cx, cy, cx + rad * 0.87, cy + rad * 0.5),
      circle(cx, cy, hub),
      rect(cx - rad * 0.34, cy - rad * 0.92, rad * 0.68, rad * 0.24, rad * 0.05),
    ].join(''),
  }
}

/** Bathroom scale — low rounded platform with the display window at its head. @param {Box} b @returns {Symbol} */
function bathScale({ x, y, w, h }) {
  const inset = Math.min(w, h) * 0.12
  return {
    body: bRect(x, y, w, h, soft(w, h, 0.18)),
    detail: rect(x + w * 0.34, y + inset, w * 0.32, h * 0.16, h * 0.04),
  }
}

/**
 * Ceiling fan — hub, blades, and the sweep circle, all overhead: it must not
 * read as floor obstruction.
 *
 * Blades are quads, not spokes: a dashed spoke gets chopped into anonymous ticks
 * and stops reading as a fan. The sweep circle stays dashed — it is reach, not an
 * object.
 * @param {Box} b
 * @returns {Symbol}
 */
function ceilingFan({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  const hub = rad * 0.16
  const blades = []
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
    blades.push(
      bPath(
        `M${r(x0 + px)} ${r(y0 + py)} L${r(x1 + px * 0.55)} ${r(y1 + py * 0.55)} L${r(x1 - px * 0.55)} ${r(y1 - py * 0.55)} L${r(x0 - px)} ${r(y0 - py)} Z`,
      ).replace('class="furn-body"', 'class="furn-body furn-body-overhead"'),
    )
  }
  return {
    body: [bCircle(cx, cy, hub), ...blades].join(''),
    detail: dashed(circle(cx, cy, rad * 0.96), rad * 0.16),
  }
}

/** Air purifier / humidifier — round body with its intake ring. @param {Box} b @returns {Symbol} */
function purifier({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  return {
    body: bCircle(cx, cy, rad * 0.88),
    detail: [circle(cx, cy, rad * 0.52), circle(cx, cy, rad * 0.14)].join(''),
  }
}

/** Trash can — body with the lid rim and its hinge line. @param {Box} b @returns {Symbol} */
function trash({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  return {
    body: bCircle(cx, cy, rad * 0.88),
    detail: [circle(cx, cy, rad * 0.62), line(cx - rad * 0.62, cy, cx + rad * 0.62, cy)].join(''),
  }
}

/** Coat rack / entry hooks — wall rail with the hooks hanging off it. @param {Box} b @returns {Symbol} */
function coatRack({ x, y, w, h }) {
  const rail = y + h * 0.22
  const t = h * 0.12
  const hooks = []
  for (let i = 0; i < 4; i++) {
    hooks.push(circle(x + w * (0.16 + (0.68 * i) / 3), rail + h * 0.24, Math.min(w, h) * 0.06))
  }
  return {
    body: bRect(x + w * 0.04, rail - t / 2, w * 0.92, t, t * 0.4),
    detail: hooks.join(''),
  }
}

/** Scooter / bike — deck between two wheels. @param {Box} b @returns {Symbol} */
function scooter({ x, y, w, h }) {
  const wheel = h * 0.3
  return {
    body: [
      bRect(x + w * 0.18, y + h * 0.32, w * 0.64, h * 0.36, h * 0.1),
      bCircle(x + w * 0.1, y + h / 2, wheel),
      bCircle(x + w * 0.9, y + h / 2, wheel),
    ].join(''),
    detail: '',
  }
}

/**
 * Pet pen — wire panels around empty floor, with posts at the joints and a gate.
 *
 * Drawn the way a plan draws any fence or railing: a light **solid** outline,
 * hollow, with posts. Three things this is deliberately not:
 *
 *   - **Not filled.** Poché is for what the cut plane slices. A 32in pen sits
 *     below the ~5ft plane, so you are looking down *at* it, not through it —
 *     and the floor inside is still floor. A filled pen also lies to the clutter
 *     score, claiming ~9sqft of the room as solid object.
 *   - **Not dashed.** Dashed means overhead or hidden — i.e. "step over this".
 *     A pen is the one thing in the room whose entire job is that you cannot.
 *   - **Not one line.** A single rect reads as a rug. Posts at the panel joints
 *     are what say "fence", and they are how you count panels at a glance.
 *
 * The gate is a gap in the near side plus its swing arc, same as any door: it is
 * the only part of the boundary you can actually pass, and where it opens
 * decides where the pen can go.
 * @param {Box} b
 * @returns {Symbol}
 */
function petPen({ x, y, w, h }) {
  const post = Math.min(w, h) * 0.045
  const bx = x + post
  const by = y + post
  const bw = w - post * 2
  const bh = h - post * 2
  const gate = Math.min(bw * 0.44, bh * 0.9)
  const gx = bx + (bw - gate) / 2
  const near = by + bh
  // Enclosure with the gate cut out of the near side, drawn as one open path so
  // the gap is a real opening rather than a line painted over.
  const ring = bPath(
    [
      `M${r(gx)} ${r(near)}`,
      `L${r(bx)} ${r(near)}`,
      `L${r(bx)} ${r(by)}`,
      `L${r(bx + bw)} ${r(by)}`,
      `L${r(bx + bw)} ${r(near)}`,
      `L${r(gx + gate)} ${r(near)}`,
    ].join(' '),
  )
  const posts = []
  // Posts at the corners, plus one mid-run per side long enough to need it —
  // a 165in pen is six panels, and evenly spaced posts read as panel joints.
  for (const px of [bx, bx + bw]) {
    posts.push(bCircle(px, by, post), bCircle(px, near, post), bCircle(px, by + bh / 2, post))
  }
  posts.push(bCircle(bx + bw / 2, by, post))
  return {
    body: [hollow(ring), ...posts].join(''),
    // Gate leaf + swing, drawn like a door: it opens outward, away from the pen.
    detail: [
      line(gx, near, gx, near + gate * 0.72),
      path(
        `M${r(gx)} ${r(near + gate * 0.72)} A${r(gate * 0.72)} ${r(gate * 0.72)} 0 0 0 ${r(gx + gate * 0.72)} ${r(near)}`,
      ),
    ].join(''),
  }
}

/**
 * Pet crate — a wire/wood crate with barred sides and a door on the front.
 *
 * **Solid, not hollow — and that is the whole reason it exists separately from
 * `petPen`.** A pen is panels standing around a patch of *your* floor, so it is
 * hollow. A crate is a container with its own tray: you look down at the crate's
 * floor, not the room's, and it sits on the floor the way a cabinet does. Drawing
 * it hollow would claim the room's floor runs through it and lie to the clutter
 * score — the exact line `hollow`'s doc warns never to cross for "a cage".
 *
 * What makes it read as a crate rather than a plain box is the barring: vertical
 * stiles and horizontal rails across the top (denser than a shelf), plus the door
 * framed on the near (+y) side with its latch — the one edge you actually open.
 * @param {Box} b
 * @returns {Symbol}
 */
function petCrate({ x, y, w, h }) {
  const cols = Math.min(9, Math.max(3, Math.round((w / Math.max(h, 1)) * 3)))
  const rows = Math.min(5, Math.max(2, Math.round((h / Math.max(w, 1)) * 3)))
  const bars = []
  for (let i = 1; i < cols; i++) bars.push(line(x + (w / cols) * i, y, x + (w / cols) * i, y + h))
  for (let j = 1; j < rows; j++) bars.push(line(x, y + (h / rows) * j, x + w, y + (h / rows) * j))
  // Door on the front (+y): a framed panel with a latch, so the crate reads as
  // something you open rather than a solid mesh block.
  const dw = w * 0.46
  const dh = h * 0.34
  const dx = x + (w - dw) / 2
  const dy = y + h - dh - h * 0.06
  const door = [
    rect(dx, dy, dw, dh, Math.min(dw, dh) * 0.12),
    circle(dx + dw - Math.min(dw, dh) * 0.18, dy + dh / 2, Math.min(w, h) * 0.05),
  ]
  return { body: bRect(x, y, w, h, soft(w, h, 0.08)), detail: [...bars, ...door].join('') }
}

/**
 * Bird cage — round cage seen from above: solid disc with bars radiating from a
 * central hanging hub to the rim, ringed once inside.
 *
 * Solid for the same reason as `petCrate`: the cage has its own base, so what is
 * under it is the cage's tray, not room floor. Round because that is a bird
 * cage's plan — a filled circle with a radial grid says "cage" where a barred
 * rectangle would just read as another crate.
 * @param {Box} b
 * @returns {Symbol}
 */
function birdCage({ x, y, w, h }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = Math.min(w, h) / 2
  const bars = 12
  const spokes = []
  for (let i = 0; i < bars; i++) {
    const a = (i * 2 * Math.PI) / bars
    spokes.push(
      line(cx + Math.cos(a) * rad * 0.2, cy + Math.sin(a) * rad * 0.2, cx + Math.cos(a) * rad * 0.94, cy + Math.sin(a) * rad * 0.94),
    )
  }
  return {
    body: bCircle(cx, cy, rad * 0.98),
    // Inner ring reads as the mid-height band; the hub is the hanging point.
    detail: [circle(cx, cy, rad * 0.6), ...spokes, circle(cx, cy, rad * 0.12)].join(''),
  }
}

/**
 * Flat-panel TV — a thin wide screen on a pedestal, seen from above.
 *
 * The point is that it is **not a cabinet**. `tv` used to borrow the cabinet
 * glyph, which drew this as a deep filled box with a drawer face — i.e. storage.
 * A television in plan is the opposite: a thin panel that faces down (+y) with
 * its glass on the front edge, standing on a small pedestal foot whose depth is
 * most of the footprint. The panel across the back, the pedestal at the front,
 * and the neck between them are what read as "a screen on a stand" rather than a
 * cupboard.
 * @param {Box} b
 * @returns {Symbol}
 */
function screen({ x, y, w, h }) {
  const panelY = y + h * 0.08
  const panelH = h * 0.3
  const baseW = w * 0.26
  const baseH = h * 0.22
  const baseX = x + (w - baseW) / 2
  const baseY = y + h - baseH
  const inset = Math.min(w, panelH) * 0.14
  return {
    body: [
      bRect(x, panelY, w, panelH, panelH * 0.18),
      bRect(baseX, baseY, baseW, baseH, baseH * 0.3),
    ].join(''),
    detail: [
      // Glass on the front (+y) face of the panel.
      rect(x + inset, panelY + inset, w - inset * 2, panelH - inset * 2, 1),
      // Neck: pedestal foot up to the panel, so the two read as one stand.
      line(x + w / 2, panelY + panelH, x + w / 2, baseY),
    ].join(''),
  }
}

/**
 * Onyx and Sard — the two shibas, drawn by hand and reproduced as-is.
 *
 * They live in the furniture catalogue because they belong in the plan: they take
 * up floor, they move, and a drawing of this home without them in it is a drawing
 * of somewhere else.
 *
 * These two are the **only artwork** here; every other builder is a procedural
 * glyph. That is why they bypass the tint pipeline and the `furn-body` classes
 * entirely — they carry their own colours. See shiba-art.js for the whole story.
 *
 * Everything hangs in `body` so nothing gets dropped at small sizes: the detail
 * cut-off exists to stop strokes turning to mud, and this artwork has no strokes
 * to mud up — it just gets smaller.
 * @param {Box} b
 * @returns {Symbol}
 */
function shibaOnyx(b) {
  return { body: shibaArt('onyx', b), detail: '' }
}

/** @param {Box} b @returns {Symbol} */
function shibaSard(b) {
  return { body: shibaArt('sard', b), detail: '' }
}

/** @type {Record<string, (b: Box) => Symbol>} */
const BUILDERS = {
  shibaOnyx,
  shibaSard,
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
  utilityCart,
  cubeShelf,
  mirror,
  rug,
  mat,
  floorLamp,
  studioLight,
  bathScale,
  ceilingFan,
  purifier,
  trash,
  basket,
  coatRack,
  scooter,
  tubShower,
  petPen,
  petCrate,
  birdCage,
  screen,
}

/** Nothing to draw — the caller falls back to its plain rect. */
const EMPTY = { body: '', detail: '' }

/**
 * Silhouette + interior detail for a placement.
 *
 * Returns `{ body: '', detail: '' }` when the symbol is unknown or the footprint
 * is too small to draw — in both cases the caller draws its plain rect, which is
 * the honest thing to show when we cannot say more.
 *
 * @param {string | undefined} symbol
 * @param {Box} box
 * @returns {Symbol}
 */
export function furnitureSymbol(symbol, box) {
  if (!symbol) return EMPTY
  const build = BUILDERS[symbol]
  if (!build) return EMPTY
  const min = Math.min(box.w, box.h)
  if (min < BODY_MIN_PX) return EMPTY
  const sym = build(box)
  if (min < DETAIL_MIN_PX) return { body: sym.body, detail: '' }
  return sym
}
