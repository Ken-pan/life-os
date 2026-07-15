import assert from 'node:assert/strict'
import {
  WINDOW_STYLE_ORDER,
  cycleWindowStyleOpening,
  defaultWindowSpanIn,
  nextWindowStyle,
  windowStyleLabel,
} from '../src/lib/spatial/window-styles.js'
import {
  createOpeningAtPoint,
  deriveWallsAndOpenings,
  flipGraphOpeningSwing,
  toggleGraphOpeningType,
} from '../src/lib/spatial/graph-openings.js'
import {
  createPlacement,
  isStorable,
  PLACEMENT_KINDS,
  placementKindsByGroup,
  placementSpec,
  pxToInches,
} from '../src/lib/spatial/placements.js'
import { furnitureSymbol } from '../src/lib/spatial/furniture-symbols.js'
import { hydrateProject } from '../src/lib/spatial/model.js'
import { renderFloorPlanSvg } from '../src/lib/spatial/render-svg.js'
import { SAMPLE_508 } from '../src/lib/spatial/sample-508.js'

assert.equal(WINDOW_STYLE_ORDER.length, 4)
assert.equal(windowStyleLabel('casement'), '平开')
assert.equal(windowStyleLabel(undefined), '固定')
assert.equal(defaultWindowSpanIn('sliding'), 60)

let style = 'fixed'
for (let i = 0; i < WINDOW_STYLE_ORDER.length; i++) style = nextWindowStyle(style)
assert.equal(style, 'fixed', 'cycle returns to start')

const cycled = cycleWindowStyleOpening({
  id: 'go-w1',
  edgeId: 'e1',
  offsetIn: 12,
  spanIn: 48,
  type: 'window',
  style: 'fixed',
})
assert.equal(cycled.style, 'sliding')
assert.equal(cycled.spanIn, 60)

// Doors must not be touched by the window cycler, and vice versa.
const door = { id: 'go-d1', edgeId: 'e1', offsetIn: 0, spanIn: 32, type: 'door', style: 'swing' }
assert.deepEqual(cycleWindowStyleOpening(door), door)

// Toggling door -> window keeps 'sliding' (shared style) but never leaks a
// door-only style like 'swing' onto a window.
const toWindow = toggleGraphOpeningType(door)
assert.equal(toWindow.type, 'window')
assert.equal(toWindow.style, 'fixed')
const slidingDoor = { ...door, style: 'sliding' }
assert.equal(toggleGraphOpeningType(slidingDoor).style, 'sliding')
const backToDoor = toggleGraphOpeningType(toWindow)
assert.equal(backToDoor.type, 'door')
assert.equal(backToDoor.style, 'swing')

// Only casement windows flip.
assert.equal(flipGraphOpeningSwing({ ...toWindow, swing: 'out' }).swing, 'out')
assert.equal(
  flipGraphOpeningSwing({ ...toWindow, style: 'casement', swing: 'out' }).swing,
  'in',
)

// A window on a vertical wall must not be drawn with a horizontal wall's
// geometry — the two symbols have to differ.
const graph = {
  pxPerFt: 36,
  margin: { x: 0, y: 0 },
  vertices: [
    { id: 'v1', x: 0, y: 0 },
    { id: 'v2', x: 360, y: 0 },
    { id: 'v3', x: 0, y: 360 },
  ],
  edges: [
    { id: 'eH', a: 'v1', b: 'v2', exterior: true },
    { id: 'eV', a: 'v1', b: 'v3', exterior: true },
  ],
}

for (const s of WINDOW_STYLE_ORDER) {
  const h = createOpeningAtPoint(graph, 'eH', { x: 180, y: 0 }, 'window', s)
  const v = createOpeningAtPoint(graph, 'eV', { x: 0, y: 180 }, 'window', s)
  const { openings } = deriveWallsAndOpenings(graph, [h, v])
  const wins = openings.filter((o) => o.type === 'window')
  assert.equal(wins.length, 2, `${s}: expected both windows`)
  for (const w of wins) {
    assert.ok(w.pathD && w.pathD.length > 8, `${s}: missing path`)
    assert.ok(!/NaN|undefined/.test(w.pathD), `${s}: bad path ${w.pathD}`)
    assert.equal(w.windowStyle, s)
  }
  assert.notEqual(
    wins[0].pathD,
    wins[1].pathD,
    `${s}: horizontal and vertical windows drew the same path`,
  )
}

// Exterior walls must survive as exterior so they render at full thickness.
const { walls } = deriveWallsAndOpenings(graph, [])
assert.ok(walls.length > 0)
assert.ok(walls.every((w) => w.role === 'exterior'))

/**
 * Coordinates a path actually draws. `A` carries rx/ry/rotation/flags before
 * its endpoint, so a naive number-pair scan would read those as coordinates.
 * @param {string} d
 */
function pathPoints(d) {
  const pts = []
  const cmd = /([MLA])\s*([-\d.\s]+)/g
  let m
  while ((m = cmd.exec(d))) {
    const n = m[2].trim().split(/\s+/).map(Number)
    if (m[1] === 'A') pts.push({ x: n[5], y: n[6] })
    else for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] })
  }
  return pts
}

// Walls are free-angle by default (Shift is only an ortho snap), so a window
// must sit on the wall at any angle — not snap to an axis-aligned box.
const diagGraph = {
  pxPerFt: 36,
  margin: { x: 0, y: 0 },
  vertices: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 400, y: 400 },
  ],
  edges: [{ id: 'diag', a: 'a', b: 'b', exterior: true }],
}
for (const s of WINDOW_STYLE_ORDER) {
  const go = createOpeningAtPoint(diagGraph, 'diag', { x: 200, y: 200 }, 'window', s)
  const { openings } = deriveWallsAndOpenings(diagGraph, [go])
  const win = openings.find((o) => o.type === 'window')
  const pts = pathPoints(win.pathD)
  // Every drawn point must be within half a wall thickness (plus the casement
  // arc's reach) of the 45° wall line x - y = 0. distance = |x-y| / sqrt(2).
  const reach = s === 'casement' ? 18 * 1.3 + 9 : 9 + 0.5
  for (const p of pts) {
    const dist = Math.abs(p.x - p.y) / Math.SQRT2
    assert.ok(
      dist <= reach,
      `${s}: point (${p.x},${p.y}) is ${dist.toFixed(1)}px off the 45° wall (max ${reach})`,
    )
  }
  // A window that ignored the wall angle would be axis-aligned: every point
  // sharing one of two y values. Assert the symbol actually runs diagonally.
  const ys = new Set(pts.map((p) => Math.round(p.y)))
  assert.ok(ys.size > 4, `${s}: window looks axis-aligned on a diagonal wall`)
}

// Every catalogue entry resolves to a real symbol builder and every group is
// reachable from the UI helper.
// Onyx and Sard are hand-drawn artwork, not procedural glyphs: they carry their
// own palette and deliberately opt out of the tint pipeline. Every rule below
// that says "inherit your colour" is written for glyphs, so name the exception
// here rather than let it pass by accident — their paths have no `furn-body`
// class, so the inheritance assertion simply never matches them and would look
// upheld while saying nothing. Their real invariants are asserted further down.
const ART_KINDS = new Set(['dog_onyx', 'dog_sard'])

const boxed = { x: 0, y: 0, w: 80, h: 60 }
for (const [kind, spec] of Object.entries(PLACEMENT_KINDS)) {
  assert.ok(spec.w > 0 && spec.h > 0, `${kind}: bad size`)
  const { body, detail } = furnitureSymbol(spec.symbol, boxed)
  assert.ok(
    body.length + detail.length > 0,
    `${kind}: symbol '${spec.symbol}' produced nothing`,
  )
  assert.ok(!/NaN|undefined/.test(body + detail), `${kind}: bad symbol markup`)
  if (ART_KINDS.has(kind)) continue
  // The body inherits fill/stroke from the caller's <g> — that inheritance is
  // what carries the scanned colour and the selected state onto the silhouette.
  // A body that hard-codes either would go colour-blind and stop highlighting.
  assert.ok(
    !/<(rect|path|circle|ellipse)[^>]*class="furn-body"[^>]*\s(fill|stroke)=/.test(body),
    `${kind}: body pins its own fill/stroke instead of inheriting`,
  )
  assert.ok(
    !/fill="#/.test(body),
    `${kind}: only the hand-drawn dogs may hard-code colours — everything else is tinted`,
  )
}
assert.equal(
  placementKindsByGroup().flat().length,
  Object.keys(PLACEMENT_KINDS).length,
  'every kind belongs to a listed group',
)

// Physical properties. `tall` is required — a piece with no height cannot be
// reasoned about at all — and the rest must be internally consistent.
const MOUNTS = ['floor', 'wall', 'ceiling', 'counter']
for (const kind of Object.keys(PLACEMENT_KINDS)) {
  const s = placementSpec(kind)
  assert.ok(s.tall > 0, `${kind}: needs a real height`)
  assert.ok(MOUNTS.includes(s.mount), `${kind}: unknown mount '${s.mount}'`)
  assert.ok(s.elev >= 0, `${kind}: elevation below the floor`)
  assert.ok(s.clearance >= 0, `${kind}: negative clearance`)
  // Only floor-borne things start at the floor; anything held up by a wall,
  // the ceiling or a counter must say how high, or it is silently an
  // obstruction at ankle level.
  if (s.mount === 'floor') assert.equal(s.elev, 0, `${kind}: floor piece is elevated`)
  else assert.ok(s.elev > 0, `${kind}: '${s.mount}' piece sits at elevation 0`)
}

// Defaults come from placementSpec, not the raw record.
assert.equal(PLACEMENT_KINDS.sofa.mount, undefined, 'catalogue omits the boring default')
assert.equal(placementSpec('sofa').mount, 'floor', 'placementSpec fills it in')
assert.equal(placementSpec('sofa').storable, false)
assert.equal(placementSpec('nope'), null)

// Storage may only be assigned to things that actually hold things.
assert.ok(isStorable('cabinet') && isStorable('wall_cabinet') && isStorable('fridge'))
assert.ok(!isStorable('ceiling_fan'), 'a fan is not a storage zone')
assert.ok(!isStorable('rug') && !isStorable('yoga_mat') && !isStorable('scooter'))
assert.ok(!isStorable('trash'), 'a bin holds what is leaving, not what is kept')

// The upper cabinet / base cabinet stack is the case these properties exist
// for: same plan footprint, no collision, because they live at different heights.
const upper = placementSpec('wall_cabinet')
const base = placementSpec('base_cabinet')
assert.ok(upper.elev >= base.elev + base.tall, 'upper cabinet must clear the counter below it')
assert.equal(upper.mount, 'wall')
assert.equal(base.mount, 'floor')

// IRC R307.1 minimums — these are code, so lock them.
assert.equal(placementSpec('toilet').clearance, 21)
assert.equal(placementSpec('sink').clearance, 21)
assert.equal(placementSpec('tub').clearance, 24)
assert.equal(placementSpec('shower').clearance, 24)
// A ceiling fan's blades must clear 7ft.
assert.ok(placementSpec('ceiling_fan').elev >= 84)

// Tiny footprints drop the detail rather than drawing mud, but keep the
// silhouette: a shape stays legible well after its interior stops being.
const small = furnitureSymbol('bed', { x: 0, y: 0, w: 10, h: 10 })
assert.equal(small.detail, '', 'detail must drop out below the legibility floor')
assert.ok(small.body.length > 0, 'the silhouette should survive a small footprint')
// Below the body floor there is nothing honest left to draw.
assert.deepEqual(furnitureSymbol('bed', { x: 0, y: 0, w: 6, h: 6 }), { body: '', detail: '' })
assert.deepEqual(furnitureSymbol('nope', boxed), { body: '', detail: '' })
assert.deepEqual(furnitureSymbol(undefined, boxed), { body: '', detail: '' })

// Seating is why this module owns its outline: a chair whose body is the bare
// footprint is the box-with-a-line this rewrite existed to kill. Assert the
// silhouette is built from more than one piece (backrest + seat).
for (const seat of ['chair', 'officeChair', 'sofa', 'loveseat', 'armchair']) {
  const { body } = furnitureSymbol(seat, boxed)
  const shapes = body.match(/class="furn-body/g) ?? []
  assert.ok(shapes.length >= 2, `${seat}: silhouette is a single shape — reads as a box`)
}

// Hollow pieces must render hollow.
//
// This assertion used to be `body === ''`, which asserted the builder's *intent*
// and passed while every one of these drew as a solid slab: an empty body makes
// the caller fall back to a plain filled rect. Assert the marker that actually
// reaches the DOM instead, and prove the renderer honours it below.
for (const soft of ['rug', 'mat', 'petPen', 'rod']) {
  const { body } = furnitureSymbol(soft, boxed)
  assert.ok(body.length > 0, `${soft}: empty body falls back to a filled rect — the opposite`)
  assert.ok(body.includes('furn-body-hollow'), `${soft}: must be hollow, floor shows through`)
}

// A pet pen sits below the ~5ft cut plane and you cannot walk through it, so its
// enclosure is a SOLID outline. Dashed would say overhead-or-hidden — "step over
// me" — which is the one thing a pen is not.
{
  const { body } = furnitureSymbol('petPen', boxed)
  assert.ok(!/stroke-dasharray/.test(body), 'pet pen enclosure must not be dashed')
  assert.ok(body.includes('<circle'), 'pet pen needs posts — a bare rect reads as a rug')
}

// Hollow is for barriers around floor, NOT for anything cage-shaped. A crate or
// a bird cage is a container with its own base: it occupies the floor exactly
// like a cabinet, and drawing it hollow would claim the room's floor runs
// through it. The 54in wooden dog crate in this house is catalogued as
// `cabinet` — keep every one of these solid.
for (const container of ['cabinet', 'wardrobe', 'wireRack', 'cubeShelf', 'basket', 'shelf']) {
  const { body } = furnitureSymbol(container, boxed)
  assert.ok(
    !body.includes('furn-body-hollow'),
    `${container}: containers are solid — only a barrier around real floor is hollow`,
  )
}

// End-to-end: the hollow marker has to survive into the rendered plan, and the
// stylesheet has to actually unfill it. Either half alone is worthless.
{
  const project = hydrateProject({
    ...SAMPLE_508,
    placements: [
      { id: 'p1', kind: 'pet_pen', label: '宠物围栏', x: 200, y: 200, w: 108, h: 108, rotation: 0 },
    ],
  })
  const svg = renderFloorPlanSvg(project)
  const style = svg.slice(svg.indexOf('<style>'), svg.indexOf('</style>'))
  assert.ok(svg.includes('furn-body-hollow'), 'the pen lost its hollow marker on the way out')
  assert.ok(style.includes('.furn-body-hollow{fill:none}'), 'nothing actually unfills a hollow body')
}

// The emitted stylesheet must survive the HTML parser.
//
// This style element sits inside the SVG, which is foreign content: style is not
// a raw-text element there, so the first thing resembling a tag is parsed as an
// element and **every rule after it is silently dropped**. A tag name written
// inside a CSS comment once cost .placement-on and .placement-clash — furniture
// still drew, so nothing looked broken; selection and the clash warning were just
// quietly dead. Assert the sheet is free of angle brackets and that the states
// that would vanish first are still in it.
{
  const svg = renderFloorPlanSvg(hydrateProject(SAMPLE_508), { interactive: true })
  const style = svg.slice(svg.indexOf('<style>') + 7, svg.indexOf('</style>'))
  const stray = style.match(/[<>]/)
  assert.equal(
    stray,
    null,
    `stylesheet contains '${stray?.[0]}' — every rule after it is dropped by the parser`,
  )
  for (const rule of ['.placement-item', '.placement-on', '.placement-clash', '.furn-body', '.furn-line']) {
    assert.ok(style.includes(`${rule}{`), `stylesheet lost ${rule}`)
  }
  // Order is load-bearing: the tint feeds .placement-item through custom
  // properties, so the states must come later to override it by cascade.
  assert.ok(
    style.indexOf('.placement-on{') > style.indexOf('.placement-item{'),
    'selected state must come after .placement-item or the tint outranks it',
  )
  assert.ok(
    style.indexOf('.placement-clash{') > style.indexOf('.placement-item{'),
    'clash state must come after .placement-item or the tint outranks it',
  )
}

// —— Onyx 和 Sard:唯一的成品画,规矩和别的符号相反 ——
{
  for (const [kind, which] of [
    ['dog_onyx', 'shibaOnyx'],
    ['dog_sard', 'shibaSard'],
  ]) {
    const { body } = furnitureSymbol(which, boxed)
    // 自带多色:元素上的 fill 会盖过从 .placement-item 继承的染色,这是故意的。
    assert.ok(/fill="#[0-9A-Fa-f]{6}"/.test(body), `${kind}: 画丢了自己的颜色`)
    // 不描边:不挡住继承来的 stroke,每条 path 都会被描一圈,画就糊了。
    assert.ok(body.includes('stroke="none"'), `${kind}: 没挡住继承的描边,画会被描糊`)
    assert.ok(!body.includes('furn-body'), `${kind}: 画不该走 furn-body 那套染色`)
  }

  // 等比是硬要求:非等比会把狗压扁。给一个极端长条的框,scale 必须仍是单值。
  const squished = furnitureSymbol('shibaOnyx', { x: 0, y: 0, w: 400, h: 40 }).body
  const m = squished.match(/scale\(([-\d.]+)\)/)
  assert.ok(m, '画必须走单一 scale —— scale(sx, sy) 就是在压狗')
  // 压扁的框里,狗按高度缩,并在宽度上居中,而不是被抻宽。
  // 容差 1e-5:系数按 5dp 输出(2dp 会把小尺寸的狗舍没,见 shiba-art.js 的 rs)。
  const s = Number(m[1])
  assert.ok(Math.abs(s - 40 / 480) < 1e-5, `等比缩放算错了:${s}`)
  // 缩略图尺寸下狗不能被舍成 0 —— 那就是凭空消失。
  const tiny = furnitureSymbol('shibaOnyx', { x: 0, y: 0, w: 3, h: 3 }).body
  if (tiny) assert.ok(Number(tiny.match(/scale\(([-\d.]+)\)/)[1]) > 0, '小尺寸把狗缩没了')
  const t = squished.match(/translate\(([-\d.]+) ([-\d.]+)\)/)
  assert.ok(Number(t[1]) > 0, '窄边方向该留白居中,不该顶格')

  // 两只必须真的不一样 —— 一黑一金就是它们的身份。
  const onyx = furnitureSymbol('shibaOnyx', boxed).body
  const sard = furnitureSymbol('shibaSard', boxed).body
  assert.notEqual(onyx, sard, 'Onyx 和 Sard 画成了同一只')
  assert.ok(sard.includes('#FBA455'), 'Sard 的金色没了')
  assert.ok(onyx.includes('#473F38'), 'Onyx 的黑色没了')

  // 画要能一路活到平面图里,并且带着自己的颜色。
  const project = hydrateProject({
    ...SAMPLE_508,
    placements: [
      { id: 'd1', kind: 'dog_onyx', label: 'Onyx', x: 300, y: 300, w: 66, h: 66, rotation: 0 },
      { id: 'd2', kind: 'dog_sard', label: 'Sard', x: 400, y: 300, w: 66, h: 66, rotation: 90 },
    ],
  })
  const svg = renderFloorPlanSvg(project)
  assert.ok(svg.includes('#FBA455') && svg.includes('#473F38'), '两只狗的颜色没进平面图')
}

// createPlacement converts catalogue inches into plan px.
const zones = []
const placed = createPlacement('bed', 500, 500, zones, [], 36)
assert.equal(placed.w, 180, 'a 60″ queen is 180px at 36px/ft')
assert.equal(placed.h, 240)
assert.equal(placed.x, 410, 'placement stays centred on the drop point')
assert.equal(pxToInches(placed.w, 36), 60)

// The v5 rescale must fire exactly once, keep the centre, and be a no-op on
// projects already migrated — hydrateProject runs on every edit.
const legacy = {
  schemaVersion: 4,
  meta: { id: 'm', nameZh: 'm' },
  viewport: { width: 800, height: 800 },
  rooms: [],
  walls: [],
  openings: [],
  furniture: [],
  storageZones: [],
  furnitureInventory: [],
  layoutMode: 'wallGraph',
  wallGraph: {
    pxPerFt: 36,
    margin: { x: 0, y: 0 },
    vertices: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 700, y: 0 },
    ],
    edges: [{ id: 'e', a: 'a', b: 'b', exterior: true }],
  },
  graphOpenings: [],
  zones: [],
  placements: [
    { id: 'pl-1', kind: 'bed', label: '床', x: 70, y: 100, w: 60, h: 80, rotation: 0 },
  ],
}
const once = hydrateProject(legacy)
const m = once.placements[0]
assert.equal(m.w, 180, 'legacy 60px bed rescales to 180px (60 real inches)')
assert.equal(m.h, 240)
assert.equal(m.x + m.w / 2, 100, 'centre x preserved')
assert.equal(m.y + m.h / 2, 140, 'centre y preserved')
assert.equal(once.schemaVersion, 5, 'rehydrate stamps the new version')

const twice = hydrateProject(once)
assert.equal(twice.placements[0].w, 180, 'rescale must not compound on re-hydrate')
assert.equal(twice.placements[0].x, m.x)

console.log('window-styles-unit: ok')
