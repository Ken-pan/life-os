/**
 * 扫描分区归一化 —— 分区必须尊重墙(和围栏隔断),纯几何、无 IO,node 单测直接跑。
 *
 * 为什么需要:iOS 扫描/云端优化副本的 zones 是按房间种子对地面就近瓜分出来的,
 * 多边形会斜穿墙体(508 实测:卧室分区斜插进走廊,卫生间横跨浴室+洗衣间+过道,
 * 平面图上一堆莫名其妙的斜缝)。这里在 payload → SpatialProject 的唯一咽喉
 * (buildProjectFromScan)上把它们对齐到墙图检测出的房间面:
 *
 * - 一个面被**唯一**分区实质认领(覆盖 ≥55%,次名 <20%)→ 分区多边形吸附成
 *   面多边形,从此天然贴墙。
 * - 认领不清的(开放大空间里厨房/餐区各占一角)→ 保留原多边形,这是用户域的
 *   功能划分,几何上没穿墙就不动。
 * - 归一化后仍明显跨面/出面的 → `stale: true`,走 UI 既有「待确认」流程
 *   (虚线描边 + 确认按钮),宁可提示也不静默保留穿墙分区。
 *
 * 覆盖率用 6″ 栅格采样(与 circulation.js 的 GRID_IN 同粒度),避免引入
 * 多边形布尔运算——这里要的是「谁主要占着这间屋」,不是精确面积。
 */

import { detectRooms } from './rooms-from-graph.js'
import { fenceDividerSegments } from './placements.js'
import { pointInPolygon, polygonBbox } from './zones.js'

/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').SpatialZone} SpatialZone */

/** 采样步长(英寸),对齐动线栅格粒度 */
const SAMPLE_IN = 6
/** 面被吸附所需的最低覆盖率 */
const CLAIM_MIN = 0.55
/** 次名分区超过它就算「共居」,不吸附(开放空间的功能划分要保留) */
const RUNNER_UP_MAX = 0.2
/** 分区落在单一面内的份额低于它 → 跨面/出面,标 stale */
const STRADDLE_MIN_SHARE = 0.8

/**
 * 多边形内部的栅格采样点。
 * @param {Point[]} polygon
 * @param {number} stepPx
 * @returns {Point[]}
 */
function samplePoints(polygon, stepPx) {
  if (!Array.isArray(polygon) || polygon.length < 3) return []
  const bbox = polygonBbox(polygon)
  /** @type {Point[]} */
  const pts = []
  // 从半步开始,避免采样点恰好压在边界上(pointInPolygon 边界行为不稳定)
  for (let y = bbox.y + stepPx / 2; y < bbox.y + bbox.h; y += stepPx) {
    for (let x = bbox.x + stepPx / 2; x < bbox.x + bbox.w; x += stepPx) {
      const pt = { x, y }
      if (pointInPolygon(pt, polygon)) pts.push(pt)
    }
  }
  return pts
}

/**
 * @param {{
 *   wallGraph: import('./types.js').WallGraph | null | undefined,
 *   zones: SpatialZone[] | undefined,
 *   placements?: import('./types.js').SpatialPlacement[],
 * }} project
 * @returns {{
 *   zones: SpatialZone[],
 *   report: { snapped: string[], flagged: string[] },
 * }} zones 永远可用(失败原样返回);report 供日志/测试断言
 */
export function normalizeScanZones(project) {
  /** @type {{ snapped: string[], flagged: string[] }} */
  const report = { snapped: [], flagged: [] }
  const zones = project?.zones ?? []
  const graph = project?.wallGraph
  if (!graph?.edges?.length || zones.length === 0) return { zones, report }

  const pxPerFt = graph.pxPerFt || 36
  const rooms = detectRooms(graph, {
    extraSegments: fenceDividerSegments(project.placements ?? [], pxPerFt),
  })
  if (!rooms.length) return { zones, report }

  const stepPx = (SAMPLE_IN / 12) * pxPerFt

  // ---- 面视角:每个面被各分区覆盖多少 ----
  const faceStats = rooms.map((room) => {
    const pts = samplePoints(room.polygon, stepPx)
    /** @type {Map<string, number>} */
    const byZone = new Map()
    for (const pt of pts) {
      for (const z of zones) {
        if (z.polygon?.length >= 3 && pointInPolygon(pt, z.polygon)) {
          byZone.set(z.id, (byZone.get(z.id) ?? 0) + 1)
        }
      }
    }
    return { room, total: pts.length, byZone }
  })

  // ---- 唯一实质认领 → 候选吸附对;一个分区可能认领多个面(旧卫生间横跨
  // 浴室+洗衣间),只吸到自己覆盖面积最大的那个,其余面宁可无分区 ----
  /** @type {Map<string, { polygon: Point[], areaSqFt: number }>} */
  const zoneFace = new Map()
  for (const fs of faceStats) {
    if (!fs.total) continue
    const ranked = [...fs.byZone.entries()]
      .map(([id, n]) => ({ id, cov: n / fs.total }))
      .sort((a, b) => b.cov - a.cov)
    if (!ranked.length) continue
    if (ranked[0].cov < CLAIM_MIN || (ranked[1]?.cov ?? 0) >= RUNNER_UP_MAX) continue
    const prev = zoneFace.get(ranked[0].id)
    if (!prev || fs.room.areaSqFt > prev.areaSqFt) zoneFace.set(ranked[0].id, fs.room)
  }

  // ---- 吸附 / 跨面标记 ----
  const out = zones.map((z) => {
    const face = zoneFace.get(z.id)
    if (face) {
      report.snapped.push(z.nameZh ?? z.id)
      return {
        ...z,
        polygon: face.polygon.map((p) => ({ x: p.x, y: p.y })),
        stale: false,
      }
    }
    // 没吸附成的:看它自己的地盘落在哪 —— 大头不在任何单一面内就是穿墙/跨面
    const pts = samplePoints(z.polygon ?? [], stepPx)
    if (!pts.length) return z
    let best = 0
    for (const fs of faceStats) {
      let n = 0
      for (const pt of pts) if (pointInPolygon(pt, fs.room.polygon)) n++
      if (n > best) best = n
    }
    if (best / pts.length < STRADDLE_MIN_SHARE) {
      report.flagged.push(z.nameZh ?? z.id)
      return { ...z, stale: true }
    }
    return z
  })

  return { zones: out, report }
}
