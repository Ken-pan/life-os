/**
 * 可计算的杂乱指数 —— 「哪里最乱」不靠 VLM 凭感觉,由可解释指标合成
 * (纯函数,无 IO,node 单测直接跑)。
 *
 * 每个分区四个来源,各自有人话理由,加权成 0-100:
 * - 家具占地率(几何,总是有):地面被家具吃掉的比例 —— 权重 30
 * - 紧张通道比(几何):可走区域里「勉强过人」的占比 —— 权重 15
 * - 动线问题(几何):本区瓶颈的严重程度(越窄越重) —— 权重 20
 * - 房间状态(VLM,认过才有):机位照片认出的 堆满/杂乱/一般 —— 权重 35;
 *   没认过时把几何三项按比例放大,不让「没拍照」显得比「拍了很乱」干净
 *
 * 堵门是全屋级问题(门属于两个区),单独列出不摊进分区分数。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

const STATE_SEVERITY = { 堆满: 1, 杂乱: 0.7, 一般: 0.25, 整洁: 0, 空置: 0 }
/** 走廊都该有的宽度(in);低于它的瓶颈开始计严重度 */
const COMFORT_IN = 36
const TIGHT_IN = 24

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const round1 = (v) => Math.round(v * 10) / 10

/**
 * @param {SpatialProject} project
 * @param {ReturnType<import('./circulation.js').analyzeCirculation>} circ
 * @returns {{
 *   zones: Array<{
 *     zoneId: string, nameZh: string, score: number,
 *     parts: Array<{ key: string, label: string, score: number, detail: string }>,
 *     described: boolean,
 *   }>,
 *   blockedDoors: Array<{ id: string, reason: string }>,
 *   worst: { zoneId: string, nameZh: string, score: number } | null,
 * }}
 */
export function scoreClutter(project, circ) {
  if (!circ?.ok) return { zones: [], blockedDoors: [], worst: null }

  // 每区最新的 VLM 状态(以 describedAt 最新的机位为准)
  /** @type {Record<string, { state: string, items: string[] }>} */
  const vlmByZone = {}
  for (const vp of project.viewpoints ?? []) {
    if (!vp.zoneId || !vp.state) continue
    const cur = vlmByZone[vp.zoneId]
    if (!cur || (vp.describedAt ?? '') > (cur.at ?? '')) {
      vlmByZone[vp.zoneId] = { state: vp.state, items: vp.items ?? [], at: vp.describedAt }
    }
  }

  const zones = (circ.zoneStats ?? []).map((z) => {
    /** @type {Array<{ key: string, label: string, score: number, detail: string }>} */
    const parts = []

    // 家具占地率:0.15 以下不扣分,0.6 以上拉满
    const density = clamp01(((z.usedRatio ?? 0) - 0.15) / 0.45)
    parts.push({
      key: 'density',
      label: '家具占地',
      score: round1(density * 30),
      detail: `地面 ${Math.round((z.usedRatio ?? 0) * 100)}% 被家具占用`,
    })

    // 紧张通道比
    const tight = clamp01(z.tightRatio ?? 0)
    parts.push({
      key: 'tight',
      label: '通道紧张',
      score: round1(tight * 15),
      detail: `可走区域里 ${Math.round(tight * 100)}% 勉强过人`,
    })

    // 本区瓶颈:最窄那处离舒适线差多少
    const bns = (circ.bottlenecks ?? []).filter((b) => b.zoneId === z.zoneId)
    const minW = bns.length ? Math.min(...bns.map((b) => b.widthIn)) : null
    const routeSeverity =
      minW == null ? 0 : clamp01((COMFORT_IN - minW) / (COMFORT_IN - TIGHT_IN))
    parts.push({
      key: 'route',
      label: '动线受阻',
      score: round1(routeSeverity * 20),
      detail: minW == null ? '无瓶颈' : `最窄处仅 ${minW}″`,
    })

    // VLM 房间状态
    const vlm = vlmByZone[z.zoneId]
    const described = Boolean(vlm)
    const stateSeverity = vlm ? (STATE_SEVERITY[vlm.state] ?? 0.25) : 0
    if (described) {
      parts.push({
        key: 'state',
        label: '现场状态',
        score: round1(stateSeverity * 35),
        detail: `照片识别为「${vlm.state}」${vlm.items.length ? `,看到 ${vlm.items.slice(0, 3).join('、')}` : ''}`,
      })
    }

    let score = parts.reduce((s, p) => s + p.score, 0)
    // 没认过状态:几何三项(满分 65)按比例放大到 100,别让盲区显得干净
    if (!described) score = (score / 65) * 100

    return {
      zoneId: z.zoneId,
      nameZh: z.nameZh,
      score: Math.min(100, Math.round(score)),
      parts,
      described,
    }
  })

  zones.sort((a, b) => b.score - a.score)
  return {
    zones,
    blockedDoors: circ.blockedDoors ?? [],
    worst: zones.length
      ? { zoneId: zones[0].zoneId, nameZh: zones[0].nameZh, score: zones[0].score }
      : null,
  }
}
