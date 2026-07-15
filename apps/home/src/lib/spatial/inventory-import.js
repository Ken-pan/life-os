/**
 * 把「买过什么 + 还有没有」变成 HomeOS 里的东西。
 *
 * 上游是 FinanceOS:购买记录(Amazon/Target/BestBuy)按 placements.js 的分类法
 * 匹配出居家商品,人工分拣成「有 / 没有」。这里负责把「有」的那些落进空间模型。
 *
 * 分两路,因为 HomeOS 本来就分两路:
 *   - 带 `kind` 的是**家具** —— 宠物围栏是家具,不是被收进柜子的东西。它们进
 *     placements(平面图上能摆的)。
 *   - 不带 `kind` 的是**杂物** —— 压力锅、打印机。它们进储藏区清单。
 * 混成一路的话,围栏会以"被存放物"的身份出现在柜子清单里,而那正是它不是的东西。
 *
 * **认领优先**(claim):家具那一路先找扫描已经摆好的同类家具。RoomPlan 早就知道
 * 书架在哪 —— 与其新建一件飘在图中间、等用户拖,不如把购买信息贴到扫描出来的
 * 那一件上。既避免了同一个书架在图上出现两次,又让"图上这件 = 我 2026-03 买的
 * 那台"这条线真正接起来。找不到同类才新建,并摆进暂存网格等用户拖走。
 *
 * 全流程是**纯函数**:算出一个 plan 交给调用方预览,用户点了应用才落库。导入是
 * 批量写,不给人看一眼就直接改几十条数据是不礼貌的。
 */

/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */
/** @typedef {import('./types.js').SpatialStorageItem} SpatialStorageItem */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */
/** @typedef {import('./types.js').PurchaseInfo} PurchaseInfo */

import { PLACEMENT_KINDS, inchesToPx } from './placements.js'
import { createStorageItem } from './storage-items.js'

/**
 * 杂物 → 该去哪个储藏区。
 *
 * 规则给的是**线索词**而不是 S1/S2 这样的区号,因为区号是用户自己的:他随时可以
 * 改名、加区、删区。线索词拿去和每个区的「名字 + 位置」文本比对,谁先命中算谁,
 * 所以这套规则对改过名的家一样有效,写死区号则会把东西塞进一个已经不存在的柜子。
 *
 * 线索按优先级排:打印机先找「货架」(客厅东墙那排钢丝货架),找不到再退到任意
 * 「客厅」——不然两个客厅区谁在前就进谁,全凭数组顺序。
 *
 * 顺序即优先级,先命中先算 —— 「布艺收纳箱(格子柜用)」必须在通用「收纳箱」
 * 之前命中,否则它会被扔进走廊而不是它明写的格子柜。
 *
 * @type {Array<{ test: RegExp, hints: string[] }>}
 */
export const ZONE_RULES = [
  // 明写了归宿的,先认
  { test: /格子柜|方格|kallax/i, hints: ['方格', '格子', 'kallax', '客厅'] },
  // 厨房电器 / 吃喝
  {
    test: /电饭煲|压力锅|instant\s*pot|kitchenaid|炒锅|锅具|饮水机|喂食器|干货|咖啡|烤箱|气泡水|碗碟|沥水|调料|餐具|滤水|破壁|榨汁|微波/i,
    hints: ['厨房', '橱柜'],
  },
  // 清洁 / 洗衣
  { test: /洗地机|地毯机|吸尘|扫地|拖把|洗衣|roborock|dreame|bissell/i, hints: ['洗衣', '杂物', '走廊'] },
  // 卫浴
  { test: /卫浴|浴室|马桶|牙刷|洗漱|毛巾/i, hints: ['浴室', '洗手'] },
  // 影音 —— 单列一条:回音壁/低音炮是装在电视下面的,不该跟打印机一起
  // 塞进开放钢丝货架。放在「货架」规则**之前**,否则 S4(钢丝补给货架)先命中。
  { test: /回音壁|低音炮|音响|功放|电视|投影/i, hints: ['客厅', '方格'] },
  // 桌面 / 办公 —— 优先钢丝货架那种开放层架
  {
    test: /打印机|麦架|麦克风|显示器|支架|键盘|路由|主机|相机|3d/i,
    hints: ['货架', '补给', '客厅'],
  },
  // 大件收纳容器
  { test: /储物箱|收纳箱|收纳柜|整理柜|夸脱|挂篮|门后|行李/i, hints: ['走廊', '储物'] },
  // 卧室小电器
  { test: /加湿器|香薰|台灯|床头|枕/i, hints: ['床头', '卧室'] },
]

/**
 * 兜底区:实在猜不出就进"杂物"那个区。
 * 找不到杂物区就用最后一个 —— 空间模型保证至少有一个区。
 * @param {SpatialStorageZone[]} zones
 */
function fallbackZone(zones) {
  return zones.find((z) => /杂物|其他|misc/i.test(`${z.nameZh} ${z.locationZh}`)) ?? zones.at(-1)
}

/**
 * 按线索词把一件杂物落到某个储藏区。
 * @param {string} name
 * @param {SpatialStorageZone[]} zones
 * @returns {{ zone: SpatialStorageZone | undefined, guessed: boolean }}
 *   guessed=true 表示这是规则猜的,不是用户定的 —— 调用方据此打「待核对」标记
 */
export function resolveZone(name, zones) {
  if (!zones?.length) return { zone: undefined, guessed: false }
  const rule = ZONE_RULES.find((r) => r.test.test(name))
  if (rule) {
    for (const hint of rule.hints) {
      const hit = zones.find((z) =>
        `${z.nameZh} ${z.locationZh}`.toLowerCase().includes(hint.toLowerCase()),
      )
      if (hit) return { zone: hit, guessed: true }
    }
  }
  return { zone: fallbackZone(zones), guessed: true }
}

/**
 * 把上游 JSON 里一条记录的购买信息抽成 {@link PurchaseInfo}。
 * 上游字段名是 snake_case(order_id/image_url),这里转成模型的 camelCase;
 * 顺手接受已经是 camelCase 的输入,方便再次导入自己导出的东西。
 * @param {Record<string, any>} row
 * @returns {PurchaseInfo | undefined}
 */
function purchaseOf(row) {
  const p = row.purchase ?? row
  /** @type {PurchaseInfo} */
  const out = {}
  const pick = (...keys) => {
    for (const k of keys) {
      const v = p[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return undefined
  }
  const orderId = pick('orderId', 'order_id')
  const src = pick('src', 'source')
  const date = pick('date')
  const title = pick('title')
  const imageUrl = pick('imageUrl', 'image_url')
  // `url` 是 FinanceOS 那份清单当前的写法(它换过:product_url → url)。
  // 上游字段名会漂,这里多认几个别名的成本远低于"导进来一堆没有链接的东西"。
  const productUrl = pick('productUrl', 'product_url', 'url')
  const tier = pick('tier')
  if (orderId) out.orderId = orderId
  if (src) out.src = src
  if (date) out.date = date
  if (title) out.title = title
  if (imageUrl) out.imageUrl = imageUrl
  if (productUrl) out.productUrl = productUrl
  if (tier) out.tier = tier
  const amount = Number(p.amount ?? p.order_amount)
  if (Number.isFinite(amount) && amount !== 0) out.amount = Math.abs(amount)
  return Object.keys(out).length ? out : undefined
}

/**
 * 一条记录的身份 —— 用来判断"这件是不是已经导过了"。
 *
 * 优先订单号:它是 FinanceOS 那边的主键,最硬。但上游把 order_id 整个去掉过一次
 * (2026-07-15),只认订单号会让去重**静默失效** —— 重导一次就是几十件重复,而且
 * 一件都不会报错。所以退到商家原始标题(实测 85 件里 85 个不同值,够当键),再退到
 * 人话短名。
 *
 * @param {PurchaseInfo | undefined} purchase
 * @param {string} name
 * @returns {string}
 */
function identityOf(purchase, name) {
  return purchase?.orderId ?? purchase?.title ?? name
}

/** 人能读的备注:什么时候、多少钱、哪买的。链接不进备注 —— 那是 UI 的事。 */
function noteOf(purchase, guessed) {
  const bits = []
  if (purchase?.date) bits.push(purchase.date)
  if (purchase?.amount) bits.push(`$${purchase.amount.toFixed(2)}`)
  if (purchase?.src) bits.push(purchase.src)
  if (guessed) bits.push('自动归区待核对')
  return bits.join(' · ')
}

/**
 * 读出「有」的那批。同时接受中文键和英文键 —— 这份 JSON 是人手拼的,
 * 不该因为键名换了个写法就整批静默丢掉。
 * @param {any} raw
 * @returns {any[]}
 */
function ownedRows(raw) {
  const list = raw?.['有'] ?? raw?.owned ?? raw?.items
  return Array.isArray(list) ? list : []
}

/** @param {any} raw */
function notOwnedRows(raw) {
  const list = raw?.['没有'] ?? raw?.notOwned
  return Array.isArray(list) ? list : []
}

/**
 * 暂存网格:新建的家具摆哪。
 *
 * 摆在画布左上角起的一排,横向排开、放不下就换行。它们必然压在房间上、大概率
 * 标红(clash)—— 这是**故意的**:红色在说"这件还没安家,拖我走",而 clash 本来
 * 就只是警告、不阻止落位。摆到画布外则会被 rescueStrayPlacements 拽回来,
 * 且用户根本点不到它。
 */
const TRAY_MARGIN = 24
const TRAY_GAP = 12

/**
 * 算出这次导入会做什么。**不改任何东西** —— 交给调用方预览。
 *
 * @param {any} raw 解析好的 JSON
 * @param {{
 *   zones: SpatialStorageZone[],
 *   placements: SpatialPlacement[],
 *   pxPerFt: number,
 *   viewport: { width: number, height: number },
 *   now?: number,
 * }} ctx
 * @returns {{
 *   items: Array<{ zoneCode: string, zoneNameZh: string, item: SpatialStorageItem, guessed: boolean }>,
 *   claims: Array<{ id: string, label: string, kind: string, purchase: PurchaseInfo | undefined, name: string }>,
 *   creates: SpatialPlacement[],
 *   skipped: Array<{ name: string, why: string }>,
 *   notOwned: string[],
 * }}
 */
export function planInventoryImport(raw, ctx) {
  const { zones = [], placements = [], pxPerFt = 36, viewport, now = Date.now() } = ctx
  const rows = ownedRows(raw)

  /** @type {ReturnType<typeof planInventoryImport>} */
  const plan = { items: [], claims: [], creates: [], skipped: [], notOwned: notOwnedRows(raw) }

  // 已经导入过的东西 —— 再导一次不该长出第二份。导入是批量写,手滑点两次是
  // 迟早的事,而重复的代价是 48 件垃圾要一件件删。
  //
  // 只认**带 purchase 的**(即导入产物)。手工加的同名物品不算重复:那是用户自己
  // 录的,轮不到导入替他判断那是不是同一个东西。
  const seen = new Set()
  for (const z of zones) {
    for (const it of z.items ?? []) {
      if (it.purchase) seen.add(identityOf(it.purchase, it.name))
    }
  }
  for (const p of placements) {
    if (p.attrs?.purchase) seen.add(identityOf(p.attrs.purchase, p.label))
  }

  // 认领池:同类、且还没认领过的家具。认一件少一件,免得两台显示器认到同一件上。
  /** @type {Map<string, SpatialPlacement[]>} */
  const claimable = new Map()
  for (const p of placements) {
    if (p.attrs?.purchase) continue
    const list = claimable.get(p.kind) ?? []
    list.push(p)
    claimable.set(p.kind, list)
  }

  let trayX = TRAY_MARGIN
  let trayY = TRAY_MARGIN
  let rowH = 0

  for (const row of rows) {
    // `note` 是 FinanceOS 那份清单里放人话短名的字段 —— 认它,这样上游的原始
    // 条目可以原样贴进来,不用先手工改名成 `name`。
    const name = String(row?.name ?? row?.note ?? '').trim()
    if (!name) continue
    const purchase = purchaseOf(row)
    const identity = identityOf(purchase, name)
    if (seen.has(identity)) {
      plan.skipped.push({ name, why: '这一件已经导入过' })
      continue
    }
    seen.add(identity)

    const kind = row?.kind ? String(row.kind) : null
    const qty = Number(row?.qty) || 1

    // —— 杂物:进储藏区 ——
    if (!kind) {
      const { zone, guessed } = resolveZone(name, zones)
      if (!zone) {
        plan.skipped.push({ name, why: '这个家还没有任何储藏区' })
        continue
      }
      const tags = purchase?.tier ? [purchase.tier, ...(purchase.src ? [purchase.src] : [])] : []
      const item = createStorageItem(name, { qty, tags, note: noteOf(purchase, guessed), purchase }, now)
      if (!item) continue
      plan.items.push({ zoneCode: zone.code, zoneNameZh: zone.nameZh, item, guessed })
      continue
    }

    // —— 家具:先认领,再新建 ——
    const spec = PLACEMENT_KINDS[kind]
    if (!spec) {
      plan.skipped.push({ name, why: `分类 '${kind}' 不在 HomeOS 家具目录里` })
      continue
    }
    const pool = claimable.get(kind)
    const target = pool?.shift()
    if (target) {
      plan.claims.push({ id: target.id, label: target.label, kind, purchase, name })
      continue
    }
    const w = inchesToPx(spec.w, pxPerFt)
    const h = inchesToPx(spec.h, pxPerFt)
    if (viewport && trayX + w > viewport.width - TRAY_MARGIN) {
      trayX = TRAY_MARGIN
      trayY += rowH + TRAY_GAP
      rowH = 0
    }
    plan.creates.push({
      id: `imp-${plan.creates.length + 1}`,
      kind,
      label: spec.label,
      x: trayX,
      y: trayY,
      w,
      h,
      rotation: /** @type {0} */ (0),
      attrs: { purchase },
    })
    trayX += w + TRAY_GAP
    rowH = Math.max(rowH, h)
  }

  return plan
}
