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
 * @returns {{
 *   tasks: Array<{
 *     id: string, title: string, priority: number, estMinutes: number,
 *     zoneId: string|null, zoneName: string|null, reason: string,
 *     steps: string[], items: string[], photoRef: string|null, kind: string,
 *   }>,
 *   totalMinutes: number,
 *   summary: string,
 *   needsVlm: boolean,
 * }}
 */
export function buildTidyPlan(project, circ) {
  const tasks = []
  const zonesById = Object.fromEntries((project.zones ?? []).map((z) => [z.id, z]))
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

  // 2) 动线瓶颈 —— 通道窄到侧身才能过
  for (const b of circ?.bottlenecks ?? []) {
    if (b.widthIn >= 30) continue
    const tight = b.widthIn < 24
    tasks.push({
      id: `flow-${b.zoneId ?? 'x'}-${Math.round(b.x)}`,
      kind: 'bottleneck',
      title: `拓宽${b.nameZh ?? ''}的通道`,
      priority: P.bottleneck,
      estMinutes: tight ? 20 : 10,
      zoneId: b.zoneId,
      zoneName: b.nameZh,
      reason: `此处只剩 ${b.widthIn} 英寸宽${tight ? '(不足 24in,得侧身挤)' : '(不足 30in,单人勉强)'}`,
      steps: [
        '看看是哪件家具/杂物卡住了通道',
        tight ? '把占道的家具挪开或换个朝向' : '把地面杂物清走',
        '目标:主通道 36 英寸、次通道至少 30 英寸',
      ],
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

  tasks.sort((a, b) => a.priority - b.priority || b.estMinutes - a.estMinutes)
  const totalMinutes = tasks.reduce((s, t) => s + t.estMinutes, 0)
  const needsVlm = viewpoints.length > 0 && !viewpoints.some((v) => v.state)

  let summary
  if (!tasks.length) {
    summary = circ?.ok
      ? '动线通畅,也没发现杂乱区 —— 暂时没什么要整的'
      : '数据不足:先扫描或画好分区'
  } else {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    summary = `${tasks.length} 项 · 预计 ${h ? `${h} 小时 ` : ''}${m} 分钟`
  }
  return { tasks, totalMinutes, summary, needsVlm }
}
