/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').WallGraph} WallGraph */

/**
 * 墙图 → 房间：把墙图当平面直线图（PSLG），检测最小闭合环（面）。
 *
 * 方案文档 D2 把「墙闭合环自动检测」列为后续增强，这里补上。业界同构做法见
 * Blueprint3D 的 half-edge / smallest-cycle；学术侧是平面图的面检测 + 对偶图。
 *
 * 三步：
 *   1. planarize —— 在交叉处切分。用户可以画出两面交叉却不共享顶点的墙，
 *      而面检测**要求**真正的平面嵌入，否则环会穿过交点连错。只用于检测，不写回 SSOT。
 *   2. pruneDangling —— 反复剥掉度为 1 的顶点。悬空墙围不出房间，留着只会让面多出尖刺。
 *   3. traceFaces —— 半边遍历：next(u→v) = 在 v 处、从反向边 v→u 起顺时针数的下一条边。
 *      该规则下内部面的有向面积恒为正、外部面为负（与 SVG 的 y 轴朝下无关，
 *      因为鞋带公式只看坐标数值），据此过滤掉外轮廓。
 */

const EPS = 1e-6
/** 顶点落在边内部多近算 T 型接头（1.5px ≈ 0.5″，网格步长是 3px）。 */
const TJUNCTION_TOL_PX = 1.5
/** 小于此面积的环不算房间（衣柜约 6 sq ft，留足余量）。 */
const MIN_ROOM_SQFT = 3

/**
 * @param {Point[]} poly
 * @returns {number} 鞋带有向面积（正 = 内部面）
 */
export function signedArea(poly) {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/**
 * 在真交点处切分所有边，得到平面嵌入。
 * @param {WallGraph} graph
 * @returns {{ vertices: { id: string, x: number, y: number }[], edges: { id: string, a: string, b: string, origin: string }[] }}
 */
function planarize(graph) {
  const byId = new Map(graph.vertices.map((v) => [v.id, v]))
  /** @type {{ id: string, x: number, y: number }[]} */
  const vertices = graph.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y }))
  let seq = 0
  const keyOf = (x, y) => `${Math.round(x * 100)}:${Math.round(y * 100)}`
  const index = new Map(vertices.map((v) => [keyOf(v.x, v.y), v.id]))

  /** @param {number} x @param {number} y */
  function vertexAt(x, y) {
    const k = keyOf(x, y)
    const hit = index.get(k)
    if (hit) return hit
    const id = `px-${seq++}`
    vertices.push({ id, x, y })
    index.set(k, id)
    return id
  }

  /** 每条原始边收集其上的切分点（按参数 t 排序） */
  /** @type {{ edge: any, a: any, b: any, cuts: { t: number, x: number, y: number }[] }[]} */
  const segs = []
  for (const e of graph.edges) {
    const a = byId.get(e.a)
    const b = byId.get(e.b)
    if (!a || !b) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) continue
    segs.push({ edge: e, a, b, cuts: [] })
  }

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i]
      const s2 = segs[j]
      const r = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y }
      const s = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y }
      const denom = r.x * s.y - r.y * s.x
      if (Math.abs(denom) < EPS) continue // 平行 / 共线：不处理
      const qp = { x: s2.a.x - s1.a.x, y: s2.a.y - s1.a.y }
      const t = (qp.x * s.y - qp.y * s.x) / denom
      const u = (qp.x * r.y - qp.y * r.x) / denom
      // 严格内部相交才切（端点相交本就共享顶点，无需处理）
      if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) continue
      const x = s1.a.x + t * r.x
      const y = s1.a.y + t * r.y
      s1.cuts.push({ t, x, y })
      s2.cuts.push({ t: u, x, y })
    }
  }

  // T 型接头：顶点落在另一条边的内部却不是它的端点。
  // 用户画隔墙时把端点顶在外墙中段就是这种情况——addWallSegment 只在 3px 内合并
  // 顶点，不会切分被顶到的边，不补这一刀那条隔墙会被当悬空墙剥掉。
  for (const seg of segs) {
    const dx = seg.b.x - seg.a.x
    const dy = seg.b.y - seg.a.y
    const len2 = dx * dx + dy * dy
    if (len2 < EPS) continue
    for (const v of graph.vertices) {
      if (v.id === seg.a.id || v.id === seg.b.id) continue
      const t = ((v.x - seg.a.x) * dx + (v.y - seg.a.y) * dy) / len2
      if (t <= EPS || t >= 1 - EPS) continue
      const cx = seg.a.x + t * dx
      const cy = seg.a.y + t * dy
      if (Math.hypot(v.x - cx, v.y - cy) > TJUNCTION_TOL_PX) continue
      seg.cuts.push({ t, x: v.x, y: v.y })
    }
  }

  /** @type {{ id: string, a: string, b: string, origin: string }[]} */
  const edges = []
  let eseq = 0
  for (const seg of segs) {
    if (!seg.cuts.length) {
      edges.push({
        id: `pe-${eseq++}`,
        a: vertexAt(seg.a.x, seg.a.y),
        b: vertexAt(seg.b.x, seg.b.y),
        origin: seg.edge.id,
      })
      continue
    }
    seg.cuts.sort((p, q) => p.t - q.t)
    let prev = vertexAt(seg.a.x, seg.a.y)
    for (const cut of seg.cuts) {
      const mid = vertexAt(cut.x, cut.y)
      if (mid !== prev) {
        edges.push({ id: `pe-${eseq++}`, a: prev, b: mid, origin: seg.edge.id })
        prev = mid
      }
    }
    const end = vertexAt(seg.b.x, seg.b.y)
    if (end !== prev) {
      edges.push({ id: `pe-${eseq++}`, a: prev, b: end, origin: seg.edge.id })
    }
  }

  // 去重（同一对顶点只留一条）
  const seen = new Set()
  const deduped = edges.filter((e) => {
    if (e.a === e.b) return false
    const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { vertices, edges: deduped }
}

/**
 * 反复剥掉度为 1 的顶点及其边。
 * @param {{ vertices: any[], edges: any[] }} g
 */
function pruneDangling(g) {
  let edges = g.edges.slice()
  for (;;) {
    /** @type {Map<string, number>} */
    const deg = new Map()
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) ?? 0) + 1)
      deg.set(e.b, (deg.get(e.b) ?? 0) + 1)
    }
    const next = edges.filter(
      (e) => (deg.get(e.a) ?? 0) > 1 && (deg.get(e.b) ?? 0) > 1,
    )
    if (next.length === edges.length) break
    edges = next
  }
  const used = new Set(edges.flatMap((e) => [e.a, e.b]))
  return { vertices: g.vertices.filter((v) => used.has(v.id)), edges }
}

/**
 * 半边遍历检测所有内部面。
 * @param {{ vertices: { id: string, x: number, y: number }[], edges: { id: string, a: string, b: string }[] }} g
 * @returns {Point[][]}
 */
function traceFaces(g) {
  const pos = new Map(g.vertices.map((v) => [v.id, v]))
  /** @type {Map<string, string[]>} 每个顶点的邻居，按角度升序 */
  const adj = new Map()
  for (const e of g.edges) {
    if (!adj.has(e.a)) adj.set(e.a, [])
    if (!adj.has(e.b)) adj.set(e.b, [])
    adj.get(e.a).push(e.b)
    adj.get(e.b).push(e.a)
  }
  const angle = (from, to) => {
    const a = pos.get(from)
    const b = pos.get(to)
    return Math.atan2(b.y - a.y, b.x - a.x)
  }
  for (const [v, nbrs] of adj) {
    nbrs.sort((p, q) => angle(v, p) - angle(v, q))
  }

  /** @type {Point[][]} */
  const faces = []
  const visited = new Set()
  for (const e of g.edges) {
    for (const [u0, v0] of [
      [e.a, e.b],
      [e.b, e.a],
    ]) {
      if (visited.has(`${u0}>${v0}`)) continue
      /** @type {Point[]} */
      const poly = []
      let u = u0
      let v = v0
      let guard = 0
      let closed = false
      for (;;) {
        // 安全网：正常遍历必然回到起始半边，触发说明图畸形
        if (guard++ > g.edges.length * 2 + 8) break
        visited.add(`${u}>${v}`)
        const p = pos.get(u)
        poly.push({ x: p.x, y: p.y })
        // next(u→v)：在 v 处，从反向边 v→u 起、顺时针数的下一条
        const nbrs = adj.get(v)
        const i = nbrs.indexOf(u)
        if (i < 0) break
        const w = nbrs[(i - 1 + nbrs.length) % nbrs.length]
        u = v
        v = w
        if (u === u0 && v === v0) {
          closed = true
          break
        }
      }
      // 只收闭合的环。未闭合说明中途 break，poly 是半截的——
      // 它照样可能算出正面积，收进来就是个假房间。
      if (closed && poly.length >= 3 && signedArea(poly) > 0) faces.push(poly)
    }
  }
  return faces
}

/** @param {Point} p @param {Point} q @param {Point} r */
function cross3(p, q, r) {
  return (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y)
}

/** 点在三角形内（含边）。 @param {Point} p @param {Point} a @param {Point} b @param {Point} c */
function pointInTriangle(p, a, b, c) {
  const d1 = cross3(p, a, b)
  const d2 = cross3(p, b, c)
  const d3 = cross3(p, c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/**
 * 返回一个**保证落在简单多边形内部**的点。
 *
 * 别拿 `zoneCentroid`（顶点均值）当内部点用：凹多边形会翻车——
 * U 形房间的顶点均值落在缺口里，L 形的正好落在凹角顶点上，
 * 两者 `pointInPolygon` 都判 false。用它做「这个房间是否已有分区」的判定，
 * 会永远判否 → 每点一次识别就重复建一个区。
 *
 * 经典解法：y 最小（并列取 x 最小）的顶点在简单多边形上必然是凸顶点 v；
 * 取其两邻 a、c 构成三角形。若无其他顶点落在三角形内 → 三角形质心即在多边形内；
 * 否则取三角形内离 a–c 最远的顶点 q，返回 v 与 q 的中点。
 *
 * @param {Point[]} poly
 * @returns {Point}
 */
export function polygonInteriorPoint(poly) {
  const n = poly.length
  if (!n) return { x: 0, y: 0 }
  if (n < 3) {
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    }
  }

  let i = 0
  for (let k = 1; k < n; k++) {
    if (poly[k].y < poly[i].y || (poly[k].y === poly[i].y && poly[k].x < poly[i].x)) {
      i = k
    }
  }
  const ia = (i - 1 + n) % n
  const ic = (i + 1) % n
  const v = poly[i]
  const a = poly[ia]
  const c = poly[ic]

  let best = null
  let bestD = -1
  for (let k = 0; k < n; k++) {
    if (k === i || k === ia || k === ic) continue
    const q = poly[k]
    if (!pointInTriangle(q, a, v, c)) continue
    // 离 a–c 越远越靠近 v，中点越稳落在内部
    const d = Math.abs(cross3(q, a, c))
    if (d > bestD) {
      bestD = d
      best = q
    }
  }

  if (!best) {
    return { x: (a.x + v.x + c.x) / 3, y: (a.y + v.y + c.y) / 3 }
  }
  return { x: (v.x + best.x) / 2, y: (v.y + best.y) / 2 }
}

/**
 * 检测墙图围合出的房间候选。
 * @param {WallGraph} graph
 * @param {{ minSqFt?: number }} [opts]
 * @returns {{ polygon: Point[], areaSqFt: number }[]} 按面积降序
 */
export function detectRooms(graph, opts = {}) {
  if (!graph?.edges?.length) return []
  const minSqFt = opts.minSqFt ?? MIN_ROOM_SQFT
  const planar = pruneDangling(planarize(graph))
  if (!planar.edges.length) return []

  const pxPerFt = graph.pxPerFt || 36
  const sqPx = pxPerFt * pxPerFt
  return traceFaces(planar)
    .map((polygon) => ({
      polygon: dedupeCollinear(polygon),
      areaSqFt: signedArea(polygon) / sqPx,
    }))
    .filter((r) => r.polygon.length >= 3 && r.areaSqFt >= minSqFt)
    .sort((a, b) => b.areaSqFt - a.areaSqFt)
}

/**
 * 去掉共线冗余点（planarize 切出来的过渡点会让多边形顶点冗余）。
 * @param {Point[]} poly
 */
function dedupeCollinear(poly) {
  if (poly.length < 3) return poly
  /** @type {Point[]} */
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length]
    const cur = poly[i]
    const next = poly[(i + 1) % poly.length]
    const cross =
      (cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x)
    if (Math.abs(cross) > 0.5) out.push(cur)
  }
  return out.length >= 3 ? out : poly
}
