/**
 * 墙相对锚点 —— 家具与最近墙面的空间关系(纯函数,无 IO,node 单测直接跑)。
 *
 * 为什么需要它:配准(scan-register.js)+ 身份匹配(scan-identity.js)已经能把
 * 「这次扫描的桌子」对回「上次的桌子」,但**中心点位移**分不清两件事:
 * 整包坐标一起漂(配准残差/包围盒抖动)和这一件真被挪了。墙不会动(结构已锁定),
 * 所以「离墙缝隙 + 沿墙距离」是免疫全局漂移的局部真值 —— 桌子离墙从 5cm 变成
 * 45cm,才敢说「真的被挪了 40cm」。
 *
 * 三个字段就是三件事:
 * - `gapIn`   离墙缝隙(垂直于墙,英寸)
 * - `alongIn` 沿墙距离(墙段 lo 端 → 家具近端,英寸)
 * - `rotation` 锚定时的朝向 —— 墙和家具都是轴对齐的,side × rotation 完全决定
 *   「背贴墙还是侧贴墙」,转过 90° 一比就知道
 *
 * 只有贴墙(≤30″)的轴才有锚 —— 屋子中间的茶几对哪面墙都没有摆放语义,
 * 硬记一个 6ft 的"墙距"只会让噪声看起来像证据。
 *
 * 由 hydrateProject 在墙图模式下自动维护(见 refreshWallAnchors 的幂等约定),
 * 不手工编辑;跨扫描比对用 diffWallAnchors。
 */

/** @typedef {import('./types.js').WallGraph} WallGraph */
/** @typedef {import('./types.js').WallAnchor} WallAnchor */
/** @typedef {import('./types.js').WallAnchorAxis} WallAnchorAxis */

/** 贴墙判定上限(30″)—— 与 scan-merge.js 的 ANCHOR_MAX_PX 同一语义 */
const ANCHOR_MAX_IN = 30
/** 墙段要正对家具:垂直向重叠 ≥ 家具对应边长的这个比例(同 scan-merge) */
const WALL_FACE_OVERLAP = 0.3
/** 扫描清洗会让家具与墙轻微穿模,容忍到 2″;更深说明找错墙了 */
const SINK_TOL_IN = -2

/** 比对阈值,与 scan-merge 的精修分级同源:≤5cm 当没挪,>10cm 才敢说挪了 */
const CM_PER_IN = 2.54
const UNCHANGED_IN = 5 / CM_PER_IN
const MOVED_IN = 10 / CM_PER_IN

const round1 = (v) => Math.round(v * 10) / 10

/**
 * 墙图 → 轴对齐墙段(带 edgeId,px 坐标)。
 * 与 scan-register.wallSegments 同构,多带一个 edgeId —— 锚点要能说出
 * 「贴的是哪面墙」,墙图边 id 在结构锁定后是稳定身份。
 * 斜墙(非轴对齐)与 scan-register 一样跳过:整个墙距体系都建立在轴对齐上。
 * @param {WallGraph | undefined | null} wallGraph
 * @returns {Array<{ edgeId: string, vertical: boolean, at: number, lo: number, hi: number }>}
 */
export function wallAnchorSegments(wallGraph) {
  const byId = Object.fromEntries((wallGraph?.vertices ?? []).map((v) => [v.id, v]))
  const out = []
  for (const e of wallGraph?.edges ?? []) {
    const a = byId[e.a]
    const b = byId[e.b]
    if (!a || !b) continue
    if (Math.abs(a.x - b.x) < 1.5) {
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      if (hi - lo > 1) out.push({ edgeId: e.id, vertical: true, at: a.x, lo, hi })
    } else if (Math.abs(a.y - b.y) < 1.5) {
      const lo = Math.min(a.x, b.x)
      const hi = Math.max(a.x, b.x)
      if (hi - lo > 1) out.push({ edgeId: e.id, vertical: false, at: a.y, lo, hi })
    }
  }
  return out
}

/**
 * 家具某一侧最近的正对墙段。找不到(或都在 30″ 外)返回 null。
 * @param {ReturnType<typeof wallAnchorSegments>} segs
 * @param {{x:number,y:number,w:number,h:number}} box px
 * @param {'left'|'right'|'up'|'down'} side
 * @param {number} inPerPx
 */
function nearestFacingWall(segs, box, side, inPerPx) {
  const horizontalSide = side === 'left' || side === 'right'
  const spanLo = horizontalSide ? box.y : box.x
  const spanHi = horizontalSide ? box.y + box.h : box.x + box.w
  const span = spanHi - spanLo
  let best = null
  for (const s of segs) {
    if (s.vertical !== horizontalSide) continue
    const overlap = Math.min(s.hi, spanHi) - Math.max(s.lo, spanLo)
    if (overlap < span * WALL_FACE_OVERLAP) continue
    let gapPx
    if (side === 'left') gapPx = box.x - s.at
    else if (side === 'right') gapPx = s.at - (box.x + box.w)
    else if (side === 'up') gapPx = box.y - s.at
    else gapPx = s.at - (box.y + box.h)
    const gapIn = gapPx * inPerPx
    if (gapIn < SINK_TOL_IN || gapIn > ANCHOR_MAX_IN) continue
    if (!best || gapIn < best.gapIn) {
      best = { seg: s, gapIn: Math.max(0, gapIn), alongIn: (spanLo - s.lo) * inPerPx }
    }
  }
  return best
}

/**
 * @param {ReturnType<typeof nearestFacingWall>} hit
 * @param {'left'|'right'|'up'|'down'} side
 * @returns {WallAnchorAxis}
 */
function axisRecord(hit, side) {
  return {
    edgeId: hit.seg.edgeId,
    side,
    gapIn: round1(hit.gapIn),
    alongIn: round1(hit.alongIn),
  }
}

/**
 * 算一件家具的墙锚。两侧都贴墙取更近的(窄空间里那一侧才是真锚点,
 * 同 scan-merge.anchorToWalls 的取舍)。两个轴都不贴墙 → null。
 *
 * 纯几何推导且逢存必舍入到 0.1″ —— 同一输入永远得到同一输出,
 * refreshWallAnchors 的幂等就建立在这上面。
 *
 * @param {{x:number,y:number,w:number,h:number}} box px 坐标
 * @param {0|90|180|270} rotation
 * @param {ReturnType<typeof wallAnchorSegments>} segs
 * @param {number} pxPerFt
 * @returns {WallAnchor | null}
 */
export function computeWallAnchor(box, rotation, segs, pxPerFt = 36) {
  if (!segs.length || !(box?.w > 0) || !(box?.h > 0)) return null
  const inPerPx = 12 / pxPerFt

  const gl = nearestFacingWall(segs, box, 'left', inPerPx)
  const gr = nearestFacingWall(segs, box, 'right', inPerPx)
  const x = gl && (!gr || gl.gapIn <= gr.gapIn) ? axisRecord(gl, 'left') : gr ? axisRecord(gr, 'right') : undefined

  const gu = nearestFacingWall(segs, box, 'up', inPerPx)
  const gd = nearestFacingWall(segs, box, 'down', inPerPx)
  const y = gu && (!gd || gu.gapIn <= gd.gapIn) ? axisRecord(gu, 'up') : gd ? axisRecord(gd, 'down') : undefined

  if (!x && !y) return null
  /** @type {WallAnchor} */
  const anchor = { rotation: /** @type {0|90|180|270} */ (((rotation ?? 0) % 360 + 360) % 360) }
  if (x) anchor.x = x
  if (y) anchor.y = y
  return anchor
}

/**
 * @typedef {object} WallAnchorDiff
 * @property {'unchanged'|'ambiguous'|'moved'|'unknown'} verdict
 *   unchanged — 墙距没变(≤5cm):中心位移多半是配准残差/包围盒抖动,不是真挪了
 *   ambiguous — 5–10cm,或某个轴失锚/换锚:证据不足以裁决,别硬下结论
 *   moved     — >10cm 或转了向:这件真的被挪过
 *   unknown   — 任一侧没有锚(没贴墙/没墙图),这套判断帮不上忙
 * @property {number | null} shiftIn 可量出的位移(英寸;unknown 时 null)
 * @property {boolean} turned 朝向变了(90° 档)
 */

/**
 * 比两份墙锚:上次确认的摆放关系 vs 这次量到的。
 *
 * 每个方向的位移优先取该轴的墙距差(垂直于墙,最准),该轴没锚时退到
 * 另一轴的沿墙距离差(同一面墙上滑动)。换了锚定墙/失锚的轴不硬凑数字,
 * 整体降级为 ambiguous —— 28″ 与 31″ 只差 3″,却会翻转「贴墙」判定,
 * 把它当成"挪走了"是在撒谎。
 *
 * @param {WallAnchor | null | undefined} prev
 * @param {WallAnchor | null | undefined} next
 * @returns {WallAnchorDiff}
 */
export function diffWallAnchors(prev, next) {
  if (!prev || !next) return { verdict: 'unknown', shiftIn: null, turned: false }

  const turned = (prev.rotation ?? 0) !== (next.rotation ?? 0)
  let ambiguous = false
  /** @type {number | null} */
  let dx = null
  /** @type {number | null} */
  let dy = null

  /** @param {'x'|'y'} axis */
  const gapDelta = (axis) => {
    const a = prev[axis]
    const b = next[axis]
    if (!a && !b) return null
    if (!a || !b || a.side !== b.side || a.edgeId !== b.edgeId) {
      ambiguous = true
      return null
    }
    return Math.abs(a.gapIn - b.gapIn)
  }
  /** @param {'x'|'y'} axis 沿这个轴的墙滑动 = 另一个方向的位移 */
  const alongDelta = (axis) => {
    const a = prev[axis]
    const b = next[axis]
    if (!a || !b || a.side !== b.side || a.edgeId !== b.edgeId) return null
    return Math.abs(a.alongIn - b.alongIn)
  }

  dx = gapDelta('x') ?? alongDelta('y')
  dy = gapDelta('y') ?? alongDelta('x')

  if (dx === null && dy === null) {
    return { verdict: ambiguous ? 'ambiguous' : 'unknown', shiftIn: null, turned }
  }
  const shiftIn = round1(Math.hypot(dx ?? 0, dy ?? 0))
  /** @type {WallAnchorDiff['verdict']} */
  let verdict
  if (turned || shiftIn > MOVED_IN) verdict = 'moved'
  else if (ambiguous || shiftIn > UNCHANGED_IN) verdict = 'ambiguous'
  else verdict = 'unchanged'
  return { verdict, shiftIn, turned }
}

/** 锚点相等 —— 数值已在 computeWallAnchor 里舍入,可以精确比 */
function anchorsEqual(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  if ((a.rotation ?? 0) !== (b.rotation ?? 0)) return false
  for (const axis of ['x', 'y']) {
    const p = a[axis]
    const q = b[axis]
    if (!p && !q) continue
    if (!p || !q) return false
    if (p.edgeId !== q.edgeId || p.side !== q.side || p.gapIn !== q.gapIn || p.alongIn !== q.alongIn)
      return false
  }
  return true
}

/**
 * 批量维护 placements 的 wallAnchor —— hydrateProject 每次编辑都会跑,所以:
 * - **幂等**:没变化时原样返回同一个数组/同一批对象,不churn {#each} 与响应式
 * - 只在锚真的变了时才换对象;居中(无锚)的家具不带这个字段
 * @param {import('./types.js').SpatialPlacement[]} placements
 * @param {WallGraph | undefined | null} wallGraph
 * @returns {import('./types.js').SpatialPlacement[]}
 */
export function refreshWallAnchors(placements, wallGraph) {
  if (!placements?.length || !wallGraph) return placements ?? []
  const segs = wallAnchorSegments(wallGraph)
  if (!segs.length) return placements
  const pxPerFt = wallGraph.pxPerFt ?? 36
  let changed = false
  const next = placements.map((p) => {
    const anchor = computeWallAnchor(p, p.rotation, segs, pxPerFt)
    if (anchorsEqual(p.wallAnchor, anchor)) return p
    changed = true
    if (!anchor) {
      const { wallAnchor: _drop, ...rest } = p
      return rest
    }
    return { ...p, wallAnchor: anchor }
  })
  return changed ? next : placements
}
