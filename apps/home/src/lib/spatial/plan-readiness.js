/**
 * 关系完整度门禁 —— 方案「几何上通过」之后,再回答一个不同的问题:
 * **用户设的家规,这套摆法到底照顾到没有?** 纯几何,无 IO(node 单测直接跑)。
 *
 * 分两类信号,语义严格区分:
 * - **provisional(数据不全)**:方案建立在缺失/失效的语义上,别当「已核实」发。
 *   目前一种:`dangling_relation` —— 家规的目标件已被删,这条约束在求解时被静默丢掉,
 *   用户设过的意图没进方案,必须说明。
 * - **unmet(尽力了没满足)**:家规有效、也算进了求解,但最优解仍没完全达到 ——
 *   这是 Pareto 取舍,不是数据问题,不降级 status,只如实附一句「还差多少」。
 *
 * 只评价**涉及被挪动件**的关系:两端都没动的关系属于现状,不该记在这套方案头上。
 * 尺寸置信度门禁(低置信度件被挪 → provisional)仍在 layout-solve.js,与此互补。
 */
import { PX_PER_IN } from './dimensions.js'

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 两个盒子的边到边间距(英寸;重叠/相邻为 0)—— 与 layout-solve 的 boxGapIn 同义,
 *  这里自带一份免得反向依赖求解器(plan-readiness 是被它调用的下游)。 */
function boxGapIn(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.hypot(dx, dy) / PX_PER_IN
}

/** 关系类型的人话动词 */
function relZh(rel) {
  return rel.zh ?? (rel.type === 'near' ? '靠近某件' : '远离某件')
}

/** 判定容差:6in ≈ 一个栅格,别为 1-2in 的量化误差报「没满足」 */
const TOL_IN = 6

/**
 * @param {SpatialProject} finalProject 方案摆法(placements 已是方案后的)
 * @param {Set<string>} movedIds 本方案挪动过的件 id
 * @returns {{
 *   provisionalReasons: Array<{ code: string, label: string, zh: string }>,
 *   unmetRelations: Array<{ label: string, targetLabel: string, type: string, gapIn: number, wantIn: number, zh: string }>,
 * }}
 */
export function assessRelationReadiness(finalProject, movedIds) {
  const placements = finalProject.placements ?? []
  const byId = new Map(placements.map((p) => [p.id, p]))
  /** @type {Array<{ code: string, label: string, zh: string }>} */
  const provisionalReasons = []
  /** @type {Array<{ label: string, targetLabel: string, type: string, gapIn: number, wantIn: number, zh: string }>} */
  const unmetRelations = []

  for (const pl of placements) {
    for (const rel of pl.relations ?? []) {
      const target = byId.get(rel.targetId)

      // dangling:目标件没了 —— 约束被丢,方案不完整。只在**这件被挪过**时提示
      // (它没动、目标也没了,那是既有悬空,不是这套方案造成的)。
      if (!target) {
        if (movedIds.has(pl.id)) {
          provisionalReasons.push({
            code: 'dangling_relation',
            label: pl.label,
            zh: `「${pl.label}」的家规「${relZh(rel)}」目标已不在,没算进这套方案`,
          })
        }
        continue
      }

      // 两端都没动 = 现状关系,不评价
      if (!movedIds.has(pl.id) && !movedIds.has(rel.targetId)) continue

      const gap = boxGapIn(pl, target)
      if (rel.type === 'near') {
        const hi = rel.gapIn?.[1] ?? 24
        if (gap > hi + TOL_IN) {
          unmetRelations.push({
            label: pl.label, targetLabel: target.label, type: 'near',
            gapIn: Math.round(gap), wantIn: hi,
            zh: `想让「${pl.label}」靠近「${target.label}」(≤${hi}in),方案里还差 ${Math.round(gap - hi)}in`,
          })
        }
      } else if (rel.type === 'far_from') {
        const min = rel.gapIn?.[0] ?? 72
        if (gap < min - TOL_IN) {
          unmetRelations.push({
            label: pl.label, targetLabel: target.label, type: 'far_from',
            gapIn: Math.round(gap), wantIn: min,
            zh: `想让「${pl.label}」远离「${target.label}」(≥${min}in),方案里只隔 ${Math.round(gap)}in`,
          })
        }
      }
    }
  }
  return { provisionalReasons, unmetRelations }
}
