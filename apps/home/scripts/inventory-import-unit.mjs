import assert from 'node:assert/strict'
import { planInventoryImport, resolveZone } from '../src/lib/spatial/inventory-import.js'
import { normalizeZoneItems, createStorageItem } from '../src/lib/spatial/storage-items.js'
import { hydrateProject } from '../src/lib/spatial/model.js'
import { SAMPLE_508 } from '../src/lib/spatial/sample-508.js'

const P = hydrateProject(SAMPLE_508)
const ZONES = P.storageZones
const ctx = (over = {}) => ({
  zones: ZONES,
  placements: [],
  pxPerFt: 36,
  viewport: P.viewport,
  now: 0,
  ...over,
})

// —— 分两路 ——
// 带 kind 的是家具(围栏不是被收进柜子的东西),不带的才是储藏物品。
// 混成一路正是这个模块存在要防的事。
{
  const plan = planInventoryImport(
    {
      有: [
        { kind: 'pet_pen', name: '宠物围栏', qty: 1 },
        { kind: null, name: 'Instant Pot Pro 压力锅', qty: 1 },
      ],
    },
    ctx(),
  )
  assert.equal(plan.creates.length, 1, '围栏该进平面图')
  assert.equal(plan.creates[0].kind, 'pet_pen')
  assert.equal(plan.items.length, 1, '压力锅该进储藏区')
  assert.match(plan.items[0].item.name, /压力锅/)
}

// —— kind 别名 ——
// 上游分类器会自造词(云端优化副本里的狗狗围栏就是 pet_fence)。
// 别名要在这里解析成目录键落库,不能一句「不在目录里」跳过,更不能原词入库。
{
  const plan = planInventoryImport(
    { 有: [{ kind: 'pet_fence', name: '狗狗围栏', qty: 1 }] },
    ctx(),
  )
  assert.equal(plan.skipped.length, 0, 'pet_fence 不该被当成目录外分类跳过')
  assert.equal(plan.creates.length, 1)
  assert.equal(plan.creates[0].kind, 'pet_pen', '落库的是目录键,不是上游自造词')
}

// —— 认领优先 ——
// 扫描早就知道书架在哪。新建一件飘着的等用户拖,既重复又丢了位置。
{
  const scanned = [
    { id: 'pl-9', kind: 'bookshelf', label: '书架', x: 100, y: 200, w: 40, h: 20, rotation: 0 },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'bookshelf', name: '44″ 三层滚轮金属书架', purchase: { order_id: 'A1' } }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.creates.length, 0, '有同类家具时不该新建')
  assert.equal(plan.claims.length, 1)
  assert.equal(plan.claims[0].id, 'pl-9', '该认领扫描出来的那一件')
  assert.equal(plan.claims[0].purchase.orderId, 'A1')
}

// 认一件少一件 —— 两台显示器不能认到同一件上。
{
  const scanned = [
    { id: 'pl-1', kind: 'monitor', label: '显示器', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
  ]
  const plan = planInventoryImport(
    {
      有: [
        { kind: 'monitor', name: 'ASUS ROG', purchase: { order_id: 'A1' } },
        { kind: 'monitor', name: 'Ergotron 支架', purchase: { order_id: 'A2' } },
      ],
    },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 1, '只有一件可认领')
  assert.equal(plan.creates.length, 1, '第二台该新建,不能重复认领同一件')
}

// —— 认领要看名字,不是撞上 kind 就抓走 ——
// 实测(docs/financeos-home-items.json)踩到的两条,而且两条都不报错:
// 1) Intex 充气床垫(kind bed)认领了图上唯一的「床」,真床是清单后面那条
//    FLEXISPOT bed_king —— 结果是床上贴着一张 2025 年的充气垫订单。
// 认错不像漏认那样看得见:图上一切正常,点开才发现溯源是错的。所以宁可漏。
{
  const scanned = [{ id: 'pl-b', kind: 'bed', label: '床', x: 100, y: 100, w: 180, h: 240, rotation: 0 }]
  const plan = planInventoryImport(
    { 有: [{ kind: 'bed', name: 'Intex 18″ Queen 充气床垫（带床头板）', title: 'Intex 18" Pillow Top Air Mattress' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 0, '充气床垫不是床 —— 「床」只是「床垫」的前半截')
  assert.equal(plan.creates.length, 1, '认不上就新建,摆进暂存等用户拖')
  assert.equal(plan.creates[0].attrs.staged, true)
}

// 2) BLUEAIR 空净认领了被扫描归成 air_purifier 的「窗式空调」——
//    kind 是扫描给的粗类目,它分不出净化器和空调,名字能。
{
  const scanned = [
    { id: 'pl-ac', kind: 'air_purifier', label: '窗式空调', x: 0, y: 0, w: 40, h: 20, rotation: 0 },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'air_purifier', name: 'BLUEAIR 空净+唤醒灯（卧室）', title: 'BLUEAIR Air Purifier & Sunrise Alarm Clock' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 0, '空净不该认领空调')
  assert.equal(plan.creates.length, 1)
  // 同一台净化器遇上真的净化器就该认 —— 拦的是对不上,不是把认领关掉
  const real = [
    { id: 'pl-ap', kind: 'air_purifier', label: '空气净化器', x: 0, y: 0, w: 40, h: 20, rotation: 0 },
  ]
  const ok = planInventoryImport(
    { 有: [{ kind: 'air_purifier', name: 'Dyson Cool Gen1 TP10 塔扇净化器' }] },
    ctx({ placements: real }),
  )
  assert.equal(ok.claims.length, 1, '塔扇净化器和空气净化器末字同 —— 该认')
  assert.equal(ok.claims[0].id, 'pl-ap')
}

// —— 家族认领:细 kind 够得着扫描给的粗类目 ——
// 上面那条只做到「不贴错」,没做到「贴对」:真床还是认不上,因为 RoomPlan 只吐
// bed(见 KindMaps.swift),而 FLEXISPOT 那单是 bed_king,kind 对不上、够不着。
// 这是原始 bug 的另一半 —— 图上那张床要么空着溯源,要么被充气床垫贴错。
{
  const scanned = [
    {
      id: 'pl-b',
      kind: 'bed',
      label: '床',
      x: 100, y: 100, w: 228, h: 240, rotation: 0,
      attrs: { measuredWIn: 76, measuredHIn: 80 }, // 量出来就是 King
    },
  ]
  const plan = planInventoryImport(
    {
      有: [
        // 清单原顺序:充气床垫(2025-10)排在 FLEXISPOT(2026-06)前面
        { kind: 'bed', name: 'Intex 18″ Queen 充气床垫（带床头板）', purchase: { order_id: 'A1' } },
        { kind: 'bed_king', name: 'FLEXISPOT Hako G2 实木平台床 King（带储物床头板）', purchase: { order_id: 'A2' } },
      ],
    },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 1)
  assert.equal(plan.claims[0].purchase.orderId, 'A2', '真床该认到 King 那单,不是排在前面的充气垫')
  assert.equal(plan.creates.length, 1, '充气床垫新建')
  assert.equal(plan.creates[0].attrs.purchase.orderId, 'A1')
}

// 全局配对:排在前面的不该抢走后面那条明显更像的。
// 逐行贪心修不了这个 —— 轮到第一条时候选还空着,它抓走就完了。
{
  const scanned = [
    {
      id: 'pl-b',
      kind: 'bed',
      label: '床',
      x: 0, y: 0, w: 228, h: 240, rotation: 0,
      attrs: { measuredWIn: 76, measuredHIn: 80 },
    },
  ]
  const plan = planInventoryImport(
    {
      有: [
        // 两条都是正经床、名字都对得上「床」,只有尺寸能分辨
        { kind: 'bed', name: 'Zinus Queen 实木平台床', purchase: { order_id: 'Q' } },
        { kind: 'bed_king', name: 'FLEXISPOT King 实木平台床', purchase: { order_id: 'K' } },
      ],
    },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims[0]?.purchase.orderId, 'K', '量出来 76×80 的是 King,该 King 认走')
}

// 家族认领必须有实测背书 —— 没实测就没有定档位的依据,老实新建。
{
  const noMeasure = [{ id: 'pl-b', kind: 'bed', label: '床', x: 0, y: 0, w: 228, h: 240, rotation: 0 }]
  const plan = planInventoryImport(
    { 有: [{ kind: 'bed_king', name: 'FLEXISPOT King 实木平台床' }] },
    ctx({ placements: noMeasure }),
  )
  assert.equal(plan.claims.length, 0, '没实测时不该跨 kind 猜档位')
  assert.equal(plan.creates.length, 1)
  // 同 kind 精确匹配不受这条约束:kind 已经说明了档位,不需要尺寸背书
  const exact = planInventoryImport(
    { 有: [{ kind: 'bed', name: 'Zinus 实木平台床' }] },
    ctx({ placements: noMeasure }),
  )
  assert.equal(exact.claims.length, 1, '同 kind 不需要尺寸背书')
}

// 单人沙发不该认领三人沙发 —— 家族够得着,但目录尺寸 32×34 对不上量出来的 84×36。
// 尺寸在跨家族时是唯一的档位依据,所以它在这儿有否决权。
{
  const scanned = [
    {
      id: 'pl-s',
      kind: 'sofa',
      label: '沙发',
      x: 0, y: 0, w: 252, h: 108, rotation: 0,
      attrs: { measuredWIn: 84, measuredHIn: 36 },
    },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'armchair', name: 'IKEA 单人沙发' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 0, '单人沙发认不了量出来 84×36 的三人沙发')
}

// 反过来,量出来 66×34 的那件更像双人沙发(目录 58×36)而不是三人沙发(84×36)——
// 家族认领 + 尺寸排序该把它判给 loveseat。
{
  const scanned = [
    {
      id: 'pl-s',
      kind: 'sofa',
      label: '沙发',
      x: 0, y: 0, w: 198, h: 102, rotation: 0,
      attrs: { measuredWIn: 66, measuredHIn: 34 },
    },
  ]
  const plan = planInventoryImport(
    {
      有: [
        { kind: 'sofa', name: '三人沙发', purchase: { order_id: 'S3' } },
        { kind: 'loveseat', name: '双人沙发', purchase: { order_id: 'S2' } },
      ],
    },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims[0]?.purchase.orderId, 'S2', '66″ 更像双人沙发,尺寸说了算')
}

// 单向:图上已经是 bed_king,说明有人明确指定过它是 King —— 一单 Queen 不该认领它。
{
  const king = [
    {
      id: 'pl-k',
      kind: 'bed_king',
      label: '大床 King',
      x: 0, y: 0, w: 228, h: 240, rotation: 0,
      attrs: { measuredWIn: 76, measuredHIn: 80 },
    },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'bed', name: 'Zinus Queen 实木平台床' }] },
    ctx({ placements: king }),
  )
  assert.equal(plan.claims.length, 0, '粗 kind 不该反向认领已经指定过档位的细 kind')
}

// 商家标题是英文、又没实测尺寸 = **一条线索都没有**,不是矛盾 —— 照认。
// 把没线索当矛盾会把认领功能整个关掉:图上一台显示器、清单里买了一台显示器,
// 不该因为标题是英文就多摆一件。
{
  const scanned = [
    { id: 'pl-m', kind: 'monitor', label: '显示器', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'monitor', name: 'Samsung 27″ ViewFinity S9 5K', title: 'Samsung - 27" ViewFinity S9 5K IPS Smart Monitor' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 1, '没线索时该认,不能因为标题是英文就不敢认')
}

// 用词不同不算矛盾:目录写「金属置物架」、商家写「钢线储物架」,是同一排架子。
// 只有末字都对不上才算矛盾(架 vs 垫)。
{
  const scanned = [
    { id: 'pl-r', kind: 'wire_rack', label: '金属置物架', x: 0, y: 0, w: 40, h: 20, rotation: 0 },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'wire_rack', name: 'Seville 重型 NSF 钢线储物架' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 1, '近义词该认,不然同一排架子会在图上出现两遍')
}

// 显示器支架不是显示器 —— 实测里 Ergotron / Pixio 两条都挂着 kind monitor。
{
  const scanned = [
    { id: 'pl-m', kind: 'monitor', label: '显示器', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'monitor', name: 'Ergotron HX 双屏支架（桌面 VESA）' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 0, '支架不该认领显示器')
}

// —— 同类多件:挑最像的,不是挑第一件 ——
// 顺序是扫描给的,不是证据。
{
  const scanned = [
    { id: 'pl-s1', kind: 'sofa', label: '沙发', x: 0, y: 0, w: 100, h: 40, rotation: 0 },
    {
      id: 'pl-s2',
      kind: 'sofa',
      label: 'L形沙发',
      x: 200, y: 0, w: 120, h: 60, rotation: 0,
      attrs: { styleZh: 'L形' },
    },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'sofa', name: 'HONBAY L形转角沙发（右贵妃）' }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 1)
  assert.equal(plan.claims[0].id, 'pl-s2', '买的是 L 形,该认 L 形那件,哪怕它排在后面')
}

// 平分时保持输入顺序 —— 同样像就没理由推翻扫描给的顺序。
{
  const scanned = [
    { id: 'pl-a', kind: 'sofa', label: '沙发', x: 0, y: 0, w: 100, h: 40, rotation: 0 },
    { id: 'pl-b', kind: 'sofa', label: '沙发', x: 200, y: 0, w: 100, h: 40, rotation: 0 },
  ]
  const plan = planInventoryImport(
    {
      有: [
        { kind: 'sofa', name: '宜家 KIVIK 三人沙发', purchase: { order_id: 'A1' } },
        { kind: 'sofa', name: '宜家 VIMLE 三人沙发', purchase: { order_id: 'A2' } },
      ],
    },
    ctx({ placements: scanned }),
  )
  assert.deepEqual(plan.claims.map((c) => c.id), ['pl-a', 'pl-b'], '平分不该打乱顺序')
}

// —— 尺寸:实测是分辨同类的那把尺 ——
// 两张床名字都对得上「床」,靠脚印分:买的是 Queen(60×80),就该认量出来 60×80 的那张,
// 而不是量出来 76×80 的 King。
{
  const beds = [
    {
      id: 'pl-king',
      kind: 'bed',
      label: '床',
      x: 0, y: 0, w: 228, h: 240, rotation: 0,
      attrs: { measuredWIn: 76, measuredHIn: 80 },
    },
    {
      id: 'pl-queen',
      kind: 'bed',
      label: '床',
      x: 400, y: 0, w: 180, h: 240, rotation: 0,
      attrs: { measuredWIn: 60.5, measuredHIn: 79 },
    },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'bed', name: 'Zinus 实木平台床' }] },
    ctx({ placements: beds }),
  )
  assert.equal(plan.claims[0]?.id, 'pl-queen', 'Queen 该认量出来是 Queen 的那张,哪怕 King 排在前面')
}

// 两边都是量出来的,差三成就是两件东西 —— 直接否决,不然「都是桌」那 +2 永远压着尺寸。
{
  const dining = [
    {
      id: 'pl-t',
      kind: 'table',
      label: '餐桌',
      x: 0, y: 0, w: 180, h: 108, rotation: 0,
      attrs: { measuredWIn: 60, measuredHIn: 36 },
    },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'table', name: '折叠餐桌', dims: { w: 24, d: 24 } }] },
    ctx({ placements: dining }),
  )
  assert.equal(plan.claims.length, 0, '24×24 认不了量出来 60×36 的那张,名字再对也不行')
  // 实测对得上就该认(朝向不同也算 —— measured 是脚印,图上那件可能转过 90°)
  const fits = planInventoryImport(
    { 有: [{ kind: 'table', name: '折叠餐桌', dims: { w: 36, d: 60 } }] },
    ctx({ placements: dining }),
  )
  assert.equal(fits.claims.length, 1, '转过 90° 的同一张桌子该认')
}

// 目录尺寸只是「这类一般多大」,不能拿它否决:真沙发比目录窄半尺是常事,
// 拿一把橡皮尺去否决,换来的是一屋子该认没认的家具。
{
  const narrow = [
    {
      id: 'pl-s',
      kind: 'sofa',
      label: '沙发',
      x: 0, y: 0, w: 200, h: 100, rotation: 0,
      attrs: { measuredWIn: 66, measuredHIn: 34 }, // 目录是 84×36
    },
  ]
  const plan = planInventoryImport({ 有: [{ kind: 'sofa', name: '三人沙发' }] }, ctx({ placements: narrow }))
  assert.equal(plan.claims.length, 1, '目录尺寸对不上不该否决 —— 它只是个平均数')
}

// w/h 是像素、且用户随手拖改过,不能当尺子。
{
  const dragged = [{ id: 'pl-d', kind: 'bed', label: '床', x: 0, y: 0, w: 9, h: 9, rotation: 0 }]
  const plan = planInventoryImport(
    { 有: [{ kind: 'bed', name: 'Zinus 实木平台床', dims: { w: 60, d: 80 } }] },
    ctx({ placements: dragged }),
  )
  assert.equal(plan.claims.length, 1, '没实测时不该拿被拖改过的 w/h 当证据')
}

// 已经认领过(带 purchase)的家具不该被再认一次 —— 否则重导会盖掉溯源。
{
  const scanned = [
    {
      id: 'pl-1',
      kind: 'monitor',
      label: '显示器',
      x: 0, y: 0, w: 10, h: 10, rotation: 0,
      attrs: { purchase: { orderId: 'OLD' } },
    },
  ]
  const plan = planInventoryImport(
    { 有: [{ kind: 'monitor', name: 'ASUS', purchase: { order_id: 'NEW' } }] },
    ctx({ placements: scanned }),
  )
  assert.equal(plan.claims.length, 0, '不该抢已认领的')
  assert.equal(plan.creates.length, 1)
}

// —— 幂等:同一单不会导入两次 ——
// 导入是批量写,手滑点两次是迟早的事。
{
  const row = { kind: null, name: '压力锅', purchase: { order_id: 'ORD-1' } }
  const zonesWith = normalizeZoneItems(
    ZONES.map((z, i) =>
      i === 0
        ? {
            ...z,
            items: [
              ...z.items,
              createStorageItem('压力锅', { purchase: { orderId: 'ORD-1' } }, 0),
            ],
          }
        : z,
    ),
  )
  const plan = planInventoryImport({ 有: [row] }, ctx({ zones: zonesWith }))
  assert.equal(plan.items.length, 0, '这一单已经在库里了')
  assert.equal(plan.skipped.length, 1)
  assert.match(plan.skipped[0].why, /导入过/)

  // 同一批里出现两次同一单也只算一次
  const twice = planInventoryImport({ 有: [row, { ...row }] }, ctx())
  assert.equal(twice.items.length, 1, '同一批里的重复单也要去重')
  assert.equal(twice.skipped.length, 1)
}

// 去重不能只靠订单号 —— 上游把 order_id 整个去掉过一次(2026-07-15)。
// 只认订单号的话,重导会静默产出几十件重复,一个错都不报。退到商家标题。
{
  const noOrderId = { kind: null, name: '气泡水机', purchase: { title: 'Breville InFizz Fusion' } }
  const zonesWith = normalizeZoneItems(
    ZONES.map((z, i) =>
      i === 0
        ? {
            ...z,
            items: [
              ...z.items,
              createStorageItem('气泡水机', { purchase: { title: 'Breville InFizz Fusion' } }, 0),
            ],
          }
        : z,
    ),
  )
  assert.equal(
    planInventoryImport({ 有: [noOrderId] }, ctx({ zones: zonesWith })).items.length,
    0,
    '没有订单号时该按标题去重',
  )
  // 连标题都没有就退到名字
  const bare = { kind: null, name: '门后挂篮' }
  const zonesBare = normalizeZoneItems(
    ZONES.map((z, i) =>
      i === 0
        ? { ...z, items: [...z.items, createStorageItem('门后挂篮', { purchase: { tier: 'C' } }, 0)] }
        : z,
    ),
  )
  assert.equal(
    planInventoryImport({ 有: [bare] }, ctx({ zones: zonesBare })).items.length,
    0,
    '标题也没有时该按名字去重',
  )
  // 家具那一路同样要挡住:重导不能把认领过的家具再新建一份
  const claimed = [
    {
      id: 'pl-1',
      kind: 'tv',
      label: '电视',
      x: 0, y: 0, w: 10, h: 10, rotation: 0,
      attrs: { purchase: { title: 'Samsung 65 S90D' } },
    },
  ]
  const again = planInventoryImport(
    { 有: [{ kind: 'tv', name: 'Samsung 65″ S90D OLED', purchase: { title: 'Samsung 65 S90D' } }] },
    ctx({ placements: claimed }),
  )
  assert.equal(again.creates.length, 0, '重导不该把已认领的家具再建一份')
  assert.equal(again.claims.length, 0)
  assert.equal(again.skipped.length, 1)
}

// 手工加的同名物品不算「导入过」—— 那是用户自己录的,轮不到导入替他判断。
{
  const zonesManual = normalizeZoneItems(
    ZONES.map((z, i) =>
      i === 0 ? { ...z, items: [...z.items, createStorageItem('压力锅', {}, 0)] } : z,
    ),
  )
  const plan = planInventoryImport(
    { 有: [{ kind: null, name: '压力锅', purchase: { title: 'Instant Pot Pro' } }] },
    ctx({ zones: zonesManual }),
  )
  assert.equal(plan.items.length, 1, '手工录的同名物品不该挡住导入')
}

// —— 自动归区 ——
// 规则给的是线索词,拿去和区的「名字+位置」比对 —— 用户改了区名也还能用。
{
  const cases = [
    ['KitchenAid 8 杯电饭煲（带秤）', 'S2'],
    ['Instant Pot Pro 10 合 1 压力锅', 'S2'],
    ['Cheerble 4L 无泵宠物饮水机', 'S2'],
    ['Roborock F25 ACE 洗地机（含底座）', 'S8'],
    ['DREAME N20 蒸汽地毯机', 'S8'],
    ['Breville InFizz Fusion 气泡水机', 'S2'],
    ['沥水碗碟架 18×15.8″', 'S2'],
    ['竹制可伸缩调料架', 'S2'],
    ['Canon imageCLASS MF273dw 激光打印机', 'S4'],
    ['RØDE PSA1+ 悬臂麦架', 'S4'],
    ['Bambu Lab H2C AMS Combo 3D 打印机', 'S4'],
    // 影音规则必须排在「货架」规则之前,否则 S4(钢丝补给货架)先命中 ——
    // 回音壁是装在电视下面的,不是搁在开放钢丝架上的
    ['Samsung HW-S801D 回音壁+无线低音炮', 'S3'],
    ['Samsung 65″ S90D OLED 4K 电视', 'S3'],
    ['3 抽透明收纳柜', 'S1'],
    // 明写了「格子柜用」,必须进方格柜 —— 通用「收纳箱」规则不能先抢走它
    ['13×13″ 布艺收纳箱 ×6（格子柜用）', 'S3'],
    ['Nazhura 72 夸脱大储物箱 ×2', 'S1'],
    ['门后多功能挂篮', 'S1'],
    ['Blueair InvisibleMist 加湿器 0.9gal', 'S7'],
  ]
  for (const [name, want] of cases) {
    const { zone, guessed } = resolveZone(name, ZONES)
    assert.equal(zone?.code, want, `「${name}」该进 ${want},结果 ${zone?.code}`)
    assert.equal(guessed, true, '规则猜的就得标 guessed,UI 要据此提示待核对')
  }
  // 猜不出的落兜底区,不能凭空丢掉
  const { zone } = resolveZone('完全认不出的东西', ZONES)
  assert.ok(zone, '猜不出也必须有个去处,不能静默丢件')
}

// 归区是猜的 —— 备注必须写明,否则用户不知道哪些需要核对。
{
  const plan = planInventoryImport({ 有: [{ kind: null, name: '电饭煲' }] }, ctx())
  assert.equal(plan.items[0].guessed, true)
  assert.match(plan.items[0].item.note, /待核对/)
}

// —— 溯源:snake_case 转 camelCase,金额取正 ——
{
  const plan = planInventoryImport(
    {
      有: [
        {
          kind: null,
          name: '打印机',
          purchase: {
            order_id: 'X1',
            order_amount: -119.87,
            image_url: 'https://x/y.png',
            product_url: 'https://z',
            date: '2026-07-06',
            src: 'bestbuy',
            title: 'Canon ...',
            tier: 'C',
          },
        },
      ],
    },
    ctx(),
  )
  const buy = plan.items[0].item.purchase
  assert.equal(buy.orderId, 'X1')
  assert.equal(buy.imageUrl, 'https://x/y.png')
  assert.equal(buy.productUrl, 'https://z')
  // 退款在 FinanceOS 记负数;这里只关心"这东西多少钱"
  assert.equal(buy.amount, 119.87, '金额要取正')
  assert.equal(buy.tier, 'C')
}

// —— 吃得下 FinanceOS 的原始条目 ——
// 上游字段名会漂(实测:product_url 一夜之间变成 url,image_url/order_id 整个消失)。
// 它用 `note` 放人话短名、`url` 放商品页,原样贴进来就得能用,否则每次上游改字段
// 都要先手工改一遍数据。
{
  const plan = planInventoryImport(
    {
      有: [
        {
          tier: 'A',
          kind: null,
          note: 'FXW 超宽宠物围栏',
          date: '2026-06-26',
          src: 'amazon',
          title: 'FXW Dog Gate Extra Wide',
          url: 'https://www.amazon.com/dp/B0CJR94161',
        },
      ],
    },
    ctx(),
  )
  assert.equal(plan.items.length, 1, 'note 该被当成名字')
  assert.equal(plan.items[0].item.name, 'FXW 超宽宠物围栏')
  assert.equal(plan.items[0].item.purchase.productUrl, 'https://www.amazon.com/dp/B0CJR94161')
  assert.equal(plan.items[0].item.purchase.tier, 'A')
  // 上游拿不出的字段就是没有,不该编一个出来
  assert.equal(plan.items[0].item.purchase.imageUrl, undefined)
  assert.equal(plan.items[0].item.purchase.amount, undefined)
}

// —— 输入健壮性 ——
// 这份 JSON 是人手拼的,键名换个写法不该让整批静默消失。
{
  assert.equal(planInventoryImport({ owned: [{ kind: null, name: 'x' }] }, ctx()).items.length, 1)
  for (const junk of [null, undefined, {}, [], 'nope', { 有: 'not-an-array' }]) {
    const plan = planInventoryImport(junk, ctx())
    assert.equal(plan.items.length, 0)
    assert.equal(plan.creates.length, 0)
  }
  // 没名字的行跳过,不能建出一件叫 undefined 的东西
  const plan = planInventoryImport({ 有: [{ kind: null, name: '  ' }, { kind: null }] }, ctx())
  assert.equal(plan.items.length, 0)
}

// 目录里没有的 kind 要报出来,不能静默吞掉 —— 上游分类法漂移时这是唯一的信号。
{
  const plan = planInventoryImport({ 有: [{ kind: 'hovercraft', name: '气垫船' }] }, ctx())
  assert.equal(plan.creates.length, 0)
  assert.equal(plan.skipped.length, 1)
  assert.match(plan.skipped[0].why, /不在 HomeOS 家具目录/)
}

// —— 暂存网格 ——
// 新建的家具必须落在画布内:画布外的东西 rescueStrayPlacements 会拽回来,
// 而且用户根本点不到 —— 等于导入了个看不见的东西。
{
  // 数量要真的超过一行装得下的量,否则「该换行」这条断言是空过的。
  const perRow = Math.floor(P.viewport.width / (18 * 3 + 12))
  const many = Array.from({ length: perRow * 2 + 3 }, (_, i) => ({ kind: 'chair', name: `椅 ${i}` }))
  const plan = planInventoryImport({ 有: many }, ctx())
  assert.equal(plan.creates.length, many.length)
  for (const c of plan.creates) {
    assert.ok(c.x >= 0 && c.x + c.w <= P.viewport.width, `${c.label} 横向出界`)
    assert.ok(c.y >= 0, `${c.label} 纵向出界`)
    assert.ok(c.w > 0 && c.h > 0, `${c.label} 尺寸不对`)
    // 暂存的必须带 staged 标 —— 否则整批家具叠在左上角,动线分析全是幻影堵门
    assert.equal(c.attrs.staged, true, `${c.label} 该标 staged`)
  }
  // 换行了才叫网格:12 把椅子不该挤在一行上
  assert.ok(new Set(plan.creates.map((c) => c.y)).size > 1, '暂存网格该换行')
}

// 「没有」的那批原样带出,一件都不该被导入。
{
  const plan = planInventoryImport(
    { 有: [{ kind: null, name: '有的' }], 没有: ['不要 A', '不要 B'] },
    ctx(),
  )
  assert.deepEqual(plan.notOwned, ['不要 A', '不要 B'])
  assert.equal(plan.items.length, 1)
}

// —— 退货状态(disp) ——
// 上游 2026-07 起给每条带 disp:退掉/取消的东西不在家里,导进来等于让整理计划
// 给一件不存在的东西找家。但也不能静默吞 —— 进 skipped,预览能看见为什么少了。
{
  const plan = planInventoryImport(
    {
      items: [
        { kind: 'cabinet', note: '打印机台车', disp: 'returned', title: 'T1' },
        { kind: 'monitor', note: 'Studio Display', disp: 'cancelled', title: 'T2' },
        { kind: null, note: '蒸汽洗地机', disp: 'returned', title: 'T3' },
        { kind: null, note: '压力锅', disp: 'ok', title: 'T4' },
      ],
    },
    ctx(),
  )
  assert.equal(plan.creates.length, 0, '退掉的家具不该新建')
  assert.equal(plan.claims.length, 0)
  assert.equal(plan.items.length, 1, '只有 ok 的那件进储藏区')
  assert.equal(plan.skipped.length, 3)
  assert.match(plan.skipped[0].why, /退货/)
  assert.match(plan.skipped[1].why, /取消/)
}

// maybe(同单被标退货,分不清退的哪件)大概率还在:照导,但必须带上存疑标记,
// 杂物打进 tags/note,家具跟着 purchase.disp 走 —— 预览和柜子清单都要能看见。
{
  const plan = planInventoryImport(
    {
      items: [
        { kind: null, note: '遮光窗帘', disp: 'maybe', title: 'T1', tier: 'B', src: 'amazon' },
        { kind: 'tv', note: 'Samsung 65″ 电视', disp: 'maybe', title: 'T2' },
      ],
    },
    ctx(),
  )
  assert.equal(plan.items.length, 1)
  assert.ok(plan.items[0].item.tags.includes('退货存疑'), '杂物该带存疑标签')
  assert.match(plan.items[0].item.note, /退货存疑/)
  assert.equal(plan.items[0].item.purchase.disp, 'maybe')
  assert.equal(plan.creates.length, 1, 'maybe 的家具照导')
  assert.equal(plan.creates[0].attrs.purchase.disp, 'maybe')
  // ok 不值得记 —— 缺省就是在家里
  const okPlan = planInventoryImport({ items: [{ kind: null, note: '压力锅', disp: 'ok' }] }, ctx())
  assert.equal(okPlan.items[0].item.purchase?.disp, undefined)
}

// —— 实测占地(dims) ——
// 上游给了 w+d 就用实测,目录尺寸只是「这类一般多大」。只有 h(离地高度)的
// 不能用 —— 高度画到平面图上就成了进深错一倍的家具。
{
  const plan = planInventoryImport(
    {
      items: [
        { kind: 'table', note: '24×24 备餐台', dims: { w: 24, d: 24 }, title: 'T1' },
        { kind: 'pet_pen', note: '宠物围栏', dims: { h: 32 }, title: 'T2' },
      ],
    },
    ctx(),
  )
  const px = (inches) => Math.round((inches / 12) * 36)
  const table = plan.creates.find((c) => c.kind === 'table')
  assert.equal(table.w, px(24), '给了实测宽就不用目录的 60in')
  assert.equal(table.h, px(24))
  const pen = plan.creates.find((c) => c.kind === 'pet_pen')
  assert.ok(pen.w !== px(32) && pen.h !== px(32), '只有高度时该回落到目录尺寸')
}

// —— 疑似重复(dup) —— 上游标了就进备注,删不删由人定,导入不替他拍板。
{
  const plan = planInventoryImport(
    { items: [{ kind: null, note: '加湿器', dup: true, title: 'T1' }] },
    ctx(),
  )
  assert.match(plan.items[0].item.note, /疑似重复/)
}

console.log('inventory-import-unit: ok')
