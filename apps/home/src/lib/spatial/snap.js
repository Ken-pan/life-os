/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').WallGraph} WallGraph */

/**
 * 画墙 / 拖顶点的吸附引擎。优先级（对齐 CAD 惯例）：
 *   顶点吸附 > 对齐追踪（端点/中点同轴）> 角度吸附 > 1″ 网格
 *
 * 关键约束：角度吸附命中后按「沿射线的长度」取整，**不能**再对 x/y 取整——
 * 否则 15° 斜墙会被网格拽回，角度就不精确了。正交（0/90°）下两者等价，
 * 因此原有的 Shift 正交行为逐像素保持不变。
 *
 * @typedef {{ kind: 'vertical' | 'horizontal', pos: number, from: Point, to: Point, source: 'vertex' | 'midpoint' }} SnapGuide
 * @typedef {{
 *   x: number,
 *   y: number,
 *   guides: SnapGuide[],
 *   snapKind: 'vertex' | 'align' | 'angle' | 'grid',
 *   vertexId: string | null,
 *   lengthIn: number | null,
 *   angleDeg: number | null,
 * }} SnapResult
 */

/** 可选角度增量：0 = 关闭。 */
export const ANGLE_SNAP_OPTIONS = [0, 15, 45, 90]
export const DEFAULT_ANGLE_SNAP_DEG = 15

const VERTEX_SNAP_PX = 10
const ALIGN_TOL_PX = 6
const GUIDE_PAD_PX = 24

/** @param {number} x @param {number} y @param {number} pxPerFt */
function snapToGrid(x, y, pxPerFt) {
  const step = pxPerFt / 12
  return { x: Math.round(x / step) * step, y: Math.round(y / step) * step }
}

/** @param {number} lenPx @param {number} pxPerFt */
function snapLength(lenPx, pxPerFt) {
  const step = pxPerFt / 12
  return Math.round(lenPx / step) * step
}

/**
 * 候选对齐锚点：所有顶点 + 每条边的中点。
 * @param {WallGraph} graph
 * @param {string | null} excludeVertexId
 */
function alignAnchors(graph, excludeVertexId) {
  /** @type {{ x: number, y: number, source: 'vertex' | 'midpoint' }[]} */
  const anchors = []
  const byId = new Map(graph.vertices.map((v) => [v.id, v]))
  for (const v of graph.vertices) {
    if (v.id === excludeVertexId) continue
    anchors.push({ x: v.x, y: v.y, source: 'vertex' })
  }
  for (const e of graph.edges) {
    const a = byId.get(e.a)
    const b = byId.get(e.b)
    if (!a || !b) continue
    if (a.id === excludeVertexId || b.id === excludeVertexId) continue
    anchors.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, source: 'midpoint' })
  }
  return anchors
}

/**
 * @param {'vertical' | 'horizontal'} kind
 * @param {{ x: number, y: number, source: 'vertex' | 'midpoint' }} anchor
 * @param {Point} pt
 * @returns {SnapGuide}
 */
function buildGuide(kind, anchor, pt) {
  if (kind === 'vertical') {
    const lo = Math.min(anchor.y, pt.y) - GUIDE_PAD_PX
    const hi = Math.max(anchor.y, pt.y) + GUIDE_PAD_PX
    return {
      kind,
      pos: anchor.x,
      from: { x: anchor.x, y: lo },
      to: { x: anchor.x, y: hi },
      source: anchor.source,
    }
  }
  const lo = Math.min(anchor.x, pt.x) - GUIDE_PAD_PX
  const hi = Math.max(anchor.x, pt.x) + GUIDE_PAD_PX
  return {
    kind,
    pos: anchor.y,
    from: { x: lo, y: anchor.y },
    to: { x: hi, y: anchor.y },
    source: anchor.source,
  }
}

/**
 * 解析一次画墙 / 拖点的落点。
 *
 * @param {Point | null} from 链的起点；null = 自由落点（链首 / 拖顶点）
 * @param {Point} to 原始指针位置（SVG 坐标）
 * @param {WallGraph} graph
 * @param {{
 *   angleSnapDeg?: number,
 *   ortho?: boolean,
 *   freeAngle?: boolean,
 *   excludeVertexId?: string | null,
 *   zoom?: number,
 * }} [opts]
 * @returns {SnapResult}
 */
export function resolveSnap(from, to, graph, opts = {}) {
  const pxPerFt = graph.pxPerFt
  const zoom = Math.max(0.2, opts.zoom ?? 1)
  const vertexTol = VERTEX_SNAP_PX / zoom
  const alignTol = ALIGN_TOL_PX / zoom
  const excludeVertexId = opts.excludeVertexId ?? null

  /** @type {SnapResult} */
  const base = {
    x: to.x,
    y: to.y,
    guides: [],
    snapKind: 'grid',
    vertexId: null,
    lengthIn: null,
    angleDeg: null,
  }

  /** @param {SnapResult} r */
  const withMetrics = (r) => {
    if (!from) return r
    const dx = r.x - from.x
    const dy = r.y - from.y
    return {
      ...r,
      lengthIn: (Math.hypot(dx, dy) / pxPerFt) * 12,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  }

  // 1) 顶点吸附——最高优先级，坐标原样返回（不再取整）
  let bestVert = null
  let bestVertD = vertexTol
  for (const v of graph.vertices) {
    if (v.id === excludeVertexId) continue
    const d = Math.hypot(v.x - to.x, v.y - to.y)
    if (d < bestVertD) {
      bestVertD = d
      bestVert = v
    }
  }
  if (bestVert) {
    return withMetrics({
      ...base,
      x: bestVert.x,
      y: bestVert.y,
      snapKind: 'vertex',
      vertexId: bestVert.id,
    })
  }

  const inc = opts.ortho ? 90 : opts.freeAngle ? 0 : (opts.angleSnapDeg ?? 0)
  const angleActive = Boolean(from) && inc > 0
  const anchors = alignAnchors(graph, excludeVertexId)

  // 2) 角度约束：先把落点投影到最近的角度射线上
  if (angleActive && from) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    if (Math.hypot(dx, dy) < 1e-6) return withMetrics(base)
    const raw = Math.atan2(dy, dx)
    const step = (inc * Math.PI) / 180
    const snapped = Math.round(raw / step) * step
    const ux = Math.cos(snapped)
    const uy = Math.sin(snapped)
    const len = Math.max(0, dx * ux + dy * uy)
    let px = from.x + len * ux
    let py = from.y + len * uy

    // 2b) 对齐追踪 × 角度射线：若某条同轴参考线与射线的交点就在手边，
    //     取交点（CAD 的 polar tracking + object snap tracking 交汇）
    /** @type {SnapGuide[]} */
    const guides = []
    let hit = null
    let hitD = alignTol
    for (const anchor of anchors) {
      if (Math.abs(ux) > 1e-6) {
        const t = (anchor.x - from.x) / ux
        if (t > 0) {
          const iy = from.y + t * uy
          const d = Math.hypot(anchor.x - px, iy - py)
          if (d < hitD) {
            hitD = d
            hit = { x: anchor.x, y: iy, anchor, kind: /** @type {const} */ ('vertical') }
          }
        }
      }
      if (Math.abs(uy) > 1e-6) {
        const t = (anchor.y - from.y) / uy
        if (t > 0) {
          const ix = from.x + t * ux
          const d = Math.hypot(ix - px, anchor.y - py)
          if (d < hitD) {
            hitD = d
            hit = { x: ix, y: anchor.y, anchor, kind: /** @type {const} */ ('horizontal') }
          }
        }
      }
    }
    if (hit) {
      guides.push(buildGuide(hit.kind, hit.anchor, { x: hit.x, y: hit.y }))
      return withMetrics({
        ...base,
        x: hit.x,
        y: hit.y,
        guides,
        snapKind: 'align',
      })
    }

    // 角度精确：只对长度取整，保住斜角
    const snappedLen = snapLength(len, pxPerFt)
    px = from.x + snappedLen * ux
    py = from.y + snappedLen * uy
    return withMetrics({
      ...base,
      x: px,
      y: py,
      snapKind: 'angle',
    })
  }

  // 3) 无角度约束：x / y 各自独立对齐
  /** @type {SnapGuide[]} */
  const guides = []
  let x = to.x
  let y = to.y
  let aligned = false

  let bestVx = null
  let bestVxD = alignTol
  let bestHy = null
  let bestHyD = alignTol
  for (const anchor of anchors) {
    const dx = Math.abs(anchor.x - to.x)
    if (dx < bestVxD) {
      bestVxD = dx
      bestVx = anchor
    }
    const dy = Math.abs(anchor.y - to.y)
    if (dy < bestHyD) {
      bestHyD = dy
      bestHy = anchor
    }
  }
  if (bestVx) {
    x = bestVx.x
    aligned = true
  }
  if (bestHy) {
    y = bestHy.y
    aligned = true
  }

  const grid = snapToGrid(x, y, pxPerFt)
  const finalX = bestVx ? x : grid.x
  const finalY = bestHy ? y : grid.y
  if (bestVx) guides.push(buildGuide('vertical', bestVx, { x: finalX, y: finalY }))
  if (bestHy) guides.push(buildGuide('horizontal', bestHy, { x: finalX, y: finalY }))

  return withMetrics({
    ...base,
    x: finalX,
    y: finalY,
    guides,
    snapKind: aligned ? 'align' : 'grid',
  })
}

/**
 * 沿 from→to 方向、按精确长度定位落点（精确长度输入用）。
 * @param {Point} from
 * @param {Point} to 决定方向的参考点
 * @param {number} lengthIn 英寸
 * @param {number} pxPerFt
 * @returns {Point | null}
 */
export function pointAtLength(from, to, lengthIn, pxPerFt) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6 || !(lengthIn > 0)) return null
  const px = (lengthIn / 12) * pxPerFt
  return { x: from.x + (dx / len) * px, y: from.y + (dy / len) * px }
}

/**
 * 户型里一段墙的长度上限（英寸）。500 ft 对住宅足够宽松，
 * 但能挡住「裸数字 = 英尺」约定下的手滑：输 99999 本意 9'99"，
 * 不拦就会造一道 99999 英尺的墙，graphViewport 直接被撑爆。
 */
const MAX_LENGTH_IN = 500 * 12

/**
 * 解析 `12'6"` / `12'` / `150"` / `12.5` （裸数字 = 英尺）等长度输入。
 * @param {string} raw
 * @returns {number | null} 英寸；无法识别或超出合理范围返回 null
 */
export function parseLengthInput(raw) {
  const s = String(raw).trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"')
  if (!s) return null

  /** @param {number | null} v */
  const sane = (v) => (v != null && v > 0 && v <= MAX_LENGTH_IN ? v : null)

  const ftIn = /^(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)?"?$/.exec(s)
  if (ftIn) {
    const ft = Number(ftIn[1])
    const inch = ftIn[2] ? Number(ftIn[2]) : 0
    if (inch >= 12) return null
    return sane(ft * 12 + inch)
  }
  const inOnly = /^(\d+(?:\.\d+)?)"$/.exec(s)
  if (inOnly) return sane(Number(inOnly[1]))

  const bare = /^(\d+(?:\.\d+)?)$/.exec(s)
  if (bare) return sane(Number(bare[1]) * 12)

  return null
}
