/**
 * 双扫描融合 —— 同一个家的两次扫描互相印证,产出比任何单次都可信的家具清单
 * (纯函数,无 IO,node 单测直接跑)。
 *
 * 原理:RoomPlan 对扫得全的物体给 high/medium 置信度、尺寸稳定;扫不全时
 * 置信度掉级、包围盒乱抖(508 真扫:同一柜子两次差 65-181cm)。两次扫描
 * 很少在同一件上同时失手,所以:
 * - 配准(scan-register)把旧扫描刚性对齐到新扫描的坐标系
 * - 身份匹配(scan-identity)认出同一件
 * - **尺寸取置信度更高的一次**(同级取新);分歧 >10cm 记入 report
 * - 位置:两次都判「原位」时取中点(测量噪声 ÷√2),否则信新扫描
 * - 新扫描独有的保留;旧扫描独有的**不带入**(可能是误检,宁缺毋滥)
 *
 * 输出仍是标准 payload.homeos 形状,可直接写回 home.scans 当「优化副本」。
 */
import { registerScanToHome, wallSegments } from './scan-register.js'
import { matchScanObjects } from './scan-identity.js'

const RANK = { high: 3, medium: 2, low: 0 }
const rank = (o) => RANK[o?.attrs?.confidence] ?? 1
const DISAGREE_PX = 12 // 10cm≈11.8px,取整 4″

const boxOf = (o) => o.bounds ?? { x: o.x, y: o.y, w: o.w, h: o.h }

/** 用融合结果改写对象的几何(placement 与 fixture 形状不同) */
function withBox(o, box) {
  const r1 = (v) => Math.round(v * 10) / 10
  const b = { x: r1(box.x), y: r1(box.y), w: r1(box.w), h: r1(box.h) }
  return o.bounds ? { ...o, bounds: b } : { ...o, ...b }
}

/**
 * @param {any} baseHomeos 新扫描(坐标系基准,原样保留独有件)
 * @param {any} otherHomeos 旧扫描(印证来源)
 * @returns {{ homeos: any, report: {
 *   registration: any, fused: number, averaged: number, adopted: string[],
 * } }}
 */
export function fuseScans(baseHomeos, otherHomeos) {
  const homeos = JSON.parse(JSON.stringify(baseHomeos))
  const report = { registration: null, fused: 0, averaged: 0, adopted: [] }

  const reg = registerScanToHome(otherHomeos.wallGraph, wallSegments(baseHomeos.wallGraph))
  report.registration = {
    status: reg.status,
    yawDeg: reg.yawDeg,
    medianCm: reg.medianCm,
    p95Cm: reg.p95Cm,
    matchedWalls: reg.matchedWalls,
    reason: reg.reason,
  }
  if (reg.status !== 'ok') return { homeos, report } // 对不齐就不硬融

  /** 旧扫描对象 → 新扫描坐标系(尺寸保距,只旋转+平移) */
  const toBase = (o) => withBox(o, reg.applyBox(boxOf(o)))

  const fuseList = (baseList, otherList) => {
    const otherInBase = (otherList ?? []).map(toBase)
    const m = matchScanObjects(otherInBase, baseList ?? [])
    const otherById = Object.fromEntries(otherInBase.map((o) => [o.id, o]))
    const pairByNext = Object.fromEntries(m.pairs.map((p) => [p.nextId, p]))
    return (baseList ?? []).map((b) => {
      const pair = pairByNext[b.id]
      if (!pair || pair.state === 'possibly_same') return b
      const o = otherById[pair.prevId]
      let box = boxOf(b)
      let out = b

      // 尺寸:置信度更高的一次赢(同级取新);采信旧值时记录
      if (rank(o) > rank(b)) {
        const ob = boxOf(o)
        const disagree = Math.max(Math.abs(ob.w - box.w), Math.abs(ob.h - box.h)) > DISAGREE_PX
        const cx = box.x + box.w / 2
        const cy = box.y + box.h / 2
        box = { x: cx - ob.w / 2, y: cy - ob.h / 2, w: ob.w, h: ob.h }
        report.fused++
        if (disagree) {
          report.adopted.push(
            `「${b.label}」尺寸采用另一次扫描(${b.attrs?.confidence ?? '?'}→${o.attrs?.confidence})`,
          )
        }
        out = {
          ...out,
          attrs: {
            ...out.attrs,
            confidence: o.attrs?.confidence,
            measuredWIn: Math.round((box.w / 3) * 10) / 10,
            measuredHIn: Math.round((box.h / 3) * 10) / 10,
            ...(o.attrs?.heightIn != null ? { heightIn: o.attrs.heightIn } : {}),
          },
        }
      }

      // 位置:两次都在原位 → 取中点,把测量噪声砍半
      if (pair.state === 'same_unchanged') {
        const ob = boxOf(o)
        const cx = (box.x + box.w / 2 + ob.x + ob.w / 2) / 2
        const cy = (box.y + box.h / 2 + ob.y + ob.h / 2) / 2
        box = { ...box, x: cx - box.w / 2, y: cy - box.h / 2 }
        report.averaged++
      }
      return withBox(out, box)
    })
  }

  homeos.placements = fuseList(homeos.placements, otherHomeos.placements)
  homeos.fixtures = fuseList(homeos.fixtures, otherHomeos.fixtures)
  return { homeos, report }
}
