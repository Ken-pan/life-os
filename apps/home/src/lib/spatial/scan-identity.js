/**
 * 跨扫描物体身份 —— 判断「这次扫描的沙发」和「上次扫描的沙发」是不是同一件
 * (纯函数,无 IO,node 单测直接跑)。
 *
 * 为什么必须有:RoomPlan 每次扫描的 identifier 都是新的,如果按 id 换血,
 * 用户在旧沙发上积累的一切(VLM 识别的材质颜色、储藏区绑定、习惯数据)
 * 每次重扫都会清零,系统永远学不会这个家。
 *
 * 匹配特征(都来自已有数据,不新增采集):kind、实测尺寸、配准后的位置、
 * 主色、样式。输出状态而不是硬合并:
 * - same_unchanged  同一件,没挪(≤6″)
 * - same_moved      同一件,真挪过(附距离 —— 这是「沙发向前挪了 18cm」的依据)
 * - possibly_same   证据不足以裁决(第二候选太接近)—— 保守当新件,但报出来
 * - new / removed   新增 / 消失
 */

/** 尺寸差在 4″ 或 15% 以内才可能是同一件(LiDAR 重复测量的正常抖动) */
const SIZE_TOL_PX = 12
const SIZE_TOL_RATIO = 0.15
/**
 * 低置信度物体的尺寸容差放大倍数。508 真扫实测:low 置信度柜子两次测量
 * 能差 7–28″(RoomPlan 对扫不全的物体包围盒极不稳定),按正常容差打分
 * 会把同一件柜子拆成「消失+新增」,用户积累全清零。
 */
const LOW_CONF_SIZE_FACTOR = 2.5
/** 位置评分的归一化距离:6ft(挪得再远,靠尺寸+外观仍可判同一件) */
const DIST_NORM_PX = 216
/** ≤10″ 视为没挪:低置信度包围盒的尺寸抖动会把中心推走半个差值 */
const UNMOVED_PX = 30
/** 总分门槛与「第二候选太接近」的歧义边距 */
const ACCEPT_SCORE = 0.5
const AMBIGUITY_MARGIN = 0.08

/**
 * 样式精化会翻 kind:同一把椅子这次认出 swivel → office_chair,下次样式
 * 属性没触发 → chair(508 真扫实测)。这些翻转都来自 KindMaps.applyStyle
 * 的固定映射,所以同族之间允许匹配(小罚分),跨族仍然一票否决。
 */
const KIND_FAMILY = [
  ['chair', 'office_chair'],
  ['sofa', 'armchair'],
  ['table', 'coffee_table'],
  ['cabinet', 'shelf'],
]
const familyOf = (kind) => KIND_FAMILY.find((f) => f.includes(kind))
const CROSS_KIND_PENALTY = 0.05

const boxOf = (o) => o.bounds ?? { x: o.x, y: o.y, w: o.w, h: o.h }
const centerOf = (o) => {
  const b = boxOf(o)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/** 忽略 90° 朝向差异的尺寸差(同一件家具可能被转着扫) */
function sizeDiff(a, b) {
  const A = boxOf(a)
  const B = boxOf(b)
  const direct = Math.max(Math.abs(A.w - B.w), Math.abs(A.h - B.h))
  const swapped = Math.max(Math.abs(A.w - B.h), Math.abs(A.h - B.w))
  return Math.min(direct, swapped)
}

function colorDist(a, b) {
  const pa = a?.attrs?.colorHex
  const pb = b?.attrs?.colorHex
  if (!pa || !pb) return null
  const va = [1, 3, 5].map((i) => parseInt(pa.slice(i, i + 2), 16))
  const vb = [1, 3, 5].map((i) => parseInt(pb.slice(i, i + 2), 16))
  return Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2])
}

/** 0..1+bonuses;kind 不同但同族(样式精化翻转)可匹配,跨族一票否决 */
function matchScore(prev, next) {
  let penalty = 0
  if (prev.kind !== next.kind) {
    const fam = familyOf(prev.kind)
    if (!fam || !fam.includes(next.kind)) return 0
    penalty = CROSS_KIND_PENALTY
  }
  const A = boxOf(prev)
  const sd = sizeDiff(prev, next)
  const lowConf =
    prev.attrs?.confidence === 'low' || next.attrs?.confidence === 'low'
  const sizeLimit =
    Math.max(SIZE_TOL_PX, SIZE_TOL_RATIO * Math.max(A.w, A.h)) *
    (lowConf ? LOW_CONF_SIZE_FACTOR : 1)
  if (sd > sizeLimit * 2) return 0
  const sizeScore = Math.max(0, 1 - sd / sizeLimit)
  const ca = centerOf(prev)
  const cb = centerOf(next)
  const d = Math.hypot(ca.x - cb.x, ca.y - cb.y)
  const posScore = Math.max(0, 1 - d / DIST_NORM_PX)
  let bonus = 0
  const cd = colorDist(prev, next)
  if (cd !== null && cd <= 60) bonus += 0.15
  if (prev.attrs?.styleZh && prev.attrs.styleZh === next.attrs?.styleZh) bonus += 0.1
  return 0.45 * sizeScore + 0.45 * posScore + bonus - penalty
}

/**
 * @typedef {'same_unchanged'|'same_moved'|'possibly_same'} PairState
 * @typedef {object} IdentityMatch
 * @property {Array<{ prevId: string, nextId: string, state: PairState, movedFt: number, score: number }>} pairs
 * @property {string[]} added 没匹配上任何旧件的新扫描件 id
 * @property {string[]} removed 没被任何新件匹配上的旧件 id(消失或漏扫)
 */

/**
 * 贪心最优配对(件数个位数到几十,不需要匈牙利)。
 * @param {any[]} prevList 上次的(placements 或 fixtures)
 * @param {any[]} nextList 这次扫描映射后的
 * @returns {IdentityMatch}
 */
export function matchScanObjects(prevList, nextList) {
  /** @type {Array<{ score: number, pi: number, ni: number }>} */
  const cands = []
  prevList.forEach((p, pi) => {
    nextList.forEach((n, ni) => {
      const score = matchScore(p, n)
      if (score >= ACCEPT_SCORE) cands.push({ score, pi, ni })
    })
  })
  cands.sort((a, b) => b.score - a.score)

  const usedP = new Set()
  const usedN = new Set()
  /** @type {IdentityMatch['pairs']} */
  const pairs = []
  for (const c of cands) {
    if (usedP.has(c.pi) || usedN.has(c.ni)) continue
    // 歧义检查:同一个新件的第二候选分数太接近 → 不敢认,保守当新件
    const rival = cands.find(
      (o) => o !== c && o.ni === c.ni && !usedP.has(o.pi) && c.score - o.score < AMBIGUITY_MARGIN,
    )
    usedP.add(c.pi)
    usedN.add(c.ni)
    const prev = prevList[c.pi]
    const next = nextList[c.ni]
    const ca = centerOf(prev)
    const cb = centerOf(next)
    const d = Math.hypot(ca.x - cb.x, ca.y - cb.y)
    pairs.push({
      prevId: prev.id,
      nextId: next.id,
      state: rival ? 'possibly_same' : d <= UNMOVED_PX ? 'same_unchanged' : 'same_moved',
      movedFt: Math.round((d / 36) * 10) / 10,
      score: Math.round(c.score * 100) / 100,
    })
  }
  return {
    pairs,
    added: nextList.filter((_, ni) => !usedN.has(ni)).map((n) => n.id),
    removed: prevList.filter((_, pi) => !usedP.has(pi)).map((p) => p.id),
  }
}
