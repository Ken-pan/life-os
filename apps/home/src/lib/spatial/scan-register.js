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
function scoreTransform(scanSegs, localSegs, yaw, tx, ty) {
  const residuals = []
  let matchedLen = 0
  let matchedV = 0
  let matchedH = 0
  for (const raw of scanSegs) {
    const s = rotateSeg(yaw, raw)
    const at = s.at + (s.vertical ? tx : ty)
    const lo = s.lo + (s.vertical ? ty : tx)
    const hi = s.hi + (s.vertical ? ty : tx)
    let best = null
    for (const l of localSegs) {
      if (l.vertical !== s.vertical) continue
      const overlap = Math.min(l.hi, hi) - Math.max(l.lo, lo)
      if (overlap < s.len * MIN_OVERLAP) continue
      const d = Math.abs(l.at - at)
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

/**
 * @typedef {object} Registration
 * @property {'ok'|'needs_rescan'} status
 * @property {0|90|180|270} yawDeg
 * @property {number} tx
 * @property {number} ty
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
  const medianCm = score.medianPx / PX_PER_CM
  const p95Cm = score.p95Px / PX_PER_CM
  const matchedWalls = score.matchedV + score.matchedH

  const apply = (p) => {
    const r = rotatePoint(yaw, p)
    return { x: r.x + tx, y: r.y + ty }
  }
  const applyBox = (b) => {
    const c1 = apply({ x: b.x, y: b.y })
    const c2 = apply({ x: b.x + b.w, y: b.y + b.h })
    return {
      x: Math.min(c1.x, c2.x),
      y: Math.min(c1.y, c2.y),
      w: Math.abs(c2.x - c1.x),
      h: Math.abs(c2.y - c1.y),
    }
  }

  /** @type {string | undefined} */
  let reason
  if (matchedWalls < ACCEPT.minWalls) reason = `匹配墙段太少(${matchedWalls})`
  else if (score.matchedV < 1 || score.matchedH < 1) reason = '只有单一朝向的墙匹配上'
  else if (score.medianPx > ACCEPT.medianPx) reason = `墙面中位残差 ${medianCm.toFixed(1)}cm 超过 7cm`
  else if (score.p95Px > ACCEPT.p95Px) reason = `墙面 P95 残差 ${p95Cm.toFixed(1)}cm 超过 15cm`

  return {
    status: reason ? 'needs_rescan' : 'ok',
    yawDeg: yaw,
    tx,
    ty,
    medianCm: Math.round(medianCm * 10) / 10,
    p95Cm: Math.round(p95Cm * 10) / 10,
    matchedWalls,
    reason,
    apply,
    applyBox,
  }
}
