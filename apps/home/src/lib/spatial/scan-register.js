/**
 * 全局墙体配准 —— 把一次扫描刚性对齐到固定的家坐标系(纯函数,node 单测直接跑)。
 *
 * 前提:墙不再变(用户已确认),所以每次扫描不是「新户型」,而是**重新定位到同一个家**。
 * 求一个 SE(2) 变换:yaw ∈ {0°,90°,180°,270°}(扫描与本地各自都做过主方向对齐,
 * 残余角差由残差指标兜底)+ 平移 (tx, ty)。**永远禁止缩放** —— 扫描包围盒对不上
 * 只能说明漂移或缺扫,拉伸会把真实尺寸改坏。
 *
 * 做法(轴对齐墙段的 1D 投票,等价于受限 RANSAC):
 * 1. 双方墙体 → 轴对齐墙段(竖墙约束 tx,横墙约束 ty)。
 * 2. 对每个候选 yaw:长度比合理(0.5–2)的墙段对 → 平移候选,按重合长度加权
 *    聚类(容差 12px≈10cm),取票数最高的 (tx, ty)。
 * 3. 打分:变换后每段扫描墙找最近的平行本地墙(沿墙重叠 ≥30%),按长度加权
 *    算中位/P95 残差与匹配墙长。
 * 4. 验收门:≥3 段独立匹配墙且两个朝向都有、中位残差 ≤7cm、P95 ≤15cm;
 *    不过门就 `needs_rescan` —— **拒绝合并,绝不强行吸附**。
 *
 * 已知近似:RoomPlan 墙是中心线、508 参数房间 bounds 是内墙面,系统性差约
 * 半个墙厚(2–3cm),验收阈值已覆盖;后续可按墙厚建模消掉。
 */

/** px/cm(36px=1ft) */
const PX_PER_CM = 36 / 30.48
/** 平移候选聚类容差:10cm */
const SHIFT_CLUSTER_PX = 10 * PX_PER_CM
/** 墙段配对的长度比范围 */
const LEN_RATIO = [0.5, 2]
/** 残差匹配时的沿墙最小重叠比例 */
const MIN_OVERLAP = 0.3
/** 验收门 */
const ACCEPT = {
  medianPx: 7 * PX_PER_CM, // 7cm
  p95Px: 15 * PX_PER_CM, // 15cm
  minWalls: 3, // 独立匹配墙段数
}

/**
 * wallGraph → 轴对齐墙段。斜墙极少(两端都做过主方向拉直),忽略。
 * @returns {Array<{ vertical: boolean, at: number, lo: number, hi: number, len: number }>}
 */
export function wallSegments(wallGraph) {
  const byId = Object.fromEntries(
    (wallGraph?.vertices ?? []).map((v) => [v.id, v]),
  )
  const out = []
  for (const e of wallGraph?.edges ?? []) {
    const a = byId[e.a]
    const b = byId[e.b]
    if (!a || !b) continue
    if (Math.abs(a.x - b.x) < 1.5) {
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      out.push({ vertical: true, at: a.x, lo, hi, len: hi - lo })
    } else if (Math.abs(a.y - b.y) < 1.5) {
      const lo = Math.min(a.x, b.x)
      const hi = Math.max(a.x, b.x)
      out.push({ vertical: false, at: a.y, lo, hi, len: hi - lo })
    }
  }
  return out.filter((s) => s.len > 1)
}

/** 房间矩形 bounds → 四边墙段(508 参数模式没有 wallGraph 时的本地墙来源) */
export function roomBoundsSegments(rooms) {
  const out = []
  for (const r of rooms ?? []) {
    const b = r.bounds
    if (!b) continue
    out.push({ vertical: true, at: b.x, lo: b.y, hi: b.y + b.h, len: b.h })
    out.push({ vertical: true, at: b.x + b.w, lo: b.y, hi: b.y + b.h, len: b.h })
    out.push({ vertical: false, at: b.y, lo: b.x, hi: b.x + b.w, len: b.w })
    out.push({ vertical: false, at: b.y + b.h, lo: b.x, hi: b.x + b.w, len: b.w })
  }
  return out
}

/** 用任意点变换搬运轴对齐墙段(刚性变换下仍轴对齐) */
export function transformSegments(segs, apply) {
  const out = []
  for (const s of segs) {
    const a = apply(s.vertical ? { x: s.at, y: s.lo } : { x: s.lo, y: s.at })
    const b = apply(s.vertical ? { x: s.at, y: s.hi } : { x: s.hi, y: s.at })
    if (Math.abs(a.x - b.x) < 1.5) {
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      out.push({ vertical: true, at: (a.x + b.x) / 2, lo, hi, len: hi - lo })
    } else if (Math.abs(a.y - b.y) < 1.5) {
      const lo = Math.min(a.x, b.x)
      const hi = Math.max(a.x, b.x)
      out.push({ vertical: false, at: (a.y + b.y) / 2, lo, hi, len: hi - lo })
    }
  }
  return out
}

/** yaw(度,y 向下的平面) → 点变换。平移在 rotate 之后加。 */
function rotatePoint(yaw, p) {
  switch (yaw) {
    case 90:
      return { x: -p.y, y: p.x }
    case 180:
      return { x: -p.x, y: -p.y }
    case 270:
      return { x: p.y, y: -p.x }
    default:
      return { x: p.x, y: p.y }
  }
}

/** 旋转墙段(yaw 是 90 的倍数,竖横互换) */
function rotateSeg(yaw, s) {
  const a = rotatePoint(yaw, s.vertical ? { x: s.at, y: s.lo } : { x: s.lo, y: s.at })
  const b = rotatePoint(yaw, s.vertical ? { x: s.at, y: s.hi } : { x: s.hi, y: s.at })
  if (Math.abs(a.x - b.x) < 1.5) {
    const lo = Math.min(a.y, b.y)
    const hi = Math.max(a.y, b.y)
    return { vertical: true, at: a.x, lo, hi, len: hi - lo }
  }
  const lo = Math.min(a.x, b.x)
  const hi = Math.max(a.x, b.x)
  return { vertical: false, at: a.y, lo, hi, len: hi - lo }
}

/** 1D 平移候选加权聚类,返回最佳 { delta, weight };空则 null */
function bestShift(cands) {
  if (!cands.length) return null
  const sorted = [...cands].sort((a, b) => a.delta - b.delta)
  let best = null
  for (let i = 0; i < sorted.length; i++) {
    let weight = 0
    let sum = 0
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].delta - sorted[i].delta > SHIFT_CLUSTER_PX) break
      weight += sorted[j].weight
      sum += sorted[j].delta * sorted[j].weight
    }
    if (!best || weight > best.weight) best = { delta: sum / weight, weight }
  }
  return best
}

/** 长度加权分位数 */
function weightedPercentile(items, q) {
  if (!items.length) return Infinity
  const sorted = [...items].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((s, it) => s + it.weight, 0)
  let acc = 0
  for (const it of sorted) {
    acc += it.weight
    if (acc >= total * q) return it.value
  }
  return sorted[sorted.length - 1].value
}

/** 某个 (yaw, tx, ty) 的对齐质量 */
/** 一组(近)轴对齐墙段对本地墙的打分 —— scoreTransform/scoreRefined 共用 */
function scoreSegs(segs, localSegs) {
  const residuals = []
  let matchedLen = 0
  let matchedV = 0
  let matchedH = 0
  for (const s of segs) {
    let best = null
    for (const l of localSegs) {
      if (l.vertical !== s.vertical) continue
      const overlap = Math.min(l.hi, s.hi) - Math.max(l.lo, s.lo)
      if (overlap < s.len * MIN_OVERLAP) continue
      const d = Math.abs(l.at - s.at)
      if (best === null || d < best) best = d
    }
    if (best === null) continue
    residuals.push({ value: best, weight: s.len })
    if (best <= ACCEPT.p95Px) {
      matchedLen += s.len
      if (s.vertical) matchedV++
      else matchedH++
    }
  }
  return {
    medianPx: weightedPercentile(residuals, 0.5),
    p95Px: weightedPercentile(residuals, 0.95),
    matchedLen,
    matchedV,
    matchedH,
  }
}

function shiftedSegs(scanSegs, yaw, tx, ty) {
  return scanSegs.map((raw) => {
    const s = rotateSeg(yaw, raw)
    return {
      vertical: s.vertical,
      at: s.at + (s.vertical ? tx : ty),
      lo: s.lo + (s.vertical ? ty : tx),
      hi: s.hi + (s.vertical ? ty : tx),
      len: s.len,
    }
  })
}

function scoreTransform(scanSegs, localSegs, yaw, tx, ty) {
  return scoreSegs(shiftedSegs(scanSegs, yaw, tx, ty), localSegs)
}

/** 精修的小角度上限(度):双方都做过主方向拉直,残余角差只会是零点几到
 *  一两度的手持漂移;超过它说明配错了,别让精修把错误焊死 */
const REFINE_MAX_DEG = 3
/** 精修至少要有这么多采样点(≈2 段墙),不然解不稳 */
const REFINE_MIN_SAMPLES = 6

/**
 * 点到线小角度精修(室内 2D 配准的标准第二步:粗对齐 + 点到线 ICP):
 * 量化 yaw + 平移之后,残余的手持小角差会均匀污染所有家具的到墙距离 ——
 * 对匹配上的墙段采样(两端+中点),对目标墙**线**做一轮加权最小二乘,
 * 解 (θ, dtx, dty)。绕采样质心旋转(大坐标下直接绕原点解病态)。
 * @returns {{ thetaRad: number, dtx: number, dty: number, cx: number, cy: number } | null}
 */
function refineTransform(scanSegs, localSegs, yaw, tx, ty) {
  /** @type {Array<{ x: number, y: number, vertical: boolean, target: number, w: number }>} */
  const samples = []
  for (const s of shiftedSegs(scanSegs, yaw, tx, ty)) {
    let bestL = null
    let bestD = null
    for (const l of localSegs) {
      if (l.vertical !== s.vertical) continue
      const overlap = Math.min(l.hi, s.hi) - Math.max(l.lo, s.lo)
      if (overlap < s.len * MIN_OVERLAP) continue
      const d = Math.abs(l.at - s.at)
      if (bestD === null || d < bestD) {
        bestD = d
        bestL = l
      }
    }
    // 离群墙(超 P95 门)不进精修 —— 缺扫/误配的墙会把最小二乘拽歪
    if (!bestL || bestD > ACCEPT.p95Px) continue
    const w = s.len / 3
    for (const t of [s.lo, (s.lo + s.hi) / 2, s.hi]) {
      samples.push(
        s.vertical
          ? { x: s.at, y: t, vertical: true, target: bestL.at, w }
          : { x: t, y: s.at, vertical: false, target: bestL.at, w },
      )
    }
  }
  if (samples.length < REFINE_MIN_SAMPLES) return null

  let wSum = 0
  let cx = 0
  let cy = 0
  for (const p of samples) {
    wSum += p.w
    cx += p.x * p.w
    cy += p.y * p.w
  }
  cx /= wSum
  cy /= wSum

  // 未知量 u = [θ, dtx, dty];小角近似下(绕质心):
  //   竖墙残差: (x-cx) - θ(y-cy) + cx + dtx - target = 0 → [-(y-cy), 1, 0]·u = target - x
  //   横墙残差: (y-cy) + θ(x-cx) + cy + dty - target = 0 → [ (x-cx), 0, 1]·u = target - y
  // 加权正规方程 3×3,手解。
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const b = [0, 0, 0]
  for (const p of samples) {
    const row = p.vertical ? [-(p.y - cy), 1, 0] : [p.x - cx, 0, 1]
    const rhs = p.vertical ? p.target - p.x : p.target - p.y
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) A[i][j] += p.w * row[i] * row[j]
      b[i] += p.w * row[i] * rhs
    }
  }
  const u = solve3x3(A, b)
  if (!u) return null
  return { thetaRad: u[0], dtx: u[1], dty: u[2], cx, cy }
}

/** 3×3 线性方程组(高斯消元,含主元选取);奇异返回 null */
function solve3x3(A, b) {
  const m = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let r = 0; r < 3; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c]
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
}

/** 精修后的墙段打分:精确旋转端点,按主方向重建(近)轴对齐段。
 *  |θ|≤3° 下斜置可忽略,'at' 取两端点均值。 */
function scoreRefined(scanSegs, localSegs, applyFn) {
  const segs = []
  for (const raw of scanSegs) {
    const [p1, p2] = raw.vertical
      ? [
          { x: raw.at, y: raw.lo },
          { x: raw.at, y: raw.hi },
        ]
      : [
          { x: raw.lo, y: raw.at },
          { x: raw.hi, y: raw.at },
        ]
    const q1 = applyFn(p1)
    const q2 = applyFn(p2)
    const vertical = Math.abs(q2.x - q1.x) < Math.abs(q2.y - q1.y)
    segs.push({
      vertical,
      at: vertical ? (q1.x + q2.x) / 2 : (q1.y + q2.y) / 2,
      lo: vertical ? Math.min(q1.y, q2.y) : Math.min(q1.x, q2.x),
      hi: vertical ? Math.max(q1.y, q2.y) : Math.max(q1.x, q2.x),
      len: raw.len,
    })
  }
  return scoreSegs(segs, localSegs)
}

/**
 * @typedef {object} Registration
 * @property {'ok'|'needs_rescan'} status
 * @property {0|90|180|270} yawDeg
 * @property {number} tx
 * @property {number} ty
 * @property {number} refineDeg 点到线精修的小角度(度;0 = 没精修或没变好)。
 *   量化 yaw 只到 90° 网格,手持扫描的残余 0.5-1.5° 由这一步补掉
 * @property {number} medianCm 匹配墙段的长度加权中位残差
 * @property {number} p95Cm
 * @property {number} matchedWalls 达标匹配墙段数
 * @property {string} [reason] needs_rescan 的人话原因
 * @property {(p: {x:number,y:number}) => {x:number,y:number}} apply 点变换
 * @property {(box: {x:number,y:number,w:number,h:number}) => {x:number,y:number,w:number,h:number}} applyBox
 *   变换轴对齐盒(yaw 90/270 时宽高互换,尺寸永不缩放)
 */

/**
 * 求扫描 → 家坐标系的全局刚性变换。
 * @param {any} scanWallGraph payload.homeos.wallGraph
 * @param {ReturnType<typeof wallSegments>} localSegs 本地墙段
 * @returns {Registration}
 */
export function registerScanToHome(scanWallGraph, localSegs) {
  const scanSegs = wallSegments(scanWallGraph)
  const fail = (reason) => ({
    status: /** @type {const} */ ('needs_rescan'),
    yawDeg: /** @type {const} */ (0),
    tx: 0,
    ty: 0,
    refineDeg: 0,
    medianCm: Infinity,
    p95Cm: Infinity,
    matchedWalls: 0,
    reason,
    apply: (p) => p,
    applyBox: (b) => b,
  })
  if (!scanSegs.length) return fail('扫描里没有可用墙段')
  if (!localSegs.length) return fail('本地户型没有可用墙段')

  let best = null
  for (const yaw of /** @type {const} */ ([0, 90, 180, 270])) {
    const rot = scanSegs.map((s) => rotateSeg(yaw, s))
    const txCands = []
    const tyCands = []
    for (const s of rot) {
      for (const l of localSegs) {
        if (l.vertical !== s.vertical) continue
        const ratio = s.len / l.len
        if (ratio < LEN_RATIO[0] || ratio > LEN_RATIO[1]) continue
        const cand = { delta: l.at - s.at, weight: Math.min(s.len, l.len) }
        if (s.vertical) txCands.push(cand)
        else tyCands.push(cand)
      }
    }
    const sx = bestShift(txCands)
    const sy = bestShift(tyCands)
    if (!sx || !sy) continue
    const score = scoreTransform(scanSegs, localSegs, yaw, sx.delta, sy.delta)
    if (!best || score.matchedLen > best.score.matchedLen) {
      best = { yaw, tx: sx.delta, ty: sy.delta, score }
    }
  }
  if (!best) return fail('扫描与本地墙体找不到任何对应(朝向差异过大或缺扫)')

  const { yaw, tx, ty, score } = best

  // 点到线小角度精修:只有真把中位残差降下来才收(否则保持量化解)。
  // 手持扫描的残余 0.5-1.5° 角差会均匀污染所有家具的到墙距离,这一步治它。
  const baseApply = (p) => {
    const r = rotatePoint(yaw, p)
    return { x: r.x + tx, y: r.y + ty }
  }
  let finalScore = score
  let apply = baseApply
  let refineDeg = 0
  const ref = refineTransform(scanSegs, localSegs, yaw, tx, ty)
  if (ref && Math.abs(ref.thetaRad) <= (REFINE_MAX_DEG * Math.PI) / 180) {
    const cos = Math.cos(ref.thetaRad)
    const sin = Math.sin(ref.thetaRad)
    const refinedApply = (p) => {
      const q = baseApply(p)
      const dx = q.x - ref.cx
      const dy = q.y - ref.cy
      return {
        x: ref.cx + dx * cos - dy * sin + ref.dtx,
        y: ref.cy + dx * sin + dy * cos + ref.dty,
      }
    }
    const refinedScore = scoreRefined(scanSegs, localSegs, refinedApply)
    if (refinedScore.medianPx < score.medianPx) {
      finalScore = refinedScore
      apply = refinedApply
      refineDeg = Math.round(((ref.thetaRad * 180) / Math.PI) * 100) / 100
    }
  }

  const medianCm = finalScore.medianPx / PX_PER_CM
  const p95Cm = finalScore.p95Px / PX_PER_CM
  const matchedWalls = finalScore.matchedV + finalScore.matchedH

  // 盒子按**中心**变换(尺寸永不缩放,yaw 90/270 宽高互换):
  // 精修带小角后,老的两角点法会把 AABB 斜置膨胀几英寸,中心法不会。
  const applyBox = (b) => {
    const c = apply({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
    const swap = yaw === 90 || yaw === 270
    const w = swap ? b.h : b.w
    const h = swap ? b.w : b.h
    return { x: c.x - w / 2, y: c.y - h / 2, w, h }
  }

  /** @type {string | undefined} */
  let reason
  if (matchedWalls < ACCEPT.minWalls) reason = `匹配墙段太少(${matchedWalls})`
  else if (finalScore.matchedV < 1 || finalScore.matchedH < 1) reason = '只有单一朝向的墙匹配上'
  else if (finalScore.medianPx > ACCEPT.medianPx) reason = `墙面中位残差 ${medianCm.toFixed(1)}cm 超过 7cm`
  else if (finalScore.p95Px > ACCEPT.p95Px) reason = `墙面 P95 残差 ${p95Cm.toFixed(1)}cm 超过 15cm`

  return {
    status: reason ? 'needs_rescan' : 'ok',
    yawDeg: yaw,
    tx,
    ty,
    refineDeg,
    medianCm: Math.round(medianCm * 10) / 10,
    p95Cm: Math.round(p95Cm * 10) / 10,
    matchedWalls,
    reason,
    apply,
    applyBox,
  }
}
