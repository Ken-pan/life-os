/**
 * wallGraph → 轴对齐墙段 —— 配准(scan-register)、墙锚点(wall-anchor)、
 * 布局求解共用的**同一份**提取逻辑。此前两处各写一份,阈值一致纯属自觉;
 * 现在收敛到这里,形状是全库通用币:
 *   { edgeId, vertical, at, lo, hi, len }
 *   vertical=true:x=at 恒定,y 从 lo 到 hi。
 * 零依赖:只读 { vertices, edges } 的普通对象形状。
 */

/** 端点偏轴容差(px):双方都做过主方向拉直,超过它的是斜墙/噪声,不参与 */
const AXIS_TOL_PX = 1.5
/** 短于它(px)的碎段不要 */
const MIN_LEN_PX = 1

/**
 * @param {{ vertices?: Array<{id: string, x: number, y: number}>, edges?: Array<{id: string, a: string, b: string}> } | null | undefined} wallGraph
 * @returns {Array<{ edgeId: string, vertical: boolean, at: number, lo: number, hi: number, len: number }>}
 */
export function wallGraphSegments(wallGraph) {
  const byId = Object.fromEntries((wallGraph?.vertices ?? []).map((v) => [v.id, v]))
  const out = []
  for (const e of wallGraph?.edges ?? []) {
    const a = byId[e.a]
    const b = byId[e.b]
    if (!a || !b) continue
    if (Math.abs(a.x - b.x) < AXIS_TOL_PX) {
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      if (hi - lo > MIN_LEN_PX) {
        out.push({ edgeId: e.id, vertical: true, at: a.x, lo, hi, len: hi - lo })
      }
    } else if (Math.abs(a.y - b.y) < AXIS_TOL_PX) {
      const lo = Math.min(a.x, b.x)
      const hi = Math.max(a.x, b.x)
      if (hi - lo > MIN_LEN_PX) {
        out.push({ edgeId: e.id, vertical: false, at: a.y, lo, hi, len: hi - lo })
      }
    }
  }
  return out
}
