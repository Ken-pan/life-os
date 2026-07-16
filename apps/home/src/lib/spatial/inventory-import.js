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
 * 那台"这条线真正接起来。
 *
 * 认领是这个文件里唯一会**出错而不报错**的地方,所以它占了大半篇幅:
 *   - 像不像,由 {@link claimScore} 按名字/样式/尺寸打分,不够像宁可新建({@link CLAIM_MIN_SCORE});
 *   - 谁配谁,由 {@link assignClaims} 全局比分决定,清单顺序不算证据;
 *   - 扫描把档位归粗了(它只认得「床」,认不出 King),由 {@link CLAIM_FAMILY} 找回来。
 * 认不上的才新建,摆进暂存网格等用户拖走。
 *
 * 全流程是**纯函数**:算出一个 plan 交给调用方预览,用户点了应用才落库。导入是
 * 批量写,不给人看一眼就直接改几十条数据是不礼貌的。
 */

/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */
/** @typedef {import('./types.js').SpatialStorageItem} SpatialStorageItem */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */
/** @typedef {import('./types.js').PurchaseInfo} PurchaseInfo */

import { PLACEMENT_KINDS, canonicalPlacementKind, inchesToPx } from './placements.js'
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
  // 退货状态只留「存疑」一档:ok 是缺省不值得记,returned/cancelled 压根进不了库
  // (在 planInventoryImport 里就被拦下了)。
  const disp = pick('disp')
  if (disp === 'maybe') out.disp = disp
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

/** 人能读的备注:什么时候、多少钱、哪买的、有什么要核对的。链接不进备注 —— 那是 UI 的事。 */
function noteOf(purchase, { guessed = false, dup = false } = {}) {
  const bits = []
  if (purchase?.date) bits.push(purchase.date)
  if (purchase?.amount) bits.push(`$${purchase.amount.toFixed(2)}`)
  if (purchase?.src) bits.push(purchase.src)
  if (purchase?.disp === 'maybe') bits.push('退货存疑')
  if (dup) bits.push('疑似重复购买')
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
 * 认领门槛,和「认不上就当矛盾扣掉」的分数。
 *
 * 门槛设在 0 是**故意不对称**的:0 分意味着"一条线索都没有"(纯英文商家标题、
 * 没实测尺寸),这时候照认 —— 图上有一台显示器、清单里买了一台显示器,不该因为
 * 标题是英文就不敢认。要拦的是**有线索且线索对不上**的那种,它扣到负分。
 *
 * 这个不对称来自代价不对称:漏认只是多一件摆在暂存网格里等着拖的家具,红着、
 * 一眼看得见;认错是在**正确的家具上贴了错误的购买记录** —— 图上完全看不出来,
 * 用户点开才发现他的床是 2025 年买的充气床垫。所以宁可漏,不可错。
 *
 * CLAIM_CONFLICT 压过任何加分之和(2 + 1 + 1.5),矛盾就是矛盾,尺寸再准也救不回来。
 */
const CLAIM_MIN_SCORE = 0
const CLAIM_CONFLICT = -6

/**
 * 认领家族:细分 kind → 扫描会把它归成的那个粗类目。
 *
 * RoomPlan 只认 bed/sofa/table/chair/storage/television 六个词(见
 * ios/home-scan/HomeScan/Convert/KindMaps.swift),它分不出 King 和 Queen,
 * 分不出双人沙发和三人沙发。**购买记录分得出** —— FLEXISPOT 那单的标题里就写着
 * King。所以一单 bed_king 得够得着图上那件叫「床」的 bed,否则家里真正那张床
 * 永远认不上:溯源要么空着,要么被同 kind 的充气床垫贴错。
 *
 * **单向,细 → 粗**。图上已经是 bed_king,说明有人明确指定过它是 King,
 * 一单 Queen 不该去认领它。所以这张表里没有反向条目,也不该有。
 *
 * 跨家族认领必须有实测尺寸背书(见 {@link sizeScore} 的 strict):家族认领的
 * 前提就是"扫描把档位归粗了,得靠尺寸找回来",没实测就没有依据,老实新建。
 * 这同时也是单人沙发不会去认领三人沙发的原因 —— 目录里它 32×34,对不上量出来的 84×36。
 */
const CLAIM_FAMILY = {
  bed_twin: 'bed',
  bed_full: 'bed',
  bed_king: 'bed',
  loveseat: 'sofa',
  armchair: 'sofa',
  coffee_table: 'table',
  desk: 'table',
  standing_desk: 'table',
  folding_table: 'table',
  office_chair: 'chair',
  // storage 一律落 cabinet,只有「开放架」会被 style 细分成 shelf
  shelf: 'cabinet',
  bookshelf: 'cabinet',
  cube_shelf: 'cabinet',
  wire_rack: 'cabinet',
  shoe_cabinet: 'cabinet',
  dresser: 'cabinet',
  nightstand: 'cabinet',
  wardrobe: 'cabinet',
}

/** 一段文字里的中文词块(连续汉字段)。 */
function cjkRuns(text) {
  return String(text ?? '').match(/[\u4e00-\u9fff]+/g) ?? []
}

/** 两个词从**尾巴**开始有多少个字是一样的。 */
function commonSuffixLen(a, b) {
  let n = 0
  while (n < a.length && n < b.length && a.at(-1 - n) === b.at(-1 - n)) n++
  return n
}

/**
 * 购买名对不对得上图上那件的 label。
 *
 * 中文名的中心词在**末尾**:「三层滚轮金属书架」是书架,而「充气床垫」不是床 ——
 * 尽管「床」确实在里面。一个裸的 includes() 正是让充气床垫认领了那张床的那行。
 * 所以只从词尾往前比,比中了几个字。这样两个方向都不用特判:名字说「空调」、
 * 图上叫「窗式空调」照样对得上,反过来也是。
 *
 * 对上两个字就算数(「钢线储物架」和「金属置物架」是同一排架子 —— 商家和目录
 * 各写各的词,不该因为用词不同就在图上多摆一排)。单字中心词(「床」「椅」「柜」,
 * RoomPlan 吐的就是这些)得整个对上才算。只对上末字算近义,低分照认。
 *
 * 一个字都对不上 = 矛盾。「床垫」不是「床」、「支架」不是「显示器」、「浴室地垫」
 * 不是「地毯」—— 都是这一条拦下的。
 *
 * 名字里一个汉字都没有("Samsung 27″ ViewFinity S9")是**没线索**,不是矛盾:
 * 给 0,让别的信号说话。label 没汉字(用户自己改名叫 "Ergotron HX")同理。
 *
 * @param {string} text 购买名 + 商家标题
 * @param {string} label 图上那件的名字
 */
function nameTextScore(text, label) {
  // label 可能是「L形沙发」「双人床 Queen」这种中英混排,中心词取最后一个中文词块。
  // 混排会把词切碎(「L形沙发」→「形沙发」),这也是这里比后缀而不是比整词的原因之一。
  const head = cjkRuns(label).at(-1)
  const runs = cjkRuns(text)
  if (!head || !runs.length) return 0
  const hit = Math.max(...runs.map((r) => commonSuffixLen(r, head)))
  if (hit >= Math.min(2, head.length)) return 2
  return hit ? 0.8 : CLAIM_CONFLICT
}

/**
 * 样式对不对得上。提到了加分,没提到**不减分** —— 商家标题不写「L形」写
 * sectional,不提不代表不是。所以它只配当同类多件时的分辨器。
 * @param {string} text
 * @param {string} [styleZh]
 */
function styleScore(text, styleZh) {
  return styleZh && text.includes(styleZh) ? 1 : 0
}

/** 两个脚印差多少:取差得最狠的那条边的相对差。 */
function fitErr(aw, ad, bw, bd) {
  return Math.max(Math.abs(aw - bw) / Math.max(aw, bw), Math.abs(ad - bd) / Math.max(ad, bd))
}

/**
 * 差多少算"不是同一件":三成。
 * 挑不出更硬的依据,但它得是个**连续**的分而不是几档阶梯 —— 分档的话
 * 「量出来 60×80 的那张」和「量出来 76×80 的那张」会落进同一档、打成平手,
 * 而分辨这两张正是尺寸在这儿的全部用处。
 */
const SIZE_TOL = 0.3

/** 脚印吻合度:一模一样 = 1,差到容差线 = 0,再往下是负的。 */
const sizeFit = (err) => 1 - err / SIZE_TOL

/**
 * 尺寸对不对得上。
 *
 * 图上那侧只认 attrs.measuredWIn/HIn:placement 的 w/h 是像素、且用户随手拖改过,
 * 拿它当真值等于拿用户上次手滑当证据。measured 是 LiDAR 实测,不动(见 types.js)。
 *
 * 购买那侧优先用上游实测(dims 的 w+d 齐全才算 —— 只有 h 是离地高度、size 是
 * 一个孤零零的数,都说明不了脚印)。
 *
 * 目录尺寸和实测尺寸**一样重**,差别只在**否决权**:
 *
 *   - 两边都是量出来的,差三成就是两件东西 —— 和文字矛盾一样直接否决。图上的
 *     「餐桌」量出来 60×36,我买的备餐台上游量的是 24×24,「都是桌」一点都不重要。
 *   - 退到目录尺寸时**不否决**:目录写的是「这类一般多大」,真沙发比目录窄半尺是
 *     常事,拿一把橡皮尺去否决正确的认领,换来的是一屋子该认没认的家具。
 *
 * 但"不能否决"不等于"不该排序"—— 这两件事我一开始混为一谈,把目录尺寸压成了
 * 三分之一的推手,结果是它连 Queen 和 King 都分不动。目录里的床是标准尺寸
 * (见 PLACEMENT_KINDS 头注:mattress sizes),60×80 和 76×80 的差别是**真的**,
 * 拿它排序完全站得住。所以权重给满,只把负向截在 -0.8:名字像样地命中(+2)时
 * 总分仍然为正,否决权还是在实测手里。
 *
 * strict = 跨家族认领(见 {@link CLAIM_FAMILY}):这时候尺寸是**唯一**能定档位的
 * 依据,所以目录尺寸也拿到否决权,连实测缺失都算否决 —— 没依据就别猜。
 *
 * 两侧朝向未必一致(measured 是实测脚印,plan 上那件可能转过 90°),所以两种摆法
 * 都试,取像的那个。
 *
 * @param {any} row
 * @param {{ w: number, h: number }} spec
 * @param {SpatialPlacement} target
 * @param {boolean} [strict] 跨家族认领:尺寸对不上、或压根没实测,都直接否决
 */
function sizeScore(row, spec, target, strict = false) {
  const mw = Number(target.attrs?.measuredWIn)
  const mh = Number(target.attrs?.measuredHIn)
  if (!(mw > 0 && mh > 0)) return strict ? CLAIM_CONFLICT : 0
  const measured = Number(row?.dims?.w) > 0 && Number(row?.dims?.d) > 0
  const rw = measured ? Number(row.dims.w) : Number(spec.w)
  const rd = measured ? Number(row.dims.d) : Number(spec.h)
  if (!(rw > 0 && rd > 0)) return strict ? CLAIM_CONFLICT : 0
  const err = Math.min(fitErr(rw, rd, mw, mh), fitErr(rw, rd, mh, mw))
  if (measured || strict) return err > SIZE_TOL ? CLAIM_CONFLICT : 1.5 * sizeFit(err)
  return Math.max(-0.8, 1.5 * sizeFit(err))
}

/**
 * 图上这件,是不是我买的这件?越高越像;低于 {@link CLAIM_MIN_SCORE} 宁可不认。
 *
 * 这个函数存在的理由是两条实测误配,而且两条都不报错:Intex 充气床垫认领了图上
 * 唯一的「床」(真床是清单后面那条 FLEXISPOT bed_king),BLUEAIR 空净认领了被归到
 * air_purifier 的「窗式空调」。共同点是旧的先到先得**从来没看过名字** —— kind
 * 撞上就抓走,而 kind 是扫描给的粗类目:RoomPlan 只吐 bed/sofa/table/chair/
 * storage/television 六个词(见 ios/…/KindMaps.swift),它分不出 King 和充气垫,
 * 分不出净化器和空调。名字和尺寸能。
 *
 * @param {any} row
 * @param {string} name
 * @param {PurchaseInfo | undefined} purchase
 * @param {{ w: number, h: number }} spec
 * @param {SpatialPlacement} target
 * @param {boolean} [strict] 跨家族认领 —— 尺寸拿到否决权,见 {@link CLAIM_FAMILY}
 */
function claimScore(row, name, purchase, spec, target, strict = false) {
  const text = `${name} ${purchase?.title ?? ''}`
  return (
    nameTextScore(text, target.label) +
    styleScore(text, target.attrs?.styleZh) +
    sizeScore(row, spec, target, strict)
  )
}

/**
 * 给一件家具挑认领对象:同 kind 的,加上家族里那个粗类目的。
 * @param {Map<string, SpatialPlacement[]>} claimable
 * @param {string} kind
 */
function claimCandidates(claimable, kind) {
  const coarse = CLAIM_FAMILY[kind]
  return [...(claimable.get(kind) ?? []), ...(coarse ? (claimable.get(coarse) ?? []) : [])]
}

/**
 * 谁认领谁 —— 全局挑分最高的配对,而不是让清单顺序说了算。
 *
 * 逐行贪心(每行自己挑最像的、挑完就走)修不了用户报的那个 bug:Intex 充气床垫
 * 在清单里排在 FLEXISPOT 前面,轮到它时那张床还空着,它抓走就完了 —— 哪怕后面
 * 那条 King 明显更像。所以要把所有(行 × 候选)的分数一次算完,从最高分开始配,
 * 配过的行和候选都划掉。清单顺序只在**平分**时才说话(sort 是稳定的,pair 按
 * 行序、候选序生成)—— 同样像的两件,没理由推翻输入顺序。
 *
 * 这仍然是**贪心**,不是最优二分匹配:高分对先占,可能把某行唯一的候选占掉,
 * 让它去新建,而换一种配法两件都能认上。没上匈牙利是因为代价不对称 —— 贪心配错
 * 的方向是"少认一件"(那件红着摆在暂存网格里,一眼看得见),不是贴错溯源;
 * 而 O(n³) 的匹配器要多几十行、多一套自己的测试,换一个几十件规模上构造得出、
 * 实测中没出现过的收益。真遇到了再说。
 *
 * @param {Array<{ row: any, name: string, purchase: PurchaseInfo | undefined, kind: string, spec: any }>} furniture
 * @param {Map<string, SpatialPlacement[]>} claimable
 * @returns {Map<number, SpatialPlacement>} 行下标 → 认领到的那件
 */
function assignClaims(furniture, claimable) {
  const pairs = []
  furniture.forEach((f, i) => {
    for (const cand of claimCandidates(claimable, f.kind)) {
      const score = claimScore(f.row, f.name, f.purchase, f.spec, cand, cand.kind !== f.kind)
      if (score >= CLAIM_MIN_SCORE) pairs.push({ i, cand, score })
    }
  })
  pairs.sort((a, b) => b.score - a.score)

  /** @type {Map<number, SpatialPlacement>} */
  const assigned = new Map()
  const taken = new Set()
  for (const p of pairs) {
    if (assigned.has(p.i) || taken.has(p.cand.id)) continue
    assigned.set(p.i, p.cand)
    taken.add(p.cand.id)
  }
  return assigned
}

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

  // 认领池:还没被认领过的家具,按 kind 索引。认一件少一件,免得两台显示器
  // 认到同一件上 —— 这条现在由 assignClaims 的 taken 集合保证。
  /** @type {Map<string, SpatialPlacement[]>} */
  const claimable = new Map()
  for (const p of placements) {
    if (p.attrs?.purchase) continue
    const list = claimable.get(p.kind) ?? []
    list.push(p)
    claimable.set(p.kind, list)
  }

  // 家具行先攒着,不当场决定认谁 —— 认领要全局比完分才知道谁配谁(见 assignClaims)。
  // 杂物那一路没有这个问题,当场落。
  /** @type {Array<{ row: any, name: string, purchase: PurchaseInfo | undefined, kind: string, spec: any }>} */
  const furniture = []

  for (const row of rows) {
    // `note` 是 FinanceOS 那份清单里放人话短名的字段 —— 认它,这样上游的原始
    // 条目可以原样贴进来,不用先手工改名成 `name`。
    const name = String(row?.name ?? row?.note ?? '').trim()
    if (!name) continue
    // 退掉/取消的东西**不在家里** —— 导进来,整理计划就会给一件不存在的东西找家。
    // 但也不能静默吞:进 skipped 让预览看得见"为什么少了 7 件"。
    // `maybe`(同单有退货、分不清退的哪件)大概率还在,照导,由 purchase.disp 带上存疑标记。
    if (row?.disp === 'returned' || row?.disp === 'cancelled') {
      plan.skipped.push({ name, why: row.disp === 'returned' ? '已退货,不在家里' : '订单取消,从未送达' })
      continue
    }
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
      if (purchase?.disp === 'maybe') tags.push('退货存疑')
      const item = createStorageItem(
        name,
        { qty, tags, note: noteOf(purchase, { guessed, dup: row?.dup === true }), purchase },
        now,
      )
      if (!item) continue
      plan.items.push({ zoneCode: zone.code, zoneNameZh: zone.nameZh, item, guessed })
      continue
    }

    // —— 家具:攒起来,等全局配对 ——
    // 别名(pet_fence)先解析成目录键:上游分类器的用词不由目录说了算,
    // 但新建/认领落库的 kind 必须是目录键,否则整条围栏语义链对它失效
    const kindKey = canonicalPlacementKind(kind)
    const spec = PLACEMENT_KINDS[kindKey]
    if (!spec) {
      plan.skipped.push({ name, why: `分类 '${kind}' 不在 HomeOS 家具目录里` })
      continue
    }
    furniture.push({ row, name, purchase, kind: kindKey, spec })
  }

  // —— 认领:全局配对,分最高的先配 ——
  const assigned = assignClaims(furniture, claimable)

  // —— 认不上的才新建,按清单原顺序摆进暂存网格 ——
  let trayX = TRAY_MARGIN
  let trayY = TRAY_MARGIN
  let rowH = 0

  furniture.forEach(({ row, name, purchase, kind, spec }, i) => {
    const target = assigned.get(i)
    if (target) {
      plan.claims.push({ id: target.id, label: target.label, kind, purchase, name })
      return
    }
    // 上游给了实测占地就用实测 —— 目录尺寸是「这类一般多大」,买回来那件是「就这么大」。
    // 只认 w+d 齐全的:dims.h 是离地高度,画到平面图上就成了进深错一倍的家具。
    const footprint = Number(row?.dims?.w) > 0 && Number(row?.dims?.d) > 0 ? row.dims : spec
    const w = inchesToPx(Number(footprint.w), pxPerFt)
    const h = inchesToPx(Number(footprint.d ?? footprint.h), pxPerFt)
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
      // staged:还在暂存网格里、没安家。动线/占地分析必须跳过它 —— 一批导入的
      // 家具全叠在画布左上,不标的话卫生间"76% 被占"、门"被堵",整理计划全是幻影,
      // 还会把真实瓶颈藏起来(走不到的格子测不出宽度)。用户拖到位时摘掉。
      attrs: { purchase, staged: true },
    })
    trayX += w + TRAY_GAP
    rowH = Math.max(rowH, h)
  })

  return plan
}
