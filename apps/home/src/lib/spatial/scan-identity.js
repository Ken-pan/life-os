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
import { hammingHex, HASH_SAME_MAX, HASH_DIFF_MIN } from './photo-hash.js'

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
 *
 * wall_cabinet 属 cabinet 族:RoomPlan 只认得 storage(→cabinet),吊柜
 * 是服务端/用户精化出来的 kind —— 2026-07-15 真扫实测,扫描「柜」
 * (3.0×1.3ft,elevIn 69.5)与权威「冰箱顶吊柜」(wall_cabinet,2.9×1.4ft,
 * elevIn 66)明明是同一件,却被跨族一票否决拆散。
 * ⚠️ iOS 端 ScanIdentity.swift 的 kindFamily 由另一并行会话同步镜像,
 * 改这里必须同步改那边(本会话不动任何 Swift 文件)。
 */
const KIND_FAMILY = [
  ['chair', 'office_chair'],
  ['sofa', 'armchair'],
  ['table', 'coffee_table'],
  // 储物族:wire_rack/cube_shelf/utility_cart/equipment_rack 都是服务端/用户
  // 精化 kind,RoomPlan 只会给 storage(→cabinet)或 shelf —— 2026-07-16 真扫
  // 实测三件(拉篮架←cabinet、工作八格架←shelf+cabinet)全被跨族一票否决拆散。
  // pet_crate 不入族:它的误检形态是 table(顶面木板),跨语义太远,走 scanAliases。
  ['cabinet', 'shelf', 'wall_cabinet', 'wire_rack', 'cube_shelf', 'utility_cart', 'equipment_rack'],
]
const familyOf = (kind) => KIND_FAMILY.find((f) => f.includes(kind))
const CROSS_KIND_PENALTY = 0.05

/**
 * 高度带(attrs.elevIn,离地安装高度,英寸;平面 px 换算 36px/ft=3px/in):
 * 同尺寸的吊柜和落地柜在俯视图里长得一模一样,只有安装高度分得开它们。
 * 真实锚点(2026-07-15 真扫 vs 权威副本 v16):
 * - 冰箱顶吊柜 elevIn 66 vs 扫描 69.5,差 3.5″ ≤6″ → 加分,必须认亲;
 * - 12.3ft 巨柜(elevIn 54.8)vs 落地柜(缺 elevIn 视为落地 0,差 54.8″
 *   >18″)→ 罚分,不得因高度项攀亲。
 * 6″ 容 RoomPlan 对包围盒底沿的重复测量抖动;>18″ 已跨半个身位,
 * 只可能是安装高度真不同的两件。加分只给**双方都实测过** elevIn 的
 * (双方都缺 = 都默认落地,不算证据,否则全场落地家具白涨 0.1 分)。
 * ⚠️ 与 iOS ScanIdentity.swift 的约定,一字不差:
 * 加分 +0.1、罚分 -0.15、阈值 6″/18″、缺省视为 0。
 */
const ELEV_SAME_MAX_IN = 6
const ELEV_DIFF_MIN_IN = 18
const ELEV_BONUS = 0.1
const ELEV_PENALTY = -0.15

/** 高度带评分项(见上方常数注释;返回 ELEV_BONUS / ELEV_PENALTY / 0) */
function elevScore(a, b) {
  const ea = a?.attrs?.elevIn
  const eb = b?.attrs?.elevIn
  if (ea == null && eb == null) return 0 // 都没实测:默认都落地,不算证据
  const d = Math.abs((ea ?? 0) - (eb ?? 0)) // 一方缺 elevIn 视为落地 0
  if (d > ELEV_DIFF_MIN_IN) return ELEV_PENALTY
  if (ea != null && eb != null && d <= ELEV_SAME_MAX_IN) return ELEV_BONUS
  return 0
}

/**
 * 用户纠正的一等数据(attrs.scanAliases,与 iOS 端字段名完全一致):
 * 「扫描惯把这件误检成哪些 kind」。真实案例:鸟笼(bird_cage)每轮都被
 * RoomPlan 认成冰箱/电视,用户 v16 就纠正过,但纠正只活在 scanWarnings
 * 文字里,匹配器读不到,每轮重犯。scan kind ∈ prev 的 aliases 时视同
 * 同 kind 参与打分 —— 不吃跨族否决、不吃 CROSS_KIND_PENALTY。
 */
const aliasHit = (prev, next) =>
  Array.isArray(prev?.attrs?.scanAliases) && prev.attrs.scanAliases.includes(next.kind)

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

/**
 * 外观项(照片 dHash,attrs.photoHash,网页端拉取时算好):
 * RoomPlan 对扫不全的柜子包围盒抖 7-28in,尺寸+位置分把同一件拆成
 * 「消失+新增」 —— 但两次扫描里它的照片长得一样,靠这项认回来。
 * 强像加大分;明显不像只轻罚(拍摄方位/光照会抬升汉明距离,不一票否决)。
 */
function hashBonus(a, b) {
  const d = hammingHex(a?.attrs?.photoHash, b?.attrs?.photoHash)
  if (d === null) return 0
  if (d <= HASH_SAME_MAX) return 0.2
  if (d >= HASH_DIFF_MIN) return -0.1
  return 0
}

/**
 * 0..1+bonuses;kind 不同但同族(样式精化翻转)可匹配,跨族一票否决。
 * prev 的 scanAliases 命中 next.kind 时视同同 kind(用户纠正 > 扫描惯性误检)。
 */
function matchScore(prev, next) {
  let penalty = 0
  if (prev.kind !== next.kind && !aliasHit(prev, next)) {
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
  // 锁定件(用户确认过几何)免尺寸一票否决:合并时它反正不吃扫描几何,
  // 该让位置+照片说话 —— 2026-07-16 真扫,折叠长桌(锁定 6ft)因桌下纸箱
  // 遮挡量得 3.9ft 被 REJECT。仅免否决不抬分:sizeScore 照公式可为 0。
  if (sd > sizeLimit * 2 && prev.attrs?.identityLocked !== true) return 0
  const sizeScore = Math.max(0, 1 - sd / sizeLimit)
  const ca = centerOf(prev)
  const cb = centerOf(next)
  const d = Math.hypot(ca.x - cb.x, ca.y - cb.y)
  const posScore = Math.max(0, 1 - d / DIST_NORM_PX)
  let bonus = 0
  const cd = colorDist(prev, next)
  if (cd !== null && cd <= 60) bonus += 0.15
  if (prev.attrs?.styleZh && prev.attrs.styleZh === next.attrs?.styleZh) bonus += 0.1
  bonus += hashBonus(prev, next)
  bonus += elevScore(prev, next)
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
