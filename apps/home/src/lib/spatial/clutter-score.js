/**
 * 可计算的杂乱指数 —— 「哪里最乱」不靠 VLM 凭感觉,由可解释指标合成
 * (纯函数,无 IO,node 单测直接跑)。
 *
 * 两半:
 * - **几何**(总是有,满分 40):家具占地、通道紧张、动线受阻 —— LiDAR 量得出来的东西。
 * - **现场**(认过照片才有,满分 60):垃圾/碗筷/衣物、台面堆积、地面杂物、地面脏污、
 *   收纳凌乱 —— 见 vlm.js OBSERVATION_AXES。
 *
 * ⚠️ 几何是**看不见杂物的**。一张堆满碗筷的餐桌和一张空餐桌,LiDAR 量出来一模一样:
 * 都是「一件 60×36 的桌子」。地板落灰、桌上堆纸、柜里塞爆 —— 占地率一个字都不会变。
 * 所以没认过照片的分区,分数只是「家具摆得挤不挤」,不是「乱不乱」。这就是为什么
 * 没跑过识别时必须把 `described:false` 一路带到 UI:那个数字回答的不是你问的问题。
 *
 * 现场这半为什么要分七轴而不是一个 `state`:一个词概括不了一间屋子,而整理计划要的
 * 恰恰是被这个词抹掉的区别 —— 脏和乱是两根轴(地面很空但落灰:要拖地,不是要收纳),
 * 台面和地面是两个动作,垃圾碗筷是卫生隐患要最先清。详见 vlm.js OBSERVATION_AXES。
 *
 * 堵门是全屋级问题(门属于两个区),单独列出不摊进分区分数。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 老数据的五档状态 → 严重度。仅用于**退化**:见 axesOf。 */
const STATE_SEVERITY = { 堆满: 1, 杂乱: 0.7, 一般: 0.25, 整洁: 0, 空置: 0 }
/** 走廊都该有的宽度(in);低于它的瓶颈开始计严重度 */
const COMFORT_IN = 36
const TIGHT_IN = 24

/**
 * 各轴权重。几何 40 + 现场 60 = 100。
 *
 * 现场压过几何是**故意的**:家具摆得挤是「这屋子小」,不是「这屋子乱」——
 * 前者今天整理解决不了,后者才是这个页面存在的理由。
 */
const W = {
  density: 18,
  tight: 9,
  route: 13,
  hygiene: 16, // 垃圾 + 碗筷 + 衣物:卫生隐患,最该先清
  surfaces: 14,
  floorClutter: 14,
  floorDirt: 10,
  storageMess: 6,
}
const GEOM_TOTAL = W.density + W.tight + W.route

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const round1 = (v) => Math.round(v * 10) / 10
/** 0–3 档 → 0–1 严重度 */
const lv = (v) => clamp01((Number(v) || 0) / 3)

const LEVEL_ZH = ['没有', '少量', '较多', '很多']

/**
 * 取一个机位的分轴观察。
 *
 * 老数据只有 `state`(五档)、没有 observations —— 那时候的识别根本没问过脏污。
 * 退化时**只**还原「乱」那几轴,`floorDirt` 一律留空:从「杂乱」推出「地板脏」是
 * 凭空编数据。两件事没有因果 —— 屋子可以又整齐又落灰。宁可标 legacy 让人重跑一次。
 *
 * @param {any} vp
 * @returns {{ axes: Record<string, number>, legacy: boolean } | null}
 */
function axesOf(vp) {
  const obs = vp?.observations
  if (obs && typeof obs === 'object' && Object.keys(obs).length) {
    return { axes: obs, legacy: false, state: vp.state ?? '' }
  }
  if (!vp?.state) return null
  const sev = STATE_SEVERITY[vp.state] ?? 0.25
  const n = Math.round(sev * 3)
  // 五档说的全是「占没占地方」,所以只还原堆积类;脏污/卫生无从得知,留 0 并标 legacy
  return { axes: { surfaces: n, floorClutter: n }, legacy: true, state: vp.state }
}

/**
 * @param {SpatialProject} project
 * @param {ReturnType<import('./circulation.js').analyzeCirculation>} circ
 * @returns {{
 *   zones: Array<{
 *     zoneId: string, nameZh: string, score: number,
 *     parts: Array<{ key: string, label: string, score: number, detail: string }>,
 *     described: boolean, legacy: boolean,
 *   }>,
 *   blockedDoors: Array<{ id: string, reason: string }>,
 *   worst: { zoneId: string, nameZh: string, score: number } | null,
 *   describedCount: number,
 *   zoneCount: number,
 * }}
 */
export function scoreClutter(project, circ) {
  if (!circ?.ok) {
    return { zones: [], blockedDoors: [], worst: null, describedCount: 0, zoneCount: 0 }
  }

  // 每区最新的观察(以 describedAt 最新的机位为准)
  /** @type {Record<string, { axes: Record<string, number>, legacy: boolean, items: string[], at: string }>} */
  const seenByZone = {}
  for (const vp of project.viewpoints ?? []) {
    if (!vp.zoneId) continue
    const got = axesOf(vp)
    if (!got) continue
    const cur = seenByZone[vp.zoneId]
    if (!cur || (vp.describedAt ?? '') > (cur.at ?? '')) {
      seenByZone[vp.zoneId] = {
        axes: got.axes,
        legacy: got.legacy,
        state: got.state,
        items: vp.items ?? [],
        at: vp.describedAt ?? '',
      }
    }
  }

  const zones = (circ.zoneStats ?? []).map((z) => {
    /** @type {Array<{ key: string, label: string, score: number, detail: string }>} */
    const parts = []

    // —— 几何(总是有)——
    // 家具占地率:0.15 以下不扣分,0.6 以上拉满
    const density = clamp01(((z.usedRatio ?? 0) - 0.15) / 0.45)
    parts.push({
      key: 'density',
      label: '家具占地',
      score: round1(density * W.density),
      detail: `地面 ${Math.round((z.usedRatio ?? 0) * 100)}% 被家具占用`,
    })

    const tight = clamp01(z.tightRatio ?? 0)
    parts.push({
      key: 'tight',
      label: '通道紧张',
      score: round1(tight * W.tight),
      detail: `可走区域里 ${Math.round(tight * 100)}% 勉强过人`,
    })

    const bns = (circ.bottlenecks ?? []).filter((b) => b.zoneId === z.zoneId)
    const minW = bns.length ? Math.min(...bns.map((b) => b.widthIn)) : null
    const routeSeverity =
      minW == null ? 0 : clamp01((COMFORT_IN - minW) / (COMFORT_IN - TIGHT_IN))
    parts.push({
      key: 'route',
      label: '动线受阻',
      score: round1(routeSeverity * W.route),
      detail: minW == null ? '无瓶颈' : `最窄处仅 ${minW}″`,
    })

    // —— 现场(认过才有)——
    const seen = seenByZone[z.zoneId]
    const described = Boolean(seen)
    const a = seen?.axes ?? {}
    if (described) {
      // 卫生:三件里最重的那件说了算 —— 一地垃圾不该被「没有衣物」平均掉
      const hygiene = Math.max(lv(a.trash), lv(a.dishes), lv(a.laundry))
      const bits = []
      if ((a.trash ?? 0) > 0) bits.push(`垃圾${LEVEL_ZH[a.trash]}`)
      if ((a.dishes ?? 0) > 0) bits.push(`碗筷${LEVEL_ZH[a.dishes]}`)
      if ((a.laundry ?? 0) > 0) bits.push(`衣物${LEVEL_ZH[a.laundry]}`)
      parts.push({
        key: 'hygiene',
        label: '垃圾碗筷',
        score: round1(hygiene * W.hygiene),
        detail: bits.length ? bits.join('、') : '没看到垃圾碗筷',
      })
      // 旧数据的分轴是从五档退化来的 —— 理由里点明原状态词,别让人以为系统真去看过台面
      const from = seen.legacy ? `旧版识别为「${seen.state}」,据此估` : ''
      parts.push({
        key: 'surfaces',
        label: '台面堆积',
        score: round1(lv(a.surfaces) * W.surfaces),
        detail: `${from}桌面/台面堆积:${LEVEL_ZH[a.surfaces ?? 0]}`,
      })
      parts.push({
        key: 'floorClutter',
        label: '地面杂物',
        score: round1(lv(a.floorClutter) * W.floorClutter),
        detail: `${from}地上堆放:${LEVEL_ZH[a.floorClutter ?? 0]}`,
      })
      // 脏污单列 —— 它跟上面三轴没有因果:屋子可以又整齐又落灰
      parts.push({
        key: 'floorDirt',
        label: '地面脏污',
        score: round1(lv(a.floorDirt) * W.floorDirt),
        detail: seen.legacy
          ? '旧版识别没看过脏污 —— 重跑一次才有'
          : `灰尘/毛发/污渍:${LEVEL_ZH[a.floorDirt ?? 0]}`,
      })
      parts.push({
        key: 'storageMess',
        label: '收纳凌乱',
        score: round1(lv(a.storageMess) * W.storageMess),
        detail: seen.legacy
          ? '旧版识别没看过柜子'
          : `柜子/架子上:${LEVEL_ZH[a.storageMess ?? 0]}`,
      })
    }

    let score = parts.reduce((s, p) => s + p.score, 0)
    // 没认过:几何三项按比例放大到 100,别让盲区显得干净。
    // ⚠️ 这是**外推**不是测量 —— described:false 必须一路带到 UI,否则这个数字
    // 会被当成「这屋子的整洁度」,而它其实只回答了「家具摆得挤不挤」。
    if (!described) score = (score / GEOM_TOTAL) * 100

    return {
      zoneId: z.zoneId,
      nameZh: z.nameZh,
      score: Math.min(100, Math.round(score)),
      parts,
      described,
      legacy: Boolean(seen?.legacy),
    }
  })

  zones.sort((a, b) => b.score - a.score)
  return {
    zones,
    blockedDoors: circ.blockedDoors ?? [],
    worst: zones.length
      ? { zoneId: zones[0].zoneId, nameZh: zones[0].nameZh, score: zones[0].score }
      : null,
    describedCount: zones.filter((z) => z.described).length,
    zoneCount: zones.length,
  }
}
