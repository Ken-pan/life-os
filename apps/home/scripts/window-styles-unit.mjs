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
const boxed = { x: 0, y: 0, w: 80, h: 60 }
for (const [kind, spec] of Object.entries(PLACEMENT_KINDS)) {
  assert.ok(spec.w > 0 && spec.h > 0, `${kind}: bad size`)
  const svg = furnitureSymbol(spec.symbol, boxed)
  assert.ok(svg.length > 0, `${kind}: symbol '${spec.symbol}' produced nothing`)
  assert.ok(!/NaN|undefined/.test(svg), `${kind}: bad symbol markup`)
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

// Tiny footprints drop the detail rather than drawing mud.
assert.equal(furnitureSymbol('bed', { x: 0, y: 0, w: 10, h: 10 }), '')
assert.equal(furnitureSymbol('nope', boxed), '')

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
