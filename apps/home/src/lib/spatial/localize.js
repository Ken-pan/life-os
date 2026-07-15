/**
 * 从「照片里的家具」反解相机机位 —— 把定位从「分区中心」提到几何解。
 *
 * 原理：家具的**真实尺寸和平面坐标都是已知的**（`placements[]`）。VLM 给出它在画面里
 * 的边界框后：
 *   - 框中心的横向偏移 → 该家具相对光轴的**方位偏角** α
 *   - 框的宽度 → 它张的角 → **距离** d = f_px · W_apparent / w_px
 * 一件家具给出「距离 d + 偏角 α」；**两件**就能三边定位解出机位，朝向随之而出。
 *
 * ⚠️ 精度上限不在算法，在输入：
 *   - `PLACEMENT_KINDS` 的尺寸是**目录默认值**（"Queen 床 60×80"），不是你家实测
 *   - 平面图本身是手绘/参数化的，自带误差
 *   - 超广角有明显桶形畸变，本模块按**理想针孔**建模，边缘误差更大
 * 所以这里能做到**分米级**，做不到厘米级。厘米级要靠拍摄当下的 ARKit 位姿，
 * 事后从一张照片是拿不回来的。
 */

/** 相机焦距（像素）。@param {number} imgW @param {number} hFovDeg */
export function focalPx(imgW, hFovDeg) {
  return imgW / 2 / Math.tan((hFovDeg * Math.PI) / 360)
}

/**
 * 画面横坐标 → 相对光轴的方位偏角（度，右正）。
 * @param {number} xPx 像素横坐标
 * @param {number} imgW
 * @param {number} hFovDeg
 */
export function bearingOffsetDeg(xPx, imgW, hFovDeg) {
  return (Math.atan((xPx - imgW / 2) / focalPx(imgW, hFovDeg)) * 180) / Math.PI
}

/**
 * 由「真实宽度 + 像素宽度」求距离。
 * @param {number} realW 面向相机的真实宽度（与平面同单位，px-of-plan）
 * @param {number} boxWpx
 * @param {number} imgW
 * @param {number} hFovDeg
 */
export function distanceFromWidth(realW, boxWpx, imgW, hFovDeg) {
  if (boxWpx <= 0) return NaN
  return (focalPx(imgW, hFovDeg) * realW) / boxWpx
}

/**
 * 矩形家具在某个视线方向下的**轮廓宽度**（垂直于视线的投影）。
 *
 * 家具是有朝向的矩形：正对着看是 w，斜 45° 看是 (w+h)/√2。不算这一步，
 * 斜看的冰箱会被当成「更窄 → 更远」，距离直接错几十厘米。
 *
 * @param {{ w: number, h: number, rotation?: number }} p
 * @param {number} viewDeg 相机→家具的方位角（平面坐标系，0=上、顺时针）
 */
export function apparentWidth(p, viewDeg) {
  // 家具自身轴向与视线的夹角
  const phi = (((viewDeg - (p.rotation ?? 0)) % 180) * Math.PI) / 180
  return Math.abs(p.w * Math.cos(phi)) + Math.abs(p.h * Math.sin(phi))
}

/**
 * @typedef {object} Sighting
 * @property {{ x: number, y: number, w: number, h: number, rotation?: number }} placement
 *   家具（平面坐标 + 尺寸，x/y 为左上角）
 * @property {number} boxCenterX 画面中框中心横坐标（px）
 * @property {number} boxWidthPx 画面中框宽度（px）
 */

/**
 * @typedef {object} Fix
 * @property {number} x
 * @property {number} y
 * @property {number} heading
 * @property {number} residual 各家具距离残差的 RMS（平面 px）；越小越可信
 * @property {number} used 参与解算的家具数
 */

/**
 * 两圆交点。@returns {{x:number,y:number}[]}
 */
function circleIntersections(c1, r1, c2, r2) {
  const dx = c2.x - c1.x
  const dy = c2.y - c1.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-6) return []
  // 相离或内含：把半径按比例拉到相切，取切点 —— 测量总有误差，硬判无解太脆。
  if (d > r1 + r2 || d < Math.abs(r1 - r2)) {
    const t = d > r1 + r2 ? r1 / (r1 + r2) : 1
    return [{ x: c1.x + dx * t, y: c1.y + dy * t }]
  }
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const hSq = r1 * r1 - a * a
  const h = Math.sqrt(Math.max(0, hSq))
  const mx = c1.x + (a * dx) / d
  const my = c1.y + (a * dy) / d
  const rx = (-dy * h) / d
  const ry = (dx * h) / d
  return [
    { x: mx + rx, y: my + ry },
    { x: mx - rx, y: my - ry },
  ]
}

/** @param {{x:number,y:number,w:number,h:number}} p */
function centerOf(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 }
}

/** 平面坐标系下 a→b 的方位角（0=上，顺时针）。 */
function bearing(a, b) {
  const deg = (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/**
 * 从两个及以上的观测解算机位。
 *
 * 家具的**轮廓宽度依赖视线方向**，而视线方向又依赖机位 —— 互相依赖，所以迭代：
 * 先用「正对」假设估距离 → 解位置 → 用解出的视线重算轮廓宽 → 再解。实测 3 轮内收敛。
 *
 * @param {Sighting[]} sightings
 * @param {number} imgW
 * @param {number} hFovDeg
 * @param {{ x: number, y: number }} hint 初值/歧义消解用（一般传分区中心）
 * @param {(pt: { x: number, y: number }) => boolean} [inBounds] 落点是否合法（一般传分区多边形）
 * @returns {Fix | null}
 */
export function solveFix(sightings, imgW, hFovDeg, hint, inBounds) {
  const list = sightings.filter((s) => s.boxWidthPx > 0)
  if (list.length < 2) return null

  let pos = { ...hint }
  for (let iter = 0; iter < 4; iter++) {
    const dists = list.map((s) => {
      const c = centerOf(s.placement)
      // 第一轮没有视线可用，就按「正对」估；之后用上一轮解出的机位反算。
      const view = iter === 0 ? bearing(pos, c) : bearing(pos, c)
      const wApp = apparentWidth(s.placement, view)
      return distanceFromWidth(wApp, s.boxWidthPx, imgW, hFovDeg)
    })
    if (dists.some((d) => !Number.isFinite(d) || d <= 0)) return null

    // 取距离最可信的两件（框越宽，相对误差越小）解交点；其余用于挑解与算残差。
    const order = list
      .map((s, i) => ({ i, wpx: s.boxWidthPx }))
      .sort((a, b) => b.wpx - a.wpx)
    const [A, B] = order
    const cands = circleIntersections(
      centerOf(list[A.i].placement),
      dists[A.i],
      centerOf(list[B.i].placement),
      dists[B.i],
    )
    if (!cands.length) return null

    // 两个交点是镜像解 —— 用分区边界和 hint 挑。
    let best = null
    let bestScore = Infinity
    for (const c of cands) {
      if (inBounds && !inBounds(c)) continue
      const s = Math.hypot(c.x - pos.x, c.y - pos.y)
      if (s < bestScore) {
        bestScore = s
        best = c
      }
    }
    if (!best) {
      // 都不在分区里：退而求其次，取离 hint 近的那个，让上层用 residual 判断可信度。
      best = cands.reduce((m, c) =>
        Math.hypot(c.x - hint.x, c.y - hint.y) < Math.hypot(m.x - hint.x, m.y - hint.y) ? c : m,
      )
    }
    if (Math.hypot(best.x - pos.x, best.y - pos.y) < 0.5) {
      pos = best
      break
    }
    pos = best
  }

  // 朝向：每件家具都给一个「θ = 它的绝对方位 − 它在画面里的偏角」，取圆平均。
  let sx = 0
  let sy = 0
  for (const s of list) {
    const c = centerOf(s.placement)
    const alpha = bearingOffsetDeg(s.boxCenterX, imgW, hFovDeg)
    const th = ((bearing(pos, c) - alpha) * Math.PI) / 180
    sx += Math.cos(th)
    sy += Math.sin(th)
  }
  const heading = ((((Math.atan2(sy, sx) * 180) / Math.PI) % 360) + 360) % 360

  // 残差：解出的机位与各家具的距离，对不对得上量出来的距离。
  let sum = 0
  for (const s of list) {
    const c = centerOf(s.placement)
    const view = bearing(pos, c)
    const dMeasured = distanceFromWidth(apparentWidth(s.placement, view), s.boxWidthPx, imgW, hFovDeg)
    const dActual = Math.hypot(c.x - pos.x, c.y - pos.y)
    sum += (dMeasured - dActual) ** 2
  }
  return {
    x: pos.x,
    y: pos.y,
    heading,
    residual: Math.sqrt(sum / list.length),
    used: list.length,
  }
}
