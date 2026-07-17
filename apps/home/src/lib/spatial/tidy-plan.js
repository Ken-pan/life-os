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

import { canonicalPlacementKind } from './placements.js'
import { surfaceTypeOf } from './function-truth.js'

/**
 * 一个区里各表面的策略(规范 §1.3, 评审 B2)。台面整理任务据此**不一刀切要求清空**:
 * 固定设备站(带微波炉/InstantPot/蛋白粉的折叠桌)保留设备、只清无关外溢物;
 * 禁止储物面(炉灶/围栏顶)则一件不留。
 * @param {import('./types.js').SpatialProject} project
 * @param {string} zoneId
 * @returns {{ fixed: string[], prohibited: string[] }}
 */
function surfacesInZone(project, zoneId) {
  /** @type {string[]} */
  const fixed = []
  /** @type {string[]} */
  const prohibited = []
  for (const p of project.placements ?? []) {
    if (p.zoneId !== zoneId) continue
    const mode = surfaceTypeOf(p).mode
    if (mode === 'fixed-equipment') fixed.push(p.label)
    else if (mode === 'prohibited-storage') prohibited.push(p.label)
  }
  return { fixed, prohibited }
}

/**
 * 任务优先级:数越小越先做。
 *
 * 这个顺序**就是方法论**,不是随手排的:
 * - 通行(0-1)第一 —— 门被堵不是整洁问题,是每天都要绕的问题。
 * - 卫生(2)紧随 —— KC Davis 五件事法:垃圾/碗筷/衣物最先出屋,它们是卫生隐患,
 *   而且清起来最快、进度立刻看得见,可见进度本身就是继续下去的动力。
 * - 台面(3) → 地面杂物(4) → 归位(5-6):先腾出平面,才有地方铺开分类。
 * - 储物(7):柜子里的存量,属于「有空再说」那一档。
 * - **地面清洁(8)倒数第二** —— 保洁金律:地面永远最后。先扫地,等会儿收台面时
 *   灰和碎屑又落一地,等于白扫。这条排序是整个链路里最容易被写反的一条。
 * - 复扫(9)收尾。
 */
const P = {
  prep: -1, // 备好箱子和垃圾袋 —— 空手进屋就会开始「拿着一件东西满屋找地方放」
  blockedDoor: 0,
  bottleneck: 1,
  hygiene: 2, // 垃圾/碗筷/衣物
  surfaces: 3, // 台面堆积
  floorClutter: 4, // 地面杂物
  overflow: 5, // 堆满(泛化任务:只有老数据的 state 时才出)
  messy: 6, // 杂乱(同上)
  storage: 7,
  floorClean: 8, // 扫地/拖地 —— 必须在所有收拾之后
  rescan: 9,
}

/**
 * 体力档。挪家具和收桌面是两回事:累的时候给一屋子「搬柜子」,
 * 结果就是一件也不做。
 * @typedef {'light' | 'medium' | 'heavy'} Effort
 */
const EFFORT = /** @type {Record<string, Effort>} */ ({
  prep: 'light',
  blockedDoor: 'heavy', // 得搬动挡路的家具
  bottleneck: 'heavy',
  hygiene: 'light', // 装袋、端一趟 —— 最累的时候也做得动
  surfaces: 'light', // 站着收表面
  floorClutter: 'medium', // 弯腰、来回走
  overflow: 'medium',
  messy: 'light',
  storage: 'medium',
  floorClean: 'medium', // 扫+拖是体力活
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
/**
 * 物品关键词 → 该去哪类家具。
 *
 * `zone` 是**房间线索**,存在的理由是一条实测出来的荒谬建议:「归位:碗 → 桌下文件柜」。
 * 成因是 kinds 里的通用 `cabinet` —— 文件柜和厨房下柜都是 cabinet,而「就近」原则
 * 一算距离,离餐桌最近的正是桌下那个文件柜。碗当然不进文件柜。
 *
 * 所以带 zone 线索的规则**先把候选限制在对的房间里**,再在房间内就近;那个房间
 * 压根不存在时才退回全屋就近(公寓没有独立卫生间时,毛巾总得有个去处)。
 * 没有 zone 线索的(书、充电线)本来就没有固定房间,继续纯就近。
 */
const HOMES = [
  // 容器类先匹配:「纸箱」是箱子不是文件,先撞上「纸」就会被送去书架
  { match: ['箱', '盒', '袋', '杂物'], kinds: ['cabinet', 'shelf', 'wire_rack'], zh: '储物柜' },
  { match: ['衣', '裤', '外套', '袜'], kinds: ['wardrobe', 'dresser', 'cabinet'], zh: '衣柜/五斗柜', zone: /卧室|衣帽/ },
  { match: ['书', '杂志', '文件'], kinds: ['bookshelf', 'shelf', 'desk'], zh: '书架' },
  { match: ['电脑', '键盘', '鼠标', '充电', '数据线', '耳机'], kinds: ['desk', 'standing_desk', 'cabinet'], zh: '办公桌附近' },
  { match: ['碗', '盘', '锅', '杯', '食材', '调料'], kinds: ['base_cabinet', 'wall_cabinet', 'island', 'cabinet'], zh: '厨柜', zone: /厨房|餐/ },
  { match: ['毛巾', '洗发', '沐浴', '牙'], kinds: ['vanity', 'cabinet', 'shelf'], zh: '洗手台下', zone: /卫生|浴室|洗手/ },
  { match: ['鞋'], kinds: ['shoe_cabinet', 'cabinet'], zh: '鞋柜', zone: /玄关|门厅|入户/ },
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
  const zones = project.zones ?? []
  const all = [
    // 暂存(导入还没安家)的家具不算去处 —— 「把杂物归位到画布左上那个飘着的柜子」是句空话
    // kind 过别名再比:云端数据里的狗狗围栏是 pet_fence,不解析就永远配不上 pet_pen 规则
    ...(project.placements ?? []).filter(
      (p) => rule.kinds.includes(canonicalPlacementKind(p.kind)) && !p.attrs?.staged,
    ),
    ...(project.fixtures ?? []).filter((f) => rule.kinds.includes(canonicalPlacementKind(f.kind))),
  ]
  // 有房间线索就先按房间筛 —— 否则「就近」会把碗送进餐桌底下的文件柜(实测)。
  // 筛空了(这个家没有那种房间)才退回全屋就近,总比没有去处强。
  const zoneNameOf = (o) => zones.find((z) => z.id === o.zoneId)?.nameZh ?? ''
  const inZone = rule.zone ? all.filter((o) => rule.zone.test(zoneNameOf(o))) : []
  const candidates = inZone.length ? inZone : all
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
 *     steps: string[], doneWhen: string[], items: string[], photoRef: string|null, kind: string,
 *     effort: Effort,
 *     focus: { x: number, y: number, rect?: { x: number, y: number, w: number, h: number } } | null,
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

  // 1) 堵死的门 —— 安全与通行第一。
  // 必须点名是哪道门、被什么挡住(circulation 已经查好了):「疏通被挡住的门」
  // 这种话,人拿着任务在屋里转一圈都不知道看哪 —— 实测用户就是这么问回来的。
  for (const d of circ?.blockedDoors ?? []) {
    const blockers = d.blockers ?? []
    const howto = blockers.length
      ? blockers.map((b) =>
          /^pet_/.test(b.kind ?? '')
            ? `「${b.label}」把门圈进去了 —— 给围栏留出这道门的开口,或整体往旁挪`
            : `把「${b.label}」挪到不影响开合的位置`,
        )
      : ['找出挡在门口的东西', '挪到不影响开合的位置']
    tasks.push({
      id: `door-${d.id}`,
      kind: 'blockedDoor',
      title: `疏通${d.nameZh ?? '被挡住的门'}`,
      priority: P.blockedDoor,
      estMinutes: 10,
      zoneId: d.zoneId ?? null,
      zoneName: d.zoneNameZh ?? null,
      reason: blockers.length
        ? `${d.reason} —— 元凶:${blockers.map((b) => `「${b.label}」`).join('')}`
        : d.reason,
      steps: [...howto, '确认门能完全打开、人能一路走到门前'],
      doneWhen: [
        '门能 90° 完全打开,不碰到任何东西',
        '从主通道能一路走到门前,不用侧身、不用跨',
        ...blockers.map((b) => `「${b.label}」不再压在门的开合范围里`),
      ],
      items: [],
      photoRef: null,
      focus: Number.isFinite(d.x) ? { x: d.x, y: d.y } : null,
    })
  }

  // 2) 走不进去的区 —— 和堵门一样是通行问题,得先解决
  for (const z of circ?.isolatedZones ?? []) {
    // 圈出这个区,专注模式才有图可看 —— 「打通阳台」光看字还得自己在图上找阳台
    const poly = zonesById[z.zoneId]?.polygon
    const focus = poly?.length
      ? {
          x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
          y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
        }
      : null
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
      doneWhen: [
        `从主通道能一路走进${z.nameZh},中途不用侧身、不用跨东西`,
        '入口至少留出 30 英寸(约 76 cm)',
      ],
      items: [],
      photoRef: null,
      focus,
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
      // 完成标准给可量的数,不给「变宽敞」——拿卷尺一量就知道做完没有
      doneWhen: [
        `拿卷尺量这处最窄的地方:至少 30 英寸(约 76 cm),现在是 ${b.widthIn} 英寸`,
        '正面走过去不用侧身',
      ],
      items: [],
      photoRef: null,
      focus: { x: b.x, y: b.y },
    })
  }

  // 3) 现场观察:每根轴各出各的任务。
  //
  // 为什么不是一个「整理 X 区」大任务:一个词概括不了一间屋子,而人要的恰恰是被那个词
  // 抹掉的区别 —— 收碗筷(轻,5 分钟)和拖地(中,20 分钟)是两件事,累的时候只做得动
  // 前者;更要命的是**地面清洁必须排在最后**(见 P 表),混在一个任务里就没法排序了。
  /** @type {Map<string, { axes: Record<string, number>, legacy: boolean, state: string, items: string[], photoRef: string|null, x: number, y: number, at: string }>} */
  const worst = new Map()
  for (const vp of viewpoints) {
    if (!vp.zoneId) continue
    const obs = vp.observations
    const hasObs = obs && typeof obs === 'object' && Object.keys(obs).length
    if (!hasObs && !vp.state) continue
    const prev = worst.get(vp.zoneId)
    // 以最新识别的那次为准 —— 同一个区几个机位时,旧的那次不该盖掉刚拍的
    if (prev && (prev.at ?? '') > (vp.describedAt ?? '')) continue
    worst.set(vp.zoneId, {
      axes: hasObs ? obs : {},
      legacy: !hasObs,
      state: vp.state ?? '',
      items: vp.items ?? [],
      photoRef: vp.photoRef ?? null,
      x: vp.x,
      y: vp.y,
      at: vp.describedAt ?? '',
    })
  }

  const LEVEL_ZH = ['没有', '少量', '较多', '很多']

  for (const [zoneId, info] of worst) {
    const zone = zonesById[zoneId]
    const zoneName = zone?.nameZh ?? '这个区域'
    const area = zoneArea(stats, zoneId)
    const from = { x: info.x, y: info.y }
    const a = info.axes
    const lvl = (k) => Number(a[k]) || 0

    // 老数据只有五档 state、没有分轴 —— 退化成原来那个泛化任务。
    // 不能拿 state 硬编出分轴:「杂乱」说的是占没占地方,从它推出「地板脏」是凭空编。
    if (info.legacy) {
      if (info.state !== '堆满' && info.state !== '杂乱') continue
      const overflow = info.state === '堆满'
      const homes = info.items
        .map((it) => {
          const h = suggestHome(it, project, from)
          return h ? `${it} → ${h.zh}` : null
        })
        .filter(Boolean)
      tasks.push({
        id: `tidy-${zoneId}`,
        kind: overflow ? 'overflow' : 'messy',
        title: `整理${zoneName}`,
        priority: overflow ? P.overflow : P.messy,
        estMinutes: Math.round((overflow ? 20 : 10) + area / (overflow ? 10 : 15)),
        zoneId,
        zoneName: zone?.nameZh ?? null,
        reason: `照片显示这里${info.state}${info.items.length ? `,主要是:${info.items.join('、')}` : ''}(旧版识别,重跑一次可拆成具体任务)`,
        // 顺序按 KC Davis 五件事法 + 保洁金律,理由见 P 表
        steps: [
          '带一个垃圾袋和一个「归位篮」进屋',
          '先捡垃圾装袋,放到门口 —— 卫生隐患最先出屋,进度也立刻看得见',
          '杯盘餐具收进篮一趟送回水槽,脏衣物归洗衣篮',
          ...(homes.length ? homes.map((h) => `归位:${h}`) : ['有固定位置的东西按类送回各自的柜子']),
          '拿不准归属的进「临时箱」,别卡在这 —— 回头再统一给它们定家',
          '台面从高到低擦一遍(灰尘往下掉,先擦低处等于白擦)',
          '最后才扫/吸地,从最里角落退着往门口;要拖地放在吸尘之后',
        ],
        items: info.items,
        photoRef: info.photoRef,
        focus: { x: info.x, y: info.y },
      })
      continue
    }

    // —— ① 卫生:垃圾 / 碗筷 / 衣物。见到一点就派 —— 这三样最快、最该先清 ——
    const hyg = Math.max(lvl('trash'), lvl('dishes'), lvl('laundry'))
    if (hyg >= 1) {
      const seen = []
      if (lvl('trash')) seen.push(`垃圾${LEVEL_ZH[lvl('trash')]}`)
      if (lvl('dishes')) seen.push(`碗筷${LEVEL_ZH[lvl('dishes')]}`)
      if (lvl('laundry')) seen.push(`衣物${LEVEL_ZH[lvl('laundry')]}`)
      const steps = ['带一个垃圾袋和一个「归位篮」进屋 —— 一趟收完,别来回跑']
      if (lvl('trash')) steps.push('垃圾装袋,直接放到门口 —— 卫生隐患先出屋')
      if (lvl('dishes')) steps.push('杯盘碗筷装篮,一趟端回水槽')
      if (lvl('laundry')) steps.push('散落的衣物毛巾丢进洗衣篮')
      steps.push('这一步别停下来分类 —— 见到什么装什么,进度快才有动力做下一件')
      tasks.push({
        id: `hygiene-${zoneId}`,
        kind: 'hygiene',
        title: `清走${zoneName}的${lvl('trash') >= lvl('dishes') ? '垃圾' : '碗筷'}杂物`,
        priority: P.hygiene,
        estMinutes: 5 + hyg * 3,
        zoneId,
        zoneName: zone?.nameZh ?? null,
        reason: `照片看到:${seen.join('、')}`,
        steps,
        doneWhen: [
          ...(lvl('trash') ? ['垃圾袋已经在门口(或已经扔了)'] : []),
          ...(lvl('dishes') ? ['这个区域看不到一只脏碗碟杯子'] : []),
          ...(lvl('laundry') ? ['地面和椅背上没有衣物'] : []),
        ],
        items: info.items,
        photoRef: info.photoRef,
        focus: { x: info.x, y: info.y },
      })
    }

    // —— ② 台面 ——
    if (lvl('surfaces') >= 2) {
      const homes = info.items
        .map((it) => {
          const h = suggestHome(it, project, from)
          return h ? `${it} → ${h.zh}` : null
        })
        .filter(Boolean)
      // B2:固定设备站保留、禁止储物面清空 —— 不再一刀切要求清空台面。
      const { fixed, prohibited } = surfacesInZone(project, zoneId)
      const fixedZh = fixed.length ? `「${fixed.join('、')}」` : ''
      const prohibitedZh = prohibited.length ? `「${prohibited.join('、')}」` : ''
      tasks.push({
        id: `surfaces-${zoneId}`,
        kind: 'surfaces',
        title: fixed.length ? `整理${zoneName}的台面(保留设备站)` : `清空${zoneName}的台面`,
        priority: P.surfaces,
        estMinutes: 10 + lvl('surfaces') * 5,
        zoneId,
        zoneName: zone?.nameZh ?? null,
        reason:
          `照片显示桌面/台面堆积${LEVEL_ZH[lvl('surfaces')]}${info.items.length ? `,主要是:${info.items.join('、')}` : ''}` +
          (fixed.length ? `。${fixedZh}是固定设备站,保留设备本身,只清无关外溢物` : ''),
        steps: [
          fixed.length
            ? `把台面上除${fixedZh}以外的东西按类堆到一起(先分类,别急着放)`
            : '把台面上的东西按类堆到一起(先分类,别急着放)',
          ...(homes.length ? homes.map((h) => `归位:${h}`) : ['有固定位置的东西按类送回各自的柜子']),
          ...(fixed.length ? [`保留${fixedZh}及其日用配件不动,清掉压在旁边的无关物`, '给设备留出开门、操作与散热空间'] : []),
          '拿不准归属的进「临时箱」,别卡在这',
          '台面空了再擦 —— 从高到低,灰尘往下掉',
        ],
        doneWhen: [
          fixed.length
            ? `${fixedZh}及其日用品保留,门/操作/散热空间不被压;设备站之外的台面至少 70% 空`
            : '台面至少 70% 是空的 —— 站远一点看,空的地方要明显多过占着的',
          '留在台面上的,只有每天都要用的东西',
          ...(prohibited.length ? [`${prohibitedZh}是禁放面,上面一件不留(炉灶要能烹饪、围栏顶不放坠物)`] : []),
          '没有「等会儿再收」的东西 —— 那就是它会留一个月的意思',
        ],
        items: info.items,
        photoRef: info.photoRef,
        focus: { x: info.x, y: info.y },
      })
    }

    // —— ③ 地面杂物(是「堆着东西」,不是「脏」)——
    if (lvl('floorClutter') >= 2) {
      tasks.push({
        id: `floor-${zoneId}`,
        kind: 'floorClutter',
        title: `清空${zoneName}的地面`,
        priority: P.floorClutter,
        estMinutes: Math.round(10 + area / 15 + lvl('floorClutter') * 5),
        zoneId,
        zoneName: zone?.nameZh ?? null,
        reason: `照片显示地上堆放${LEVEL_ZH[lvl('floorClutter')]} —— 地面通了,后面才好铺开分类,也才扫得动`,
        steps: [
          '先把地上的东西全部拿起来,按类堆到一处',
          '大件、能立刻归位的先送走',
          '剩下没家的进「临时箱」—— 地面清空优先于给每件东西定家',
          '目标:能一路走过去,而且扫地机/吸尘器推得动',
        ],
        doneWhen: [
          '地面 0 件长期堆放的东西 —— 地面不是仓库',
          '推着吸尘器能一路走完全程,不用弯腰搬开任何东西',
          '留在地上的容器都有固定的停靠位,不是随手一放',
        ],
        items: [],
        photoRef: info.photoRef,
        focus: { x: info.x, y: info.y },
      })
    }

    // —— ④ 地面清洁:脏,不是乱。这是老的五档状态**根本看不见**的一根轴 ——
    // 优先级排在最后(P.floorClean=8):先扫地,等会儿收台面时灰又落一地,等于白扫。
    if (lvl('floorDirt') >= 2) {
      const dirty = lvl('floorDirt')
      tasks.push({
        id: `clean-${zoneId}`,
        kind: 'floorClean',
        title: `扫${dirty >= 3 ? '并拖' : ''}${zoneName}的地`,
        priority: P.floorClean,
        estMinutes: Math.round(8 + area / 12 + (dirty >= 3 ? 10 : 0)),
        zoneId,
        zoneName: zone?.nameZh ?? null,
        reason: `照片显示地面灰尘/毛发/污渍${LEVEL_ZH[dirty]} —— 这是「脏」不是「乱」,收拾完才轮到它`,
        steps: [
          '确认台面和地面都已经收空 —— 没收完就扫,等于白扫',
          '先干后湿:先扫/吸,把浮灰毛发带走',
          '从最里的角落退着往门口扫,别把自己扫进死角',
          ...(dirty >= 3 ? ['吸完再拖,拖把拧到不滴水;拖完开窗/开风扇让它干透'] : []),
        ],
        doneWhen: [
          '蹲下平视地面,看不到毛发和碎屑',
          '墙角和家具腿旁边也扫到了 —— 那是最容易跳过的地方',
          ...(dirty >= 3 ? ['拖过的地方已经干透,不留水痕'] : []),
        ],
        items: [],
        photoRef: info.photoRef,
        focus: { x: info.x, y: info.y },
      })
    }
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
        '备好三个袋/箱:留下 · 送人或卖 · 扔掉',
        '全部取出过一遍,每件只过一次手、当场进一个袋',
        '一年没用过的别回柜:进「送人/卖」或「扔」',
        '留下的常用放伸手可及的一层,同类归同格',
        '给格子贴标签,顺手擦一遍空柜再放回',
      ],
      doneWhen: [
        '柜里留出 10–20% 空位 —— 塞满的柜子下周一定会外溢到地面',
        '每一格只有一个主类别,说得出这格叫什么',
        '「送人/卖」那袋已经离开这个柜子(最好已经出门)',
      ],
      items: (sz.items ?? []).slice(0, 6).map((i) => i.name),
      photoRef: null,
      // 框住整个柜体 —— 光一个点说不清「梳理的是哪个柜」
      focus: sz.bounds
        ? { x: sz.bounds.x + sz.bounds.w / 2, y: sz.bounds.y + sz.bounds.h / 2, rect: sz.bounds }
        : null,
    })
  }

  // 4.5) 开场:先备好容器。
  //
  // 空手进屋的下场是「拿着一件东西满屋找地方放」—— 每件东西都变成一次跨房间往返,
  // 十分钟就累了,而屋子看起来更乱(因为东西全被翻出来摊着)。备好箱子,每件东西
  // 只需要「扔进对的那个箱」这一个动作,分类和搬运分成两趟,进度才快得起来。
  //
  // 只在真有东西要收时才派 —— 只是挪个柜子拓通道的话,不需要五个箱子。
  const NEEDS_BINS = new Set(['hygiene', 'surfaces', 'floorClutter', 'overflow', 'messy', 'storage'])
  if (tasks.some((t) => NEEDS_BINS.has(t.kind))) {
    tasks.push({
      id: 'prep',
      kind: 'prep',
      title: '先备好箱子和垃圾袋,再开始',
      priority: P.prep,
      estMinutes: 10,
      zoneId: null,
      zoneName: null,
      reason: '空手进屋 = 拿着一件东西满屋找地方放。备好容器,每件东西只需要一个动作',
      steps: [
        '一个黑色垃圾袋 —— 垃圾',
        '一个纸箱/袋 —— 回收(纸盒、包装)',
        '一个衣篮 —— 待洗衣物',
        '一个箱 —— 厨房与食品',
        '一个箱 —— 电子、线材、文件',
        '一个箱 —— 卫浴与清洁',
        // 步骤是纯文本渲染的,别写 markdown —— 星号会原样显示出来
        '一个「待决定箱」,只能有一个 —— 犹豫超过 30 秒的东西丢进去,别站在那想',
      ],
      doneWhen: [
        '所有容器都在手边,不用中途去找',
        '「待决定箱」只有一个 —— 有第二个就意味着你在给自己造新的黑洞',
        '今天不买任何新收纳盒 —— 先用现有的,买了也不知道该买多大',
      ],
      items: [],
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
      doneWhen: ['新扫描已经拉进网页端', '杂乱指数比整理前低了 —— 这就是今天的收据'],
      items: [],
      photoRef: null,
    })
  }

  for (const t of tasks) {
    t.effort = EFFORT[t.kind] ?? 'medium'
    t.focus ??= null
  }
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
 *
 * prep(备箱子)和 rescan(复扫)是**配角**,不参与抢预算,最后单独议:
 * 两者都只在有正片的时候才有意义。prep 尤其不能进主循环 —— 它排在最前、又要 10 分钟,
 * 15 分钟预算下它会先把位子占掉,把真正要干的活挤出去,用户打开计划只看到
 * 「备好箱子」一条,备完了没事干。
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
    if (t.kind === 'rescan' || t.kind === 'prep') continue // 配角最后单独议
    if (!fits(t)) continue
    if (budget && spent + t.estMinutes > budget) continue
    out.push(t)
    spent += t.estMinutes
  }

  // prep 只在真有东西要收(而不是只挪家具)时才值得占那 10 分钟
  const prep = tasks.find((t) => t.kind === 'prep')
  const needsBins = out.some((t) =>
    ['hygiene', 'surfaces', 'floorClutter', 'overflow', 'messy', 'storage'].includes(t.kind),
  )
  if (prep && needsBins && (!budget || spent + prep.estMinutes <= budget)) {
    out.unshift(prep)
    spent += prep.estMinutes
  }

  const rescan = tasks.find((t) => t.kind === 'rescan')
  if (rescan && out.length && (!budget || spent + rescan.estMinutes <= budget)) {
    out.push(rescan)
  }
  return out
}
