/**
 * 分步整理计划 —— 纯函数,无 AI、无 IO(node 单测直接跑)。
 *
 * 输入是三样已有的客观数据,不是让模型凭空编:
 * - **几何**(总是有):动线瓶颈、堵死的门、每区家具占地率 —— 见 circulation.js
 * - **VLM 状态**(跑过才有):机位照片认出的「杂乱/堆满」+ 看到的东西 —— 见 vlm.js
 * - **储物区**:每处存了多少件 —— storageZones
 *
 * 输出按「先腾地方、再归位、最后复扫对比」的顺序排,每步带区域/耗时/物品/
 * 推荐去处/整理前照片。没跑过 VLM 时只出几何类任务,并提示去认一遍房间状态。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */

/** 任务优先级:数越小越先做 */
const P = {
  blockedDoor: 0,
  bottleneck: 1,
  overflow: 2, // 堆满
  messy: 3, // 杂乱
  storage: 4,
  rescan: 9,
}

/**
 * 体力档。挪家具和收桌面是两回事:累的时候给一屋子「搬柜子」,
 * 结果就是一件也不做。
 * @typedef {'light' | 'medium' | 'heavy'} Effort
 */
const EFFORT = /** @type {Record<string, Effort>} */ ({
  blockedDoor: 'heavy', // 得搬动挡路的家具
  bottleneck: 'heavy',
  overflow: 'medium', // 弯腰、分类、来回走
  messy: 'light', // 收表面、归位
  storage: 'medium',
  rescan: 'light',
})

const EFFORT_RANK = { light: 1, medium: 2, heavy: 3 }

export const EFFORT_LABEL = /** @type {const} */ ({
  light: '轻',
  medium: '中',
  heavy: '重',
})

/**
 * 物品关键词 → 该去哪类家具。命中后按「就近」原则挑同区/最近的那件。
 * 关键词取自 VLM 的 items 输出(中文短词,≤12 字)。
 */
const HOMES = [
  // 容器类先匹配:「纸箱」是箱子不是文件,先撞上「纸」就会被送去书架
  { match: ['箱', '盒', '袋', '杂物'], kinds: ['cabinet', 'shelf', 'wire_rack'], zh: '储物柜' },
  { match: ['衣', '裤', '外套', '袜'], kinds: ['wardrobe', 'dresser', 'cabinet'], zh: '衣柜/五斗柜' },
  { match: ['书', '杂志', '文件'], kinds: ['bookshelf', 'shelf', 'desk'], zh: '书架' },
  { match: ['电脑', '键盘', '鼠标', '充电', '数据线', '耳机'], kinds: ['desk', 'standing_desk', 'cabinet'], zh: '办公桌附近' },
  { match: ['碗', '盘', '锅', '杯', '食材', '调料'], kinds: ['base_cabinet', 'wall_cabinet', 'island', 'cabinet'], zh: '厨柜' },
  { match: ['毛巾', '洗发', '沐浴', '牙'], kinds: ['vanity', 'cabinet', 'shelf'], zh: '洗手台下' },
  { match: ['鞋'], kinds: ['shoe_cabinet', 'cabinet'], zh: '鞋柜' },
  { match: ['玩具', '宠物', '猫', '狗'], kinds: ['pet_pen', 'cabinet', 'shelf'], zh: '宠物用品区' },
]

const center = (o) => {
  const b = o.bounds ?? o
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/**
 * 给一件物品找去处:先按关键词定家具类型,再在候选里挑离该机位最近的。
 * @returns {{ label: string, zh: string } | null}
 */
function suggestHome(itemName, project, from) {
  const rule = HOMES.find((h) => h.match.some((m) => itemName.includes(m)))
  if (!rule) return null
  const candidates = [
    ...(project.placements ?? []).filter((p) => rule.kinds.includes(p.kind)),
    ...(project.fixtures ?? []).filter((f) => rule.kinds.includes(f.kind)),
  ]
  if (!candidates.length) return { label: rule.zh, zh: rule.zh }
  let best = null
  let bestD = Infinity
  for (const c of candidates) {
    const cc = center(c)
    const d = Math.hypot(cc.x - from.x, cc.y - from.y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const zone = (project.zones ?? []).find((z) => z.id === best.zoneId)
  return {
    label: best.label ?? rule.zh,
    zh: zone ? `${zone.nameZh}的${best.label ?? rule.zh}` : (best.label ?? rule.zh),
  }
}

/** 分区面积(sqft),取 circulation 的统计 */
function zoneArea(stats, zoneId) {
  return stats.find((s) => s.zoneId === zoneId)?.areaSqft ?? 0
}

/**
 * 生成整理计划。
 * @param {SpatialProject} project
 * @param {ReturnType<import('./circulation.js').analyzeCirculation>} circ
 * @param {{ minutes?: number|null, effort?: Effort|null }} [opts] 今天有多少时间/多少力气
 * @returns {{
 *   tasks: Array<{
 *     id: string, title: string, priority: number, estMinutes: number,
 *     zoneId: string|null, zoneName: string|null, reason: string,
 *     steps: string[], items: string[], photoRef: string|null, kind: string,
 *     effort: Effort,
 *   }>,
 *   totalMinutes: number,
 *   summary: string,
 *   needsVlm: boolean,
 *   dropped: number,
 *   allCount: number,
 * }}
 */
export function buildTidyPlan(project, circ, opts = {}) {
  const tasks = []
  // 两种 layoutMode 的房间来源不同:扫描来的用 zones,手工 508 用 rooms。
  // 只认 zones 的话,508 上的任务全成了「整理这个区域」——人得自己猜是哪。
  const zonesById = Object.fromEntries(
    [...(project.zones ?? []), ...(project.rooms ?? [])].map((z) => [z.id, z]),
  )
  const viewpoints = project.viewpoints ?? []
  const stats = circ?.zoneStats ?? []

  // 1) 堵死的门 —— 安全与通行第一
  for (const d of circ?.blockedDoors ?? []) {
    tasks.push({
      id: `door-${d.id}`,
      kind: 'blockedDoor',
      title: '疏通被挡住的门',
      priority: P.blockedDoor,
      estMinutes: 10,
      zoneId: null,
      zoneName: null,
      reason: d.reason,
      steps: ['找出挡在门口的东西', '挪到不影响开合的位置', '确认门能完全打开'],
      items: [],
      photoRef: null,
    })
  }

  // 2) 走不进去的区 —— 和堵门一样是通行问题,得先解决
  for (const z of circ?.isolatedZones ?? []) {
    tasks.push({
      id: `isolated-${z.zoneId}`,
      kind: 'blockedDoor',
      title: `打通${z.nameZh}`,
      priority: P.blockedDoor,
      estMinutes: 20,
      zoneId: z.zoneId,
      zoneName: z.nameZh,
      reason: '从主通道走不进这个区域 —— 多半是家具把入口整个堵死了',
      steps: [
        '在平面图上看这个区域的入口在哪',
        '把堵在入口的家具挪开或转向',
        '确认能从客厅/走廊一路走进去',
      ],
      items: [],
      photoRef: null,
    })
  }

  // 3) 动线瓶颈 —— 通道窄到侧身才能过
  for (const b of circ?.bottlenecks ?? []) {
    if (b.widthIn >= 30) continue
    const tight = b.widthIn < 24
    // 说清楚挪哪件、挪多少 ——「把家具挪开」这种话,人站在屋里也不知道该动哪个
    const blockers = b.blockers ?? []
    const howto = blockers.length
      ? blockers.map((k) => `把「${k.label}」往边上挪 ${k.moveIn} 英寸(任挪一件即可)`)
      : ['看看是哪件家具/杂物卡住了通道', tight ? '把占道的家具挪开或换个朝向' : '把地面杂物清走']
    tasks.push({
      id: `flow-${b.zoneId ?? 'x'}-${Math.round(b.x)}`,
      kind: 'bottleneck',
      title: `拓宽${b.nameZh ?? ''}的通道`,
      priority: P.bottleneck,
      estMinutes: tight ? 20 : 10,
      zoneId: b.zoneId,
      zoneName: b.nameZh,
      reason: `此处只剩 ${b.widthIn} 英寸宽${tight ? '(不足 24in,得侧身挤)' : '(不足 30in,单人勉强)'}`,
      steps: [...howto, '目标:主通道 36 英寸、次通道至少 30 英寸'],
      items: [],
      photoRef: null,
    })
  }

  // 3) 按机位状态:VLM 认出的杂乱/堆满区
  /** @type {Map<string, { state: string, items: string[], photoRef: string|null, x: number, y: number }>} */
  const worst = new Map()
  for (const vp of viewpoints) {
    if (!vp.state || !vp.zoneId) continue
    const rank = { 堆满: 4, 杂乱: 3, 一般: 2, 整洁: 1, 空置: 0 }
    const prev = worst.get(vp.zoneId)
    if (!prev || (rank[vp.state] ?? 0) > (rank[prev.state] ?? 0)) {
      worst.set(vp.zoneId, {
        state: vp.state,
        items: vp.items ?? [],
        photoRef: vp.photoRef ?? null,
        x: vp.x,
        y: vp.y,
      })
    }
  }
  for (const [zoneId, info] of worst) {
    if (info.state !== '堆满' && info.state !== '杂乱') continue
    const zone = zonesById[zoneId]
    const area = zoneArea(stats, zoneId)
    const overflow = info.state === '堆满'
    const from = { x: info.x, y: info.y }
    const homes = info.items
      .map((it) => {
        const h = suggestHome(it, project, from)
        return h ? `${it} → ${h.zh}` : null
      })
      .filter(Boolean)
    tasks.push({
      id: `tidy-${zoneId}`,
      kind: overflow ? 'overflow' : 'messy',
      title: `整理${zone?.nameZh ?? '这个区域'}`,
      priority: overflow ? P.overflow : P.messy,
      estMinutes: Math.round((overflow ? 20 : 10) + area / (overflow ? 10 : 15)),
      zoneId,
      zoneName: zone?.nameZh ?? null,
      reason: `照片显示这里${info.state}${info.items.length ? `,主要是:${info.items.join('、')}` : ''}`,
      steps: [
        '先清空地面 —— 地面通了,后面才好铺开分类',
        info.items.length ? '把同类物品堆到一起(先分类,别急着放)' : '把散落的东西堆到一处分类',
        ...(homes.length ? homes.map((h) => `归位:${h}`) : ['按类别送回各自的柜子']),
        '拿不准归属的先进「临时箱」,别卡在这',
        '最后擦一遍台面/地面',
      ],
      items: info.items,
      photoRef: info.photoRef,
    })
  }

  // 4) 储物区:件数多的先梳理
  for (const sz of project.storageZones ?? []) {
    const n = sz.items?.length ?? 0
    if (n < 8) continue
    tasks.push({
      id: `storage-${sz.id}`,
      kind: 'storage',
      title: `梳理${sz.nameZh}`,
      priority: P.storage,
      estMinutes: Math.min(45, 5 + n * 2),
      zoneId: sz.zoneId ?? null,
      zoneName: zonesById[sz.zoneId]?.nameZh ?? sz.locationZh ?? null,
      reason: `这里记了 ${n} 件东西,已经到了容易找不着的量`,
      steps: [
        '全部取出,过一遍',
        '一年没用过的挑出来:送人/卖掉/扔掉',
        '常用的放在伸手可及的一层',
        '同类归同格,给格子贴个标签',
      ],
      items: (sz.items ?? []).slice(0, 6).map((i) => i.name),
      photoRef: null,
    })
  }

  // 5) 收尾:复扫对比(需求里的「重新扫描并对比整理结果」)
  if (tasks.length) {
    tasks.push({
      id: 'rescan',
      kind: 'rescan',
      title: '用 HomeScan 复扫一遍,对比前后',
      priority: P.rescan,
      estMinutes: 10,
      zoneId: null,
      zoneName: null,
      reason: '扫完在设置页拉取,新旧两版可以直接比对家具位置与状态变化',
      steps: ['拿 iPhone 逐间重扫', '每间补 2-3 张机位照片', '上传后回网页端拉取'],
      items: [],
      photoRef: null,
    })
  }

  for (const t of tasks) t.effort = EFFORT[t.kind] ?? 'medium'
  tasks.sort((a, b) => a.priority - b.priority || b.estMinutes - a.estMinutes)

  const all = tasks.slice()
  const picked = pickWithinBudget(tasks, opts)
  const totalMinutes = picked.reduce((s, t) => s + t.estMinutes, 0)
  const needsVlm = viewpoints.length > 0 && !viewpoints.some((v) => v.state)
  const dropped = all.length - picked.length

  let summary
  if (!all.length) {
    summary = circ?.ok
      ? '动线通畅,也没发现杂乱区 —— 暂时没什么要整的'
      : '数据不足:先扫描或画好分区'
  } else if (!picked.length) {
    // 光说「做不完」等于把人堵在门口 —— 告诉他差多少,好决定是挤时间还是改天
    const min = Math.min(...all.filter((t) => t.kind !== 'rescan').map((t) => t.estMinutes))
    summary = `这点时间做不完任何一项 —— 最短的也要 ${min} 分钟(共 ${all.length} 项待办)`
  } else {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    summary = `${picked.length} 项 · 约 ${h ? `${h} 小时 ` : ''}${m ? `${m} 分钟` : ''}`
    if (dropped) summary += ` · 另 ${dropped} 项留着下次`
  }
  return { tasks: picked, totalMinutes, summary, needsVlm, dropped, allCount: all.length }
}

/**
 * 按今天有多少时间/多少力气挑任务。
 *
 * 不是简单截断:**通行类**(堵门/瓶颈)再累也得先做 —— 门被堵着不是整洁问题,
 * 是每天都要绕的问题。其余按优先级塞进预算,塞不下的留着下次。
 * 复扫收尾只在真做了事情时才留。
 * @param {any[]} tasks 已按优先级排好
 * @param {{ minutes?: number|null, effort?: Effort|null }} opts
 */
function pickWithinBudget(tasks, opts = {}) {
  const budget = opts.minutes ?? null
  const cap = opts.effort ? EFFORT_RANK[opts.effort] : null
  if (!budget && !cap) return tasks

  const fits = (t) =>
    !cap || EFFORT_RANK[t.effort] <= cap || t.priority <= P.bottleneck

  const out = []
  let spent = 0
  for (const t of tasks) {
    if (t.kind === 'rescan') continue // 收尾任务最后单独议
    if (!fits(t)) continue
    if (budget && spent + t.estMinutes > budget) continue
    out.push(t)
    spent += t.estMinutes
  }
  const rescan = tasks.find((t) => t.kind === 'rescan')
  if (rescan && out.length && (!budget || spent + rescan.estMinutes <= budget)) {
    out.push(rescan)
  }
  return out
}
