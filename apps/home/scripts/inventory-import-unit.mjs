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

console.log('inventory-import-unit: ok')
