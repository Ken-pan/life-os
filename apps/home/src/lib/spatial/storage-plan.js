/**
 * 储物区规划 —— 「这个柜子该放什么」的单一权威。纯函数,无 AI、无 IO。
 *
 * 两个问题,各由一条客观数据回答,没有第三条:
 *
 * - **该放什么重量/频率的东西** ← 柜子占据的竖直区间。取自
 *   {@link verticalBlockRangeIn}(实测 elevIn/heightIn 优先,退规格 elev/tall)——
 *   竖直几何的权威在 placements.js,这里绝不自己从 attrs 里再推一遍:实测过
 *   冰箱顶吊柜 elevIn=66、厨房上柜走规格 54,手推会把两个都算成「未知」。
 * - **该放哪一类东西** ← 它离哪个作业点最近。灶台/水槽/冰箱/洗手台/宠物区/
 *   电视/书桌/洗衣区 —— 每个作业点把自己的类目判给**离它最近的**那个储物区。
 *   这就是「就近取用」的直接实现。
 *
 * 为什么要有这个模块:原来的归区({@link import('./inventory-import.js').resolveZone})
 * 是拿线索词去匹配柜子的**名字**。名字对不上就落兜底区,于是 25 件东西(含洗地机、
 * 84″ 投影幕)全被倒进一张 27.7×25.8 英寸的小边几,同时 7 个柜子空着 —— 而那 7 个里
 * 就有离灶台 1.9 英尺的厨房高柜。名字是人随便起的,几何不是。按几何定位就没有
 * 兜底垃圾桶:每件东西都有一个算得出来的去处。
 */

/** @typedef {import('./types.js').SpatialProject} SpatialProject */
/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */
/** @typedef {import('./types.js').StorageZoneSpec} StorageZoneSpec */

import { PX_PER_FT } from './dimensions.js'
import { pointInPolygon } from './geometry.js'
import { canonicalPlacementKind, verticalBlockRangeIn } from './placements.js'
import { zoneCapacity, isFull } from './capacity.js'
import { petHazards as computePetHazards, zoneReachable } from './pet-safety.js'

/**
 * 取物高度带(英寸,离地)。人体工学通用标准:黄金区 = 膝到肩,厨房日用 20–50″;
 * 过肩放重物是腰伤第一来源;台面标准高 34–38″ 正落在黄金区中间。
 */
export const REACH = {
  /** 0–20:得弯腰 */
  stoop: 20,
  /** 20–50:黄金区,膝到肩 */
  golden: 50,
  /** 50–72:举手;72 以上要踮脚/踩凳 */
  overhead: 72,
}

/**
 * 作业点 —— 储物该挂在它旁边。
 *
 * `kinds` 同时认 fixtures 和 placements 的 kind(两边都是同一套词表)。
 * `match` 认物品名和商家标题:两者都喂,因为人话短名往往省掉了关键词
 * (「柜门上分层置物架」看不出是卫浴的,它的商家标题里写着 Bathroom)。
 *
 * 顺序即优先级,先命中先算 —— 「宠物饮水机」必须在「水槽」之前命中,
 * 否则它会被判给洗碗机而不是狗笼。
 *
 * `heavy` 是**类目**的重量属性,决定这类东西能不能以过肩的柜子当主力位。
 * 它不能省成「过肩柜一律不当主力」:碗碟杯子是轻的,水槽上方的吊柜正是它们的
 * 教科书归宿 —— 洗碗机开门直接往上码。一刀切会把这个最好的位置判成备货。
 *
 * @type {Array<{ id: string, zh: string, kinds: string[], catZh: string, match: RegExp, heavy: boolean }>}
 */
export const ANCHORS = [
  {
    id: 'pet',
    zh: '宠物区',
    kinds: ['pet_crate', 'pet_pen', 'pet_bowl', 'pet_gate'],
    catZh: '宠物用品',
    // 排在水槽/灶台之前:喂食器和饮水机带「食」「水」,会被厨房抢走
    match: /宠物|狗|猫|喂食|饮水|尿垫|牵引|狗粮|petlibro|cheerble|hq4us/i,
    heavy: true, // 整袋狗粮、带水箱的饮水机
  },
  {
    id: 'laundry',
    zh: '洗衣区',
    kinds: ['washer', 'dryer'],
    catZh: '地面清洁设备与洗涤剂',
    // 排在水槽之前:洗地机带「洗」
    match: /洗地机|地毯机|吸尘|扫地|拖把|洗衣|洗涤|清洗机|roborock|dreame|bissell/i,
    heavy: true,
  },
  {
    id: 'tv',
    zh: '电视',
    kinds: ['tv'],
    catZh: '影音设备与线材',
    // 排在书桌之前:回音壁不该跟打印机一起进开放货架
    match: /回音壁|低音炮|音响|功放|电视|投影|幕布|遥控|hdmi|soundbar/i,
    heavy: true, // 低音炮
  },
  {
    id: 'stove',
    zh: '灶台',
    kinds: ['stove', 'range', 'oven'],
    catZh: '锅具、调料、食用油',
    match: /锅|炒|调料|香料|食用油|锅铲|烤盘|压力锅|电饭煲|instant\s*pot|kitchenaid|spice/i,
    heavy: true, // 铸铁锅、压力锅
  },
  {
    id: 'sink',
    zh: '水槽 / 洗碗机',
    kinds: ['kitchen_sink', 'sink', 'dishwasher'],
    catZh: '碗碟、杯子、沥水',
    match: /碗|碟|盘子|杯|沥水|滤水|洗洁|餐具|brita|dish/i,
    heavy: false, // 碗碟杯子是轻的 —— 水槽上方的吊柜就是它们该在的地方
  },
  {
    id: 'fridge',
    zh: '冰箱',
    kinds: ['fridge'],
    catZh: '干货与食品储备',
    match: /干货|米面|零食|咖啡|茶叶|气泡水|破壁|榨汁|保鲜/i,
    heavy: true, // 整袋米面
  },
  {
    id: 'vanity',
    zh: '洗手台',
    kinds: ['vanity', 'toilet', 'tub', 'shower'],
    catZh: '洗漱与卫浴备品',
    match: /卫浴|浴室|马桶|牙刷|洗漱|毛巾|沐浴|洗发|bathroom|under\s*sink/i,
    heavy: false,
  },
  {
    id: 'bed',
    zh: '床',
    kinds: ['bed', 'bed_king', 'bed_queen', 'bed_full', 'bed_twin'],
    catZh: '床品与卧室日常',
    match: /床品|被子|枕|床单|加湿器|香薰|台灯|遮光|窗帘/i,
    heavy: false,
  },
  {
    id: 'desk',
    zh: '书桌',
    kinds: ['desk', 'standing_desk', 'table'],
    catZh: '办公 / 造物设备与耗材',
    match: /打印机|麦架|麦克风|键盘|鼠标|显示器|支架|路由|主机|相机|3d|cricut|切割|耗材|文件|墨盒|耗电/i,
    heavy: true, // 激光打印机、3D 打印机都是十几二十公斤
  },
]

/** 容器本身 —— 它们不是「被存的东西」,是存东西的工具,不该被判给某个作业点。 */
const CONTAINER_RE = /收纳箱|储物箱|收纳柜|整理柜|夸脱|挂篮|挂架|置物架|层板|收纳盒|分层/i

/**
 * 塞不进柜子的东西 —— 又重又大的落地设备。
 *
 * 它们的归宿是**作业点旁边的地面**,不是某个储物区。实测踩到过:洗地机/地毯机
 * 被判给「洗手台下柜」,因为洗衣区恰好离卫生间 3 英尺 —— 于是建议变成
 * 「把 20 公斤的地毯机塞进洗手台下面」。储物区不是万能收纳。
 */
const FLOOR_STANDING_RE = /洗地机|地毯机|扫地机|吸尘器|清洗机|拖把桶|基站|落地扇|箱式风扇|梯|行李箱/i

/**
 * 过肩位置放不得的东西 —— 重、或者天天要拿。
 *
 * 实测踩到过:气泡水机被判给冰箱顶吊柜(66–88″),而那个柜子自己的动线说明写着
 * 「只放轻且不常用的,重物每次取放都要举过肩」。两句话直接打架 —— 校对必须
 * 认人体工学,否则它会推翻规划自己刚说过的话。
 */
const HEAVY_RE = /压力锅|破壁|榨汁|气泡水|电饭煲|微波|烤箱|打印机|洗地机|地毯机|清洗机|音炮|功放|滤水|饮水机|喂食器|3d|kitchenaid|instant\s*pot|nutribullet|breville|bambu/i

const center = (o) => {
  const b = o?.bounds ?? o
  if (!b || !Number.isFinite(b.x)) return null
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

const distFt = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / PX_PER_FT

/**
 * 一个点落在哪个房间。
 *
 * 直线距离**不认墙**,而这里的判断全靠距离 —— 实测踩到过:遮光窗帘被判给餐区
 * 电视柜,理由是「离床 5.5ft」,而床在卧室、中间隔着一堵墙,那 5.5 英尺是穿墙量的。
 * 所以作业点和储物区必须先同房间才谈距离:同房间内的直线距离约等于走的路,
 * 跨房间的直线距离毫无意义。
 *
 * 用分区多边形而不是 circulation 的栅格 BFS:这里只需要「在不在一间屋里」,
 * 不需要「走过去多少步」,多边形归属够了,也不用把整个栅格拖进这层依赖。
 * @param {{ x: number, y: number } | null} at
 * @param {SpatialProject} project
 * @returns {string | null} zone id
 */
function roomOf(at, project) {
  if (!at) return null
  const rooms = project.zones?.length ? project.zones : []
  for (const r of rooms) {
    if (r.polygon && pointInPolygon(at, r.polygon)) return r.id
  }
  // 手工 508 户型没有 zones,退到 rooms 的矩形
  for (const r of project.rooms ?? []) {
    const b = r.bounds
    if (!b) continue
    if (at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h) return r.id
  }
  return null
}

/**
 * 一个竖直区间落在哪些取物带里。
 * @param {number} lo 底面离地(英寸)
 * @param {number} hi 顶面离地(英寸)
 * @returns {string[]} stoop | golden | reach | tiptoe
 */
export function reachBandsOf(lo, hi) {
  const bands = []
  if (lo < REACH.stoop) bands.push('stoop')
  if (hi > REACH.stoop && lo < REACH.golden) bands.push('golden')
  if (hi > REACH.golden && lo < REACH.overhead) bands.push('reach')
  if (hi > REACH.overhead) bands.push('tiptoe')
  return bands
}

/** 区间和黄金带的重叠占它自身的多少 —— 「这个柜子有多少是好用的」 */
function goldenShare(lo, hi) {
  const span = hi - lo
  if (span <= 0) return 0
  const overlap = Math.min(hi, REACH.golden) - Math.max(lo, REACH.stoop)
  return Math.max(0, overlap) / span
}

/**
 * 这个储物区的竖直区间。绑了家具才有 —— 没绑就无从谈人体工学,
 * 老实返回 null,而不是编一个默认高度出来。
 * @param {SpatialStorageZone} zone
 * @param {SpatialProject} project
 * @returns {{ lo: number, hi: number, measured: boolean } | null}
 */
export function zoneReach(zone, project) {
  const pl = (project.placements ?? []).find((p) => p.id === zone.placementId)
  if (!pl) return null
  const { lo, hi } = verticalBlockRangeIn(pl)
  // 实测 = 高度来自 LiDAR 而不是目录规格。UI 要据此区分「量出来的」和「按类推的」
  const measured = Number.isFinite(pl.attrs?.heightIn)
  return { lo, hi, measured }
}

/** 人话:这个高度带该放什么重量、什么频率 */
function ergonomicsTextOf(lo, hi) {
  const share = goldenShare(lo, hi)
  const r = (n) => Math.round(n)
  // 整柜过肩 —— 最要紧的一条,因为它是「别放什么」
  if (lo >= REACH.golden) {
    return `柜体在离地 ${r(lo)}–${r(hi)}″,整个过肩 —— 只放轻且不常用的。重物放这里,每次取放都要举过肩。`
  }
  if (hi <= REACH.stoop) {
    return `柜体在离地 ${r(lo)}–${r(hi)}″,要蹲下才够得着 —— 放不常用的,别放每天要拿的。`
  }
  // 高塔:跨越黄金区和踮脚区,分层是唯一要紧的事
  if (hi > REACH.overhead) {
    return `柜体 ${r(lo)}–${r(hi)}″ 跨了三个带,分层决定好不好用:${REACH.stoop}–${REACH.golden}″ 放每天的和重的,${REACH.overhead}″ 以上只放轻且一年一两次的。`
  }
  if (share >= 0.7) {
    return `柜体 ${r(lo)}–${r(hi)}″,基本整个落在黄金区(膝到肩)—— 最常用、最重的东西该放这儿。`
  }
  return `柜体 ${r(lo)}–${r(hi)}″,黄金区(${REACH.stoop}–${REACH.golden}″)占 ${Math.round(share * 100)}% —— 常用的放黄金区那段,其余放备货。`
}

/**
 * 全屋作业点的位置。fixtures 和 placements 用同一套 kind 词表,两边都扫。
 * @param {SpatialProject} project
 * @returns {Array<{ anchor: typeof ANCHORS[number], at: { x: number, y: number }, label: string }>}
 */
export function findAnchors(project) {
  const out = []
  const all = [
    ...(project.fixtures ?? []).map((f) => ({ kind: f.kind, label: f.label, at: center(f) })),
    ...(project.placements ?? [])
      // 暂存(导入还没安家)的不是屋里的真实位置 —— 拿它当作业点会把整份规划带偏
      .filter((p) => !p.attrs?.staged)
      .map((p) => ({ kind: p.kind, label: p.label, at: center(p) })),
  ]
  for (const anchor of ANCHORS) {
    for (const o of all) {
      // kind 过别名再比:云端数据里的狗狗围栏是 pet_fence,宠物区认不出它
      if (!o.at || !anchor.kinds.includes(canonicalPlacementKind(o.kind))) continue
      out.push({ anchor, at: o.at, label: o.label, roomId: roomOf(o.at, project) })
    }
  }
  return out
}

/**
 * 一件东西属于哪个作业点。名字和商家标题都喂 —— 人话短名常常省掉关键词。
 * @param {{ name?: string, purchase?: { title?: string } }} item
 * @returns {typeof ANCHORS[number] | null}
 */
export function anchorOfItem(item) {
  const text = `${item?.name ?? ''} ${item?.purchase?.title ?? ''}`
  if (!text.trim()) return null
  // 容器先排掉:「布艺收纳箱」不属于任何作业点,它是用来分格的工具
  if (CONTAINER_RE.test(text) && !ANCHORS.some((a) => a.id === 'vanity' && a.match.test(text))) {
    return null
  }
  return ANCHORS.find((a) => a.match.test(text)) ?? null
}

/**
 * 每个储物区到每个作业点的最近距离(英尺)。**只算同房间的作业点** ——
 * 跨房间的直线距离是穿墙量的,见 {@link roomOf}。
 * @param {SpatialStorageZone} zone
 * @param {ReturnType<typeof findAnchors>} anchors
 * @param {string | null} roomId 储物区所在房间
 * @returns {Map<string, number>} anchor.id → 英尺
 */
function zoneAnchorDistances(zone, anchors, roomId) {
  const at = center(zone)
  /** @type {Map<string, number>} */
  const out = new Map()
  if (!at) return out
  for (const a of anchors) {
    // 同房间才谈距离。两边都认不出房间时放行 —— 没有分区数据的户型
    // (手工画的、还没扫描的)不该因此整个失效
    if (roomId && a.roomId && a.roomId !== roomId) continue
    const d = distFt(at, a.at)
    const prev = out.get(a.anchor.id)
    if (prev === undefined || d < prev) out.set(a.anchor.id, d)
  }
  return out
}

/**
 * 规划全屋储物区。
 *
 * 分配规则:**每个作业点把自己的类目判给离它最近的储物区**。这直接实现「就近
 * 取用」,而且是全局的 —— 逐区去问「你最近的作业点是谁」会让同一个作业点被多个区
 * 认领(厨房五个柜子会全都说自己该放锅),而灶台只需要一个柜子。
 *
 * @param {SpatialProject} project
 * @returns {{
 *   zones: Array<{ code: string, spec: StorageZoneSpec, reach: ReturnType<typeof zoneReach>, ownedAnchors: string[], nearest: Array<{ id: string, zh: string, ft: number }> }>,
 *   misplaced: Array<{ itemId: string, name: string, fromCode: string, toCode: string, anchorZh: string, savedFt: number|null, crossRoom: boolean }>,
 *   floorBound: Array<{ itemId: string, name: string, fromCode: string, anchorZh: string, whyZh: string }>,
 *   unbound: string[],
 * }}
 */
export function planStorageZones(project) {
  const zones = project.storageZones ?? []
  const anchors = findAnchors(project)

  /** @type {Map<string, Map<string, number>>} zone.code → (anchor.id → ft) */
  const dists = new Map()
  /** @type {Map<string, ReturnType<typeof zoneReach>>} */
  const reaches = new Map()
  /** 没绑家具的区:算不了人体工学,也不该参与作业点分配 */
  const unbound = []
  for (const z of zones) {
    if (!center(z)) {
      unbound.push(z.code)
      continue
    }
    dists.set(z.code, zoneAnchorDistances(z, anchors, roomOf(center(z), project)))
    reaches.set(z.code, zoneReach(z, project))
  }

  // 作业点 → 按距离排好的区。**不是一个作业点只判给一个区**:实测里厨房有五个柜子,
  // 独占分配会让 S1(6.2 英尺长、离洗碗机 4ft 的主力柜)因为吊柜 S12 近 0.9 英尺
  // 就整个沦为「备货」。真实的家是主力位 + 备货位,所以这里给的是排名。
  /** @type {Map<string, string[]>} anchor.id → [zone.code] 按距离升序 */
  const rankOf = new Map()
  for (const anchor of ANCHORS) {
    const ranked = [...dists.entries()]
      .filter(([, m]) => m.get(anchor.id) !== undefined)
      .sort((a, b) => a[1].get(anchor.id) - b[1].get(anchor.id))
      .map(([code]) => code)
    if (ranked.length) rankOf.set(anchor.id, ranked)
  }

  /**
   * 这个作业点的主力位 = 最近的那个;但**重类目**跳过过肩的柜子 ——
   * 整袋米面放冰箱顶(66–88″),每次取放都要举过肩卸重物。
   * 轻类目不跳:碗碟就该在水槽上方的吊柜里。全够不着就退回最近的那个,
   * 至少别把作业点丢了。
   */
  const primaryOf = (anchor) => {
    const ranked = rankOf.get(anchor.id) ?? []
    if (!anchor.heavy) return ranked[0] ?? null
    const reachable = ranked.find((code) => {
      const r = reaches.get(code)
      return !r || r.lo < REACH.golden
    })
    return reachable ?? ranked[0] ?? null
  }

  /** @type {Map<string, string[]>} zone.code → 它拿下的 anchor.id */
  const owned = new Map()
  /** @type {Map<string, string>} anchor.id → zone.code */
  const ownerOf = new Map()
  for (const anchor of ANCHORS) {
    const best = primaryOf(anchor)
    if (!best) continue
    ownerOf.set(anchor.id, best)
    owned.set(best, [...(owned.get(best) ?? []), anchor.id])
  }

  const byCode = Object.fromEntries(zones.map((z) => [z.code, z]))
  const anchorById = Object.fromEntries(ANCHORS.map((a) => [a.id, a]))

  const out = zones
    .filter((z) => dists.has(z.code))
    .map((z) => {
      const reach = zoneReach(z, project)
      const m = dists.get(z.code)
      const nearest = [...m.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .map(([id, ft]) => ({ id, zh: anchorById[id].zh, ft: Math.round(ft * 10) / 10 }))
      const mine = owned.get(z.code) ?? []

      /** @type {StorageZoneSpec} */
      const spec = {}
      if (mine.length) {
        // 每个类目自带它的作业点和距离,用「;」分条。
        // 别把类目和距离拆成两串再各自 join —— 一个柜子拿下五个作业点时
        // (小户型里很常见)会塌成一堵读不断句的墙,而且「水槽 / 洗碗机」自带的
        // 斜杠会和分隔符撞在一起,分不清哪个距离是谁的。
        spec.storagePlanZh = mine
          .map((id) => `${anchorById[id].catZh}（${anchorById[id].zh} ${Math.round(m.get(id) * 10) / 10}ft）`)
          .join('；')
      } else if (nearest.length) {
        const n = nearest[0]
        const ownerCode = ownerOf.get(n.id)
        const owner = ownerCode ? `${ownerCode} ${byCode[ownerCode]?.nameZh ?? ''}`.trim() : '别处'
        spec.storagePlanZh = `${anchorById[n.id].catZh}的备货（${n.zh} ${n.ft}ft）—— ${owner} 更近,每天要拿的先放那边。`
      }
      if (reach) spec.ergonomicsZh = ergonomicsTextOf(reach.lo, reach.hi)

      // 容量:结构化输出(state/evidence/fillPct),中文由 UI 按 state 出。
      // 满载区仍**报为归属**(ownedAnchors 不变),只是不再当新增候选(见下面 misplaced)。
      return { code: z.code, spec, reach, ownedAnchors: mine, nearest, capacity: zoneCapacity(z) }
    })

  // 归位校对:东西在这个区,但它属于的作业点由另一个区拿着,且那个区明显更近
  /** 少走这么多才值得搬 —— 一两英尺的差别不值得让人来回折腾 */
  const WORTH_MOVING_FT = 3
  const misplaced = []
  /** 放不进柜子的落地设备:它的家是作业点旁边的地面,不是任何储物区 */
  const floorBound = []
  for (const z of zones) {
    const from = dists.get(z.code)
    if (!from) continue
    for (const item of z.items ?? []) {
      const anchor = anchorOfItem(item)
      if (!anchor) continue
      const text = `${item.name ?? ''} ${item.purchase?.title ?? ''}`

      // 又重又大的落地机器不该被塞进任何柜子 —— 给它指地面,别给它指柜子
      if (FLOOR_STANDING_RE.test(text)) {
        floorBound.push({
          itemId: item.id,
          name: item.name,
          fromCode: z.code,
          anchorZh: anchor.zh,
          whyZh: `落地设备,放不进柜子 —— 它的位置是${anchor.zh}旁边的地面`,
        })
        continue
      }

      const ranked = rankOf.get(anchor.id) ?? []
      if (!ranked.length) continue

      // 目的地要过人体工学这一关:重物 / 天天拿的不能送去过肩的柜子。
      // 不加这道闸,校对会推翻规划自己刚说过的话 —— 实测里它把气泡水机送进了
      // 冰箱顶吊柜(66–88″),而那个柜子的说明写着「只放轻且不常用」。
      const heavy = anchor.heavy || HEAVY_RE.test(text)
      const target = ranked.find((code) => {
        if (code === z.code) return false
        const r = reaches.get(code)
        if (heavy && r && r.lo >= REACH.golden) return false
        // 功能性满载/接近满的区绝不当搬入目的地(规范 §6.3:满载不再建议塞进去)。
        // 它仍是自己类目的归属,只是没有空间接新东西。
        if (isFull(byCode[code])) return false
        return true
      })
      if (!target) continue

      const fromFt = from.get(anchor.id)
      // 当前区里根本够不着这个作业点 = 东西**放错了房间**(距离表只收同房间的)。
      // 这是最严重的一档,不是最轻的:卫浴收纳架待在餐区的边几上,要用的时候得
      // 跨过整个屋子。可别因为「算不出省多少英尺」就把它静默跳过 —— 那正是
      // 加了认墙之后差点漏掉的一整类。
      if (fromFt === undefined) {
        misplaced.push({
          itemId: item.id,
          name: item.name,
          fromCode: z.code,
          toCode: target,
          anchorZh: anchor.zh,
          savedFt: null,
          crossRoom: true,
        })
        continue
      }
      const toFt = dists.get(target)?.get(anchor.id)
      if (toFt === undefined) continue
      const saved = fromFt - toFt
      if (saved < WORTH_MOVING_FT) continue
      misplaced.push({
        itemId: item.id,
        name: item.name,
        fromCode: z.code,
        toCode: target,
        anchorZh: anchor.zh,
        savedFt: Math.round(saved * 10) / 10,
        crossRoom: false,
      })
    }
  }
  // 放错房间的排最前 —— 它比「同屋里放错柜子」严重一档
  misplaced.sort((a, b) => {
    if (a.crossRoom !== b.crossRoom) return a.crossRoom ? -1 : 1
    return (b.savedFt ?? 0) - (a.savedFt ?? 0)
  })

  // 宠物危险(规范 §4, 评审 B5):可触开放区里的危险物,给出最近的**宠物安全**去处
  // (petProof/带门/够不着)。这是硬安全,严重度高于「放错柜子」;toCode 为 null =
  // 没有现成安全区,需新增封闭收纳。
  const petSafety = project.meta?.petSafety
  const safeZones = zones.filter((z) => center(z) && zoneReachable(z, petSafety) === false)
  const petHazards = computePetHazards(project).map((hz) => {
    const fromZone = byCode[hz.zoneCode]
    const fc = fromZone && center(fromZone)
    let toCode = null
    let best = Infinity
    for (const sz of safeZones) {
      if (sz.code === hz.zoneCode) continue
      const c = center(sz)
      const d = fc ? Math.hypot(c.x - fc.x, c.y - fc.y) : 0
      if (d < best) {
        best = d
        toCode = sz.code
      }
    }
    return { ...hz, toCode }
  })

  return { zones: out, misplaced, floorBound, unbound, petHazards }
}

/**
 * 按几何给一件东西找储物区 —— {@link import('./inventory-import.js').resolveZone}
 * 的接班人。
 *
 * 老的按柜子**名字**匹配线索词,名字对不上就落兜底区;这个按**作业点**定位:
 * 东西属于哪个作业点(名字/标题里认),那个作业点最近的区就是它的家。认不出作业点的
 * 才退回兜底 —— 而不是像以前那样,认不出**柜名**就兜底。
 *
 * @param {{ name?: string, purchase?: { title?: string } }} item
 * @param {SpatialProject} project
 * @returns {{ code: string, anchorZh: string, ft: number } | null} 认不出作业点则 null
 */
export function resolveZoneByGeometry(item, project) {
  const anchor = anchorOfItem(item)
  if (!anchor) return null
  const anchors = findAnchors(project).filter((a) => a.anchor.id === anchor.id)
  if (!anchors.length) return null
  let best = null
  let bestFt = Infinity
  for (const z of project.storageZones ?? []) {
    const at = center(z)
    if (!at) continue
    for (const a of anchors) {
      const ft = distFt(at, a.at)
      if (ft >= bestFt) continue
      bestFt = ft
      best = z
    }
  }
  return best ? { code: best.code, anchorZh: anchor.zh, ft: Math.round(bestFt * 10) / 10 } : null
}
