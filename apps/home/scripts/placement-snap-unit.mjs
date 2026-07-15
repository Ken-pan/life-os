import assert from 'node:assert/strict'
import { resolvePlacementSnap } from '../src/lib/spatial/placement-snap.js'
import { clampPlacementRect } from '../src/lib/spatial/placements.js'
import { wallStrokePx } from '../src/lib/spatial/wall-standards.js'
import { hydrateProject } from '../src/lib/spatial/model.js'

const pxPerFt = 36
const IN = (n) => (n / 12) * pxPerFt
const thicknessFor = (w) => wallStrokePx(w.role ?? 'interior', pxPerFt)
const snap = (rect, walls, others = [], zoom = 1) =>
  resolvePlacementSnap(rect, walls, others, { pxPerFt, zoom, thicknessFor })

// A room: exterior wall along y=100 (horizontal) and x=100 (vertical).
const extHalf = wallStrokePx('exterior', pxPerFt) / 2 // 6" wall -> 9px
const walls = [
  {
    id: 'top',
    kind: 'wall',
    role: 'exterior',
    from: { x: 100, y: 100 },
    to: { x: 700, y: 100 },
  },
  {
    id: 'left',
    kind: 'wall',
    role: 'exterior',
    from: { x: 100, y: 100 },
    to: { x: 100, y: 700 },
  },
]

// A bed nudged near the top wall snaps flush to the wall's inner FACE, not its
// centreline — the wall is stroked at real thickness.
{
  const bed = { x: 300, y: 100 + extHalf + 4, w: IN(60), h: IN(80) }
  const r = snap(bed, walls)
  assert.equal(r.snappedY, true, 'should catch the top wall')
  assert.equal(r.y, 100 + extHalf, 'top edge lands on the wall face')
  assert.ok(r.guides.some((g) => g.source === 'wall' && g.kind === 'horizontal'))
}

// Same for a vertical wall, on the x axis.
{
  const bed = { x: 100 + extHalf - 5, y: 300, w: IN(60), h: IN(80) }
  const r = snap(bed, walls)
  assert.equal(r.snappedX, true)
  assert.equal(r.x, 100 + extHalf, 'left edge lands on the wall face')
}

// The far edge snaps too: a piece approaching the wall from the other side
// lands with its *bottom* on the wall's other face.
{
  const piece = { x: 300, y: 100 - extHalf - IN(20) - 3, w: IN(30), h: IN(20) }
  const r = snap(piece, walls)
  assert.equal(r.snappedY, true)
  assert.equal(r.y + piece.h, 100 - extHalf, 'bottom edge on the wall face')
}

// Out of tolerance -> no snap, and the axis falls back to the 1" grid.
{
  const bed = { x: 300.4, y: 400.4, w: IN(60), h: IN(80) }
  const r = snap(bed, walls)
  assert.equal(r.snappedX, false)
  assert.equal(r.snappedY, false)
  const step = pxPerFt / 12
  assert.equal(r.x % step, 0, 'unsnapped axis falls back to the 1" grid')
  assert.equal(r.y % step, 0)
  assert.equal(r.guides.length, 0, 'grid fallback draws no guide')
}

// A snapped axis must NOT be re-gridded. An interior wall is 4.5" -> 14px
// stroked, so its face sits 7px off the centreline; against a centreline at 201
// that puts the face at 208, which is not a multiple of the 3px (1") grid.
// Re-gridding would drag the piece back off the wall it just landed on.
{
  const cy = 201
  const intWalls = [
    {
      id: 'i',
      kind: 'wall',
      role: 'interior',
      from: { x: 100, y: cy },
      to: { x: 700, y: cy },
    },
  ]
  const half = wallStrokePx('interior', pxPerFt) / 2
  const face = cy + half
  const step = pxPerFt / 12
  assert.ok(face % step !== 0, 'precondition: this face is genuinely off-grid')

  const piece = { x: 300, y: face + 3, w: IN(30), h: IN(30) }
  const r = snap(piece, intWalls)
  assert.equal(r.snappedY, true)
  assert.equal(r.y, face, 'stays exactly on the interior wall face')
  assert.notEqual(
    Math.round(r.y / step) * step,
    r.y,
    'and a grid pass would have moved it — which is why we skip it',
  )
}

// Only walls the piece actually runs alongside count. A piece far past the end
// of the top wall must not snap to its infinite line.
{
  const away = { x: 900, y: 100 + extHalf + 3, w: IN(30), h: IN(30) }
  const r = snap(away, walls)
  assert.equal(r.snappedY, false, 'no overlap along the wall -> no snap')
}

// Diagonal walls are skipped rather than snapped to a wrong axis.
{
  const diag = [
    {
      id: 'd',
      kind: 'wall',
      role: 'interior',
      from: { x: 0, y: 0 },
      to: { x: 400, y: 400 },
    },
  ]
  const piece = { x: 200, y: 202, w: IN(30), h: IN(30) }
  const r = snap(piece, diag)
  assert.equal(r.snappedX, false)
  assert.equal(r.snappedY, false)
}

// Neighbour alignment: edge-flush beats nothing, and emits an 'edge' guide.
{
  const other = { x: 400, y: 400, w: IN(30), h: IN(30) }
  const piece = { x: 400 + 3, y: 600, w: IN(20), h: IN(20) }
  const r = snap(piece, [], [other])
  assert.equal(r.snappedX, true)
  assert.equal(r.x, 400, 'left edges line up')
  assert.ok(r.guides.some((g) => g.source === 'edge'))
}

// Walls outrank neighbours when both are in range.
{
  const other = { x: 306, y: 400, w: IN(30), h: IN(30) }
  const piece = { x: 100 + extHalf + 2, y: 300, w: IN(30), h: IN(30) }
  const r = snap(piece, walls, [other])
  assert.equal(r.x, 100 + extHalf, 'wall face wins over a neighbour edge')
  assert.ok(r.guides.some((g) => g.source === 'wall'))
}

// Tolerance is screen-space, so the plan-space reach scales with 1/zoom: the
// snap feels the same distance from the cursor at any zoom. Zoomed in, the same
// plan-space gap is a big on-screen gap and must NOT grab.
{
  const rect = { x: 300, y: 100 + extHalf + 7, w: IN(60), h: IN(80) }
  assert.equal(snap(rect, walls, [], 1).snappedY, true, '7px is in reach at 1x')
  assert.equal(
    snap(rect, walls, [], 4).snappedY,
    false,
    'zoomed 4x, 7 plan px is 28 screen px away — too far to grab',
  )
  assert.equal(
    snap({ ...rect, y: 100 + extHalf + 20 }, walls, [], 0.3).snappedY,
    true,
    'zoomed out, a 20 plan px gap is only 6 screen px — still grabs',
  )
}

// Centre alignment must be centre-to-centre only. A piece's *edge* landing on a
// neighbour's *centre* is not an alignment anyone means — it would read as the
// piece grabbing at random.
{
  const other = { x: 400, y: 400, w: IN(60), h: IN(60) }
  const otherCx = other.x + other.w / 2
  // Piece whose LEFT EDGE is 2px from the neighbour's centre line, and whose own
  // centre is far from anything.
  const piece = { x: otherCx - 2, y: 700, w: IN(20), h: IN(20) }
  const r = snap(piece, [], [other])
  assert.equal(
    r.snappedX,
    false,
    'edge-to-centre must not snap; only centre-to-centre counts',
  )
}

// ...and centre-to-centre does still snap.
{
  const other = { x: 400, y: 400, w: IN(60), h: IN(60) }
  const otherCx = other.x + other.w / 2
  const w = IN(20)
  const piece = { x: otherCx - w / 2 + 2, y: 700, w, h: IN(20) }
  const r = snap(piece, [], [other])
  assert.equal(r.snappedX, true)
  assert.equal(r.x + w / 2, otherCx, 'centres line up')
  assert.ok(r.guides.some((g) => g.source === 'center'))
}

// A piece dropped into a corner catches both walls at once.
{
  const piece = { x: 100 + extHalf + 3, y: 100 + extHalf + 3, w: IN(30), h: IN(30) }
  const r = snap(piece, walls)
  assert.equal(r.snappedX, true)
  assert.equal(r.snappedY, true)
  assert.equal(r.x, 100 + extHalf)
  assert.equal(r.y, 100 + extHalf)
  assert.equal(r.guides.length, 2, 'one guide per axis')
}

// Guides span the piece they belong to, so they read as "this edge lines up".
{
  const piece = { x: 300, y: 100 + extHalf + 3, w: IN(60), h: IN(40) }
  const r = snap(piece, walls)
  const g = r.guides.find((g) => g.kind === 'horizontal')
  assert.ok(g, 'horizontal guide for the top-wall snap')
  assert.equal(g.from.y, g.to.y, 'horizontal guide is level')
  assert.equal(g.pos, r.y, 'guide sits on the snapped edge')
  assert.ok(g.from.x < r.x && g.to.x > r.x + piece.w, 'guide overhangs the piece')
}

// Degenerate inputs must not produce NaN geometry.
{
  const zeroLen = [
    { id: 'z', kind: 'wall', role: 'interior', from: { x: 50, y: 50 }, to: { x: 50, y: 50 } },
  ]
  const r = snap({ x: 300, y: 300, w: IN(30), h: IN(30) }, zeroLen, [])
  assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), 'zero-length wall -> finite')

  const empty = snap({ x: 10.7, y: 20.3, w: 0, h: 0 }, [], [])
  assert.ok(Number.isFinite(empty.x) && Number.isFinite(empty.y), 'zero-size rect -> finite')
  assert.equal(empty.guides.length, 0)

  for (const g of snap({ x: 300, y: 100 + extHalf + 2, w: IN(30), h: IN(30) }, walls).guides) {
    for (const v of [g.from.x, g.from.y, g.to.x, g.to.y, g.pos]) {
      assert.ok(Number.isFinite(v), 'guide coords finite')
    }
  }
}

// Non-'wall' segments (gaps / thresholds mark openings) are not surfaces to
// push furniture against.
{
  const gapOnly = [
    { id: 'g', kind: 'gap', role: 'interior', from: { x: 100, y: 300 }, to: { x: 700, y: 300 } },
  ]
  const r = snap({ x: 300, y: 303, w: IN(30), h: IN(30) }, gapOnly)
  assert.equal(r.snappedY, false, 'a gap is a doorway, not a wall')
}

// --- clampPlacementRect -----------------------------------------------------
// A piece outside the viewBox is invisible AND unclickable (the hit rect is
// outside too), recoverable only by undo. Drag takes a pointer capture, so a
// release far outside the canvas still drops it there.
{
  const vp = { width: 900, height: 700 }
  const w = IN(76), h = IN(80)

  assert.deepEqual(clampPlacementRect(-500, -500, w, h, vp), { x: 0, y: 0 })
  assert.deepEqual(clampPlacementRect(5000, 5000, w, h, vp), {
    x: vp.width - w,
    y: vp.height - h,
  })
  // Inside stays untouched — clamping must not perturb ordinary positions.
  assert.deepEqual(clampPlacementRect(120, 130, w, h, vp), { x: 120, y: 130 })
  // Exactly flush to the far edge is inside, not clamped.
  assert.deepEqual(clampPlacementRect(vp.width - w, 0, w, h, vp), {
    x: vp.width - w,
    y: 0,
  })
  // A piece larger than the canvas pins to the origin rather than going NaN or
  // negative.
  const big = clampPlacementRect(50, 50, vp.width + 200, vp.height + 200, vp)
  assert.deepEqual(big, { x: 0, y: 0 })
}

// --- stray rescue on hydrate ------------------------------------------------
// Clamping the movement paths can't save a piece that is already fully off
// canvas: it's unclickable, so no movement path ever runs for it. hydrate has
// to bring it back — but must leave everything else exactly where it is.
{
  const graph = {
    pxPerFt,
    margin: { x: 0, y: 0 },
    vertices: [
      { id: 'a', x: 40, y: 40 },
      { id: 'b', x: 640, y: 40 },
      { id: 'c', x: 640, y: 640 },
      { id: 'd', x: 40, y: 640 },
    ],
    edges: [
      { id: 't', a: 'a', b: 'b', exterior: true },
      { id: 'r', a: 'b', b: 'c', exterior: true },
      { id: 'bo', a: 'c', b: 'd', exterior: true },
      { id: 'l', a: 'd', b: 'a', exterior: true },
    ],
  }
  const mk = (id, x, y) => ({
    id, kind: 'nightstand', label: 'n', rotation: 0,
    x, y, w: IN(22), h: IN(18),
  })
  const base = {
    schemaVersion: 5, meta: { id: 'r', nameZh: 'r' },
    viewport: { width: 0, height: 0 },
    rooms: [], walls: [], openings: [], furniture: [], storageZones: [],
    furnitureInventory: [], layoutMode: 'wallGraph', wallGraph: graph,
    graphOpenings: [], zones: [],
  }
  const inside = mk('ok', 200, 200)
  const lostRight = mk('lost-r', 99999, 200)
  const lostUp = mk('lost-u', 200, -99999)
  const hydrated = hydrateProject({
    ...base,
    placements: [inside, lostRight, lostUp],
  })
  const vp = hydrated.viewport
  const byId = Object.fromEntries(hydrated.placements.map((p) => [p.id, p]))

  assert.equal(byId.ok.x, 200, 'a piece on canvas is left alone')
  assert.equal(byId.ok.y, 200)
  for (const id of ['lost-r', 'lost-u']) {
    const p = byId[id]
    assert.ok(
      p.x >= 0 && p.y >= 0 && p.x + p.w <= vp.width && p.y + p.h <= vp.height,
      `${id}: rescued back onto the canvas`,
    )
  }
  // Idempotent — hydrate runs on every edit.
  const again = hydrateProject(hydrated)
  assert.deepEqual(
    again.placements.map((p) => [p.x, p.y]),
    hydrated.placements.map((p) => [p.x, p.y]),
    're-hydrating must not keep shifting things',
  )

  // A piece only *partly* off canvas is still grabbable, so it is the user's to
  // move — the rescue must not touch it.
  const partly = hydrateProject({ ...base, placements: [mk('partly', -10, 200)] })
  assert.equal(partly.placements[0].x, -10, 'partly-visible is left alone')
}

// ---- Alt 临时脱开吸附(free) ----
// 建墙工具早有这个手势;家具没有的话,同一张画布上两套规矩。
{
  const nearWall = { x: 100 + extHalf + 2, y: 300, w: IN(30), h: IN(20) }
  const snapped = snap(nearWall, walls)
  assert.ok(snapped.snappedX, '常规拖拽:贴住墙面')

  const free = resolvePlacementSnap(nearWall, walls, [], {
    pxPerFt,
    thicknessFor,
    free: true,
  })
  assert.equal(free.snappedX, false, 'Alt 按住:不贴墙')
  assert.equal(free.guides.length, 0, 'Alt 按住:不画对齐线')
  // 仍落在 1″ 网格:完全自由会留下分数英寸,之后每次微调都继承那个零头
  const step = pxPerFt / 12
  assert.equal(free.x % step, 0, 'Alt 按住仍吸 1″ 网格(x)')
  assert.equal(free.y % step, 0, 'Alt 按住仍吸 1″ 网格(y)')
}

// ---- 重叠检测:据实相告,不阻止 ----
{
  const { overlapsAny } = await import('../src/lib/spatial/placement-snap.js')
  const bed = { x: 200, y: 200, w: IN(60), h: IN(80) }
  assert.equal(overlapsAny(bed, []), false, '空房不撞')
  assert.equal(
    overlapsAny(bed, [{ x: 400, y: 400, w: IN(30), h: IN(30) }]),
    false,
    '离得远不撞',
  )
  assert.equal(
    overlapsAny(bed, [{ x: 220, y: 220, w: IN(30), h: IN(30) }]),
    true,
    '压在身上要报',
  )
  // 吸附落位常留 1px 级接缝,那不算撞 —— 否则贴边摆放会一直红着
  assert.equal(
    overlapsAny(bed, [{ x: 200 + IN(60) - 1, y: 200, w: IN(30), h: IN(30) }]),
    false,
    '紧挨着(1px 接缝)不算撞',
  )
  assert.equal(
    overlapsAny(bed, [{ x: 200 + IN(60), y: 200, w: IN(30), h: IN(30) }]),
    false,
    '正好贴边不算撞',
  )
}

console.log('placement-snap-unit: ok')
