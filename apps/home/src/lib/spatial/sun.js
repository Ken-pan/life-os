/**
 * 日照模拟 —— 经纬度 + 时间 → 太阳方位/高度角 → 平面图上的光斑。
 *
 * 参照专业日照分析工具(Shadowmap / Sun Seeker / archviz sun study)的做法:
 *   1. 太阳位置用 NOAA 简化算法(精度 ~0.01°,对户型日照绰绰有余);
 *   2. 光从透光开口(窗、推拉玻璃门)进屋,顶视图上是一个沿光线方位
 *      推出去的四边形,进深 = 开口上沿高度 / tan(高度角) —— 太阳越低,
 *      光斑伸得越深;
 *   3. 光斑被墙挡住:与墙图围合面求交(Sutherland–Hodgman),不越过房间。
 *
 * 已知简化(v1):门洞会让光斑跨房间漏一点(围合面是跨门洞焊起来的);
 * 不算家具遮挡;窗沿高度用常识默认值(窗 7ft、推拉门 6'8")。
 */

import { detectRooms } from './rooms-from-graph.js'
import { graphOpeningBounds } from './graph-openings.js'

const RAD = Math.PI / 180

/**
 * NOAA 简化太阳位置。
 * @param {Date} date
 * @param {number} latDeg
 * @param {number} lonDeg 东经为正
 * @param {number} [elevM] 海拔(米) —— 只影响地平线下沉角,即日出日落边缘
 * @returns {{ altitudeDeg: number, azimuthDeg: number, aboveHorizon: boolean }}
 *   azimuthDeg:0=正北,顺时针;altitudeDeg:地平线为 0
 */
export function sunPosition(date, latDeg, lonDeg, elevM = 0) {
  // J2000 起的天数(含当日时刻)
  const n = date.getTime() / 86400000 - 10957.5
  const L = norm360(280.46 + 0.9856474 * n) // 平黄经
  const g = norm360(357.528 + 0.9856003 * n) * RAD // 平近点角
  const lambda =
    (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD // 视黄经
  const eps = (23.439 - 0.0000004 * n) * RAD // 黄赤交角
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  // 格林尼治恒星时(小时) → 本地恒星时 → 时角
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24
  const lstDeg = norm360(gmst * 15 + lonDeg)
  const H = norm360(lstDeg - ra / RAD) * RAD
  const lat = latDeg * RAD
  const alt = Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H),
  )
  // 从南起算的方位角 → 转成 0=北、顺时针
  const azS = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat),
  )
  const azimuthDeg = norm360(azS / RAD + 180)
  const altitudeDeg = alt / RAD
  // 海拔带来的地平线下沉(度):站得高看得早
  const dipDeg = 0.0293 * Math.sqrt(Math.max(0, elevM))
  return {
    altitudeDeg,
    azimuthDeg,
    aboveHorizon: altitudeDeg > -dipDeg - 0.567, // 含标准大气折射
  }
}

/** @param {number} d */
function norm360(d) {
  return ((d % 360) + 360) % 360
}

/**
 * 光线在平面图坐标系里的行进方向(单位向量,从窗口指向屋内地面)。
 * 平面图 y 轴朝下;planNorthDeg = 图正上方对应的真实方位角(未校准视作 0)。
 * @param {number} azimuthDeg 太阳方位角(0=北,顺时针)
 * @param {number | null} planNorthDeg
 */
export function sunLightPlanDir(azimuthDeg, planNorthDeg) {
  // 光朝太阳的反方向走:方位 = azimuth + 180
  const a = (azimuthDeg + 180 - (planNorthDeg ?? 0)) * RAD
  // 方位角 B 在图上的方向:上(0,-1) 顺时针转 B → (sinB, -cosB)
  return { x: Math.sin(a), y: -Math.cos(a) }
}

/** @param {{x:number,y:number}[]} poly */
function signedArea(poly) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

/**
 * Sutherland–Hodgman:subject 裁进凸多边形 clip。凸裁剪框保证结果正确。
 * @param {{x:number,y:number}[]} subject
 * @param {{x:number,y:number}[]} clip 凸多边形,任意绕向
 */
function clipToConvex(subject, clip) {
  const sign = Math.sign(signedArea(clip))
  if (sign === 0) return []
  let out = subject
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const input = out
    out = []
    const inside = (/** @type {{x:number,y:number}} */ p) =>
      ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * sign >= 0
    for (let j = 0; j < input.length; j++) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      const pin = inside(p)
      const qin = inside(q)
      if (pin) out.push(p)
      if (pin !== qin) {
        // a-b 直线与 p-q 线段交点:p + t(q-p),由 cross(b-a, point-a) = 0 解 t
        const dx = b.x - a.x
        const dy = b.y - a.y
        const denom = dx * (q.y - p.y) - dy * (q.x - p.x)
        if (Math.abs(denom) > 1e-9) {
          const t = (dx * (a.y - p.y) - dy * (a.x - p.x)) / denom
          out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
        }
      }
    }
  }
  return out
}

/** 开口上沿高度(英尺)—— 光斑进深的分子。 */
function openingHeadFt(go) {
  return go.type === 'window' ? 7 : 6.67 // 推拉玻璃门 6'8"
}

/** 这个开口透光吗:窗都透,门只有推拉玻璃门透。 */
function translucent(go) {
  if (go.hidden) return false
  if (go.type === 'window') return true
  return go.type === 'door' && go.style === 'sliding'
}

/** 光斑最大进深(英尺):太阳贴地平线时不至于拉出无限长的光带。 */
const MAX_DEPTH_FT = 26

/**
 * 全部透光开口的光斑多边形(平面图 px 坐标)。
 * @param {import('./types.js').SpatialProject} project
 * @param {{ azimuthDeg: number, altitudeDeg: number, planNorthDeg: number | null }} sun
 * @returns {{ points: {x:number,y:number}[], low: boolean }[]}
 *   low = 低角度斜照(高度角 < 15°,配色更暖)
 */
export function sunLightPools(project, sun) {
  const graph = project.wallGraph
  if (!graph || sun.altitudeDeg <= 0.3) return []
  const openings = (project.graphOpenings ?? []).filter(translucent)
  if (!openings.length) return []

  const pxPerFt = graph.pxPerFt || 36
  const L = sunLightPlanDir(sun.azimuthDeg, sun.planNorthDeg)
  const tanAlt = Math.tan(sun.altitudeDeg * RAD)
  const low = sun.altitudeDeg < 15
  // 与铺地板同一套围合面(跨门洞搭桥),光斑不越出房间
  const faces = detectRooms(graph, { minSqFt: 4, bridgeGapIn: 60 })
  if (!faces.length) return []

  /** @type {{ points: {x:number,y:number}[], low: boolean }[]} */
  const pools = []
  for (const go of openings) {
    const b = graphOpeningBounds(graph, go)
    if (!b) continue
    const depthPx =
      Math.min(MAX_DEPTH_FT, openingHeadFt(go) / Math.max(tanAlt, 0.02)) *
      pxPerFt
    const dx = L.x * depthPx
    const dy = L.y * depthPx
    const quad = [
      b.p0,
      b.p1,
      { x: b.p1.x + dx, y: b.p1.y + dy },
      { x: b.p0.x + dx, y: b.p0.y + dy },
    ]
    if (Math.abs(signedArea(quad)) < 4) continue // 光线几乎平行于墙,没有光斑
    for (const face of faces) {
      const clipped = clipToConvex(face.polygon, quad)
      if (clipped.length >= 3 && Math.abs(signedArea(clipped)) > 4) {
        pools.push({ points: clipped, low })
      }
    }
  }
  return pools
}
