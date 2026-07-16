/**
 * 动线分析 + 整理计划单测。不需要 dev server / VLM / Supabase。
 *   node scripts/circulation-unit.mjs
 *
 * 用手搓的小户型(一室一卫,带门)验证:
 * - 通道宽度算得对(空房 vs 被沙发挤窄)
 * - 家具堵死门/隔离分区能被抓到
 * - 利用率统计合理
 * - 整理计划按「先通行、再杂乱、最后复扫」排序,并给出物品去处
 */
import { analyzeCirculation, CLEARANCE } from '../src/lib/spatial/circulation.js'
import { buildTidyPlan } from '../src/lib/spatial/tidy-plan.js'
import { buildFromWallGraph } from '../src/lib/spatial/wall-graph.js'

let pass = 0
const fails = []
const ok = (n, c, d = '') => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ''}`))

const PX = 36 // px/ft
const ft = (v) => v * PX

/**
 * 12x10ft 卧室 + 8x10ft 客厅,中间隔墙带 32in 门。
 * 走 buildFromWallGraph 而非手搓 —— 那是运行时唯一的入口(扫描拉取、刷新恢复
 * 都汇到它),walls/openings 由它派生;手搓 fixture 会漏掉这些派生字段,
 * 测试就测不到真实数据的形状。
 */
function baseProject(overrides = {}) {
  const W = ft(20)
  const H = ft(10)
  const midX = ft(12)
  const graph = {
    pxPerFt: PX,
    margin: { x: 24, y: 24 },
    vertices: [
      { id: 'v1', x: 24, y: 24 },
      { id: 'v2', x: 24 + W, y: 24 },
      { id: 'v3', x: 24 + W, y: 24 + H },
      { id: 'v4', x: 24, y: 24 + H },
      { id: 'v5', x: 24 + midX, y: 24 },
      { id: 'v6', x: 24 + midX, y: 24 + H },
    ],
    edges: [
      { id: 'e1', a: 'v1', b: 'v5' },
      { id: 'e1b', a: 'v5', b: 'v2' },
      { id: 'e2', a: 'v2', b: 'v3' },
      { id: 'e3', a: 'v3', b: 'v6' },
      { id: 'e3b', a: 'v6', b: 'v4' },
      { id: 'e4', a: 'v4', b: 'v1' },
      { id: 'e5', a: 'v5', b: 'v6' }, // 隔墙
    ],
  }
  const zones = [
    {
      id: 'z-1',
      nameZh: '卧室',
      polygon: [
        { x: 24, y: 24 },
        { x: 24 + midX, y: 24 },
        { x: 24 + midX, y: 24 + H },
        { x: 24, y: 24 + H },
      ],
    },
    {
      id: 'z-2',
      nameZh: '客厅',
      polygon: [
        { x: 24 + midX, y: 24 },
        { x: 24 + W, y: 24 },
        { x: 24 + W, y: 24 + H },
        { x: 24 + midX, y: 24 + H },
      ],
    },
  ]
  const { placements, fixtures, viewpoints, storageZones, ...rest } = overrides
  return {
    ...buildFromWallGraph(graph, {
      graphOpenings: [
        { id: 'op1', edgeId: 'e5', offsetIn: 54, spanIn: 32, type: 'door', style: 'swing' },
      ],
      zones,
      placements: placements ?? [],
      fixtures: fixtures ?? [],
      viewpoints: viewpoints ?? [],
      storageZones: storageZones ?? [],
      meta: { id: 'test', nameZh: '测试' },
    }),
    ...rest,
  }
}

// ---- 空房:通道宽敞,无瓶颈 ----
{
  const r = analyzeCirculation(baseProject())
  ok('空房分析成功', r.ok, r.reason ?? '')
  ok('两个分区都统计到', r.zoneStats.length === 2)
  const bed = r.zoneStats.find((z) => z.nameZh === '卧室')
  // 12x10 = 120 sqft(栅格近似,给 ±15% 容差)
  ok('卧室面积≈120sqft', Math.abs(bed.areaSqft - 120) < 18, `got=${bed.areaSqft}`)
  ok('空房无家具占地', bed.usedRatio === 0, `got=${bed.usedRatio}`)
  ok('空房无瓶颈', r.bottlenecks.length === 0, `got=${r.bottlenecks.length}`)
  ok('空房无堵门', r.blockedDoors.length === 0)
  ok('空房无孤岛区', r.isolatedZones.length === 0)
  ok('总面积≈200sqft', Math.abs(r.totals.areaSqft - 200) < 30, `got=${r.totals.areaSqft}`)
}

// ---- 沙发与柜子夹出窄通道(绕不开 → 真瓶颈) ----
{
  // 客厅 10ft 深:沙发占北侧 3ft、柜子占南侧 5.5ft,中间只剩 18in 且横贯全宽
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      // 柜子留出门口那 1ft(否则是「堵门」而非「通道窄」,那是另一条断言)
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const r = analyzeCirculation(p)
  const living = r.zoneStats.find((z) => z.nameZh === '客厅')
  ok('客厅占地率上升', living.usedRatio > 0.5, `got=${living.usedRatio}`)
  const bn = r.bottlenecks.find((b) => b.nameZh === '客厅')
  ok('客厅报出瓶颈', Boolean(bn))
  ok('瓶颈宽度 < 30in', bn && bn.widthIn < CLEARANCE.tight, `got=${bn?.widthIn}`)
}

// ---- 围栏不是实体:占地只算边框,内部是狗的地板 ----
{
  const pen = {
    id: 'pl-pen',
    kind: 'pet_pen',
    label: '宠物围栏',
    x: 24 + ft(4),
    y: 24 + ft(3),
    w: ft(3),
    h: ft(3),
    rotation: 0,
    zoneId: 'z-1',
  }
  const penBed = analyzeCirculation(baseProject({ placements: [pen] }))
    .zoneStats.find((z) => z.nameZh === '卧室')
  const cabBed = analyzeCirculation(
    baseProject({ placements: [{ ...pen, id: 'pl-cab', kind: 'cabinet', label: '柜' }] }),
  ).zoneStats.find((z) => z.nameZh === '卧室')
  ok(
    '围栏占地小于同尺寸实心柜(内部是地板)',
    penBed.furnitureSqft < cabBed.furnitureSqft,
    `pen=${penBed.furnitureSqft} cab=${cabBed.furnitureSqft}`,
  )
  ok('围栏边框仍算占地', penBed.furnitureSqft > 0, `got=${penBed.furnitureSqft}`)

  // 云端优化副本给狗狗围栏的 kind 是 pet_fence(目录外的自造词)——
  // 走别名后必须和 pet_pen 一个待遇,否则真实数据整条围栏语义全失效
  const fenceBed = analyzeCirculation(
    baseProject({ placements: [{ ...pen, id: 'pl-fence', kind: 'pet_fence', label: '狗狗围栏' }] }),
  ).zoneStats.find((z) => z.nameZh === '卧室')
  ok(
    'pet_fence 与 pet_pen 同待遇',
    fenceBed.furnitureSqft === penBed.furnitureSqft,
    `fence=${fenceBed.furnitureSqft} pen=${penBed.furnitureSqft}`,
  )

  // 围栏圈住门:要报堵门,而且元凶「宠物围栏」只报一件 —— 它在障碍表里是
  // 同 id 的四条边框,不去重会把三条元凶名额全占掉
  const doorX = 24 + ft(12)
  const doorY = 24 + (54 + 16) * 3
  const penned = baseProject({
    placements: [{ ...pen, x: doorX - ft(1.5), y: doorY - ft(1.5), zoneId: 'z-2' }],
  })
  const r = analyzeCirculation(penned)
  const bd = r.blockedDoors[0]
  ok('围栏圈门要报堵门', Boolean(bd), JSON.stringify(r.blockedDoors))
  const penBlockers = (bd?.blockers ?? []).filter((b) => b.kind === 'pet_pen')
  ok('元凶围栏只报一件', penBlockers.length === 1, JSON.stringify(bd?.blockers))
}

// ---- 瓶颈亚格精化:21in 的缝要报 21,不是栅格化的 24 ----
{
  // 沙发贴北墙(3ft 深),柜子顶到南墙,中间缝隙恰 21in(63px)且横贯全宽
  const gapPx = 21 * 3
  const sofaH = ft(3)
  const p = baseProject({
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: sofaH, rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + sofaH + gapPx, w: ft(7), h: ft(10) - 3 - (sofaH + gapPx) / 36 * 3, rotation: 0, zoneId: 'z-2' },
    ],
  })
  // 柜子高度手算容易错,直接按剩余空间铺满:从缝隙下沿到南墙
  p.placements[1].h = 24 + ft(10) - (24 + sofaH + gapPx) - 6
  const r = analyzeCirculation(p)
  const bn = r.bottlenecks.find((b) => b.nameZh === '客厅')
  ok('21in 缝隙报出瓶颈', Boolean(bn))
  ok(
    '精化后宽度 ≈21in(±2),不是 12in 栅格的整倍数恭维',
    bn && Math.abs(bn.widthIn - 21) <= 2,
    `got=${bn?.widthIn}`,
  )
}

// ---- 家具与墙之间的缝隙:绕得开 → 不是瓶颈(此前误报) ----
{
  // 书桌离北墙 1ft(12in 缝),但桌子两侧都是开阔地,人不会去钻那条缝
  const p = baseProject({
    placements: [
      { id: 'd1', kind: 'desk', label: '书桌', x: 24 + ft(14), y: 24 + ft(1), w: ft(4), h: ft(2), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const r = analyzeCirculation(p)
  ok('绕得开的窄缝不报瓶颈', r.bottlenecks.length === 0, JSON.stringify(r.bottlenecks))
}

// ---- 家具堵死门 ----
{
  const p = baseProject({
    placements: [
      {
        id: 'pl1',
        kind: 'wardrobe',
        label: '衣柜',
        x: 24 + ft(12) - ft(1),
        y: 24 + ft(3),
        w: ft(2),
        h: ft(4),
        rotation: 0,
        zoneId: 'z-2',
      },
    ],
  })
  const r = analyzeCirculation(p)
  ok('衣柜堵门被抓到', r.blockedDoors.length === 1, JSON.stringify(r.blockedDoors))

  // 堵门必须说清是哪道门、被什么挡住 ——「疏通被挡住的门」这种话,
  // 人拿着任务在屋里转一圈都不知道看哪(实测用户就是这么问回来的)。
  const bd = r.blockedDoors[0]
  ok('堵门带门的身份', /卧室|客厅/.test(bd.nameZh ?? ''), bd.nameZh)
  ok('堵门点名元凶', (bd.blockers ?? []).some((b) => b.label === '衣柜'), JSON.stringify(bd.blockers))

  // 同一件衣柜若还在导入暂存(staged),就不是屋里的真实障碍 —— 不该报堵门。
  // 一批导入的家具全叠在画布左上,不跳过的话整理计划全是幻影堵门。
  const staged = structuredClone(p)
  staged.placements[0].attrs = { staged: true }
  const r2 = analyzeCirculation(staged)
  ok('暂存家具不算障碍', r2.blockedDoors.length === 0, JSON.stringify(r2.blockedDoors))
}

// ---- 重叠矩形:归属取最小的房间(508 的 rooms 是矩形近似,会互相盖) ----
{
  const p = baseProject({ zones: [] })
  // 手工塞一个盖住整个卧室的大矩形「客厅」——508 的厨房矩形就是这么盖住玄关的
  p.rooms = [
    ...p.rooms,
    { id: 'big', nameZh: '大区', bounds: { x: 24, y: 24, w: ft(20), h: ft(10) } },
  ]
  const r = analyzeCirculation(p)
  const bed = r.zoneStats.find((z) => z.nameZh === '卧室')
  ok('小房间不被大矩形吞掉', bed && bed.areaSqft > 90, `got=${bed?.areaSqft}`)
}

// ---- 塞满设备的小柜子不报「走不进去」 ----
{
  // 3ft x 3ft 的柜子,被设备占满 → 可站面积 <6sqft → 是设备位,不是活动空间
  const p = baseProject({
    fixtures: [
      { id: 'f1', kind: 'appliance', label: '洗衣机', bounds: { x: 24 + ft(12), y: 24, w: ft(8), h: ft(9.4) }, rotation: 0 },
    ],
  })
  const r = analyzeCirculation(p)
  ok(
    '设备位不报走不进去',
    !r.isolatedZones.some((z) => z.nameZh === '客厅'),
    JSON.stringify(r.isolatedZones),
  )
}

// ---- 地毯不算障碍 ----
{
  const p = baseProject({
    placements: [
      { id: 'rug1', kind: 'rug', label: '地毯', x: 24, y: 24, w: ft(12), h: ft(10), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const r = analyzeCirculation(p)
  const bed = r.zoneStats.find((z) => z.nameZh === '卧室')
  ok('地毯不占通行面积', bed.usedRatio === 0, `got=${bed.usedRatio}`)
}

// ---- 无 zones 时回退到 rooms(手工的 508 参数户型就没 zones) ----
{
  const r = analyzeCirculation(baseProject({ zones: [] }))
  ok('无 zones 时用 rooms 顶上', r.ok && r.zoneStats.length === 2, r.reason ?? '')
  ok('回退后房间名还在', r.zoneStats.some((z) => z.nameZh === '卧室'))
}

// ---- zones/rooms 都没有 ----
{
  const r = analyzeCirculation(baseProject({ zones: [], rooms: [] }))
  ok('全无房间数据时给出理由', !r.ok && /房间/.test(r.reason ?? ''), r.reason ?? '')
}

// ---- 整理计划:VLM 状态驱动 ----
{
  const p = baseProject({
    viewpoints: [
      {
        id: 'vp1',
        x: 24 + ft(6),
        y: 24 + ft(5),
        heading: 0,
        fovDeg: 69,
        zoneId: 'z-1',
        state: '堆满',
        items: ['衣物', '充电器', '纸箱'],
        photoRef: 'ph-x-1',
      },
      {
        id: 'vp2',
        x: 24 + ft(16),
        y: 24 + ft(5),
        heading: 0,
        fovDeg: 69,
        zoneId: 'z-2',
        state: '整洁',
        items: [],
      },
    ],
    placements: [
      { id: 'w1', kind: 'wardrobe', label: '衣柜', x: 24 + ft(1), y: 24 + ft(1), w: ft(3), h: ft(2), rotation: 0, zoneId: 'z-1' },
      { id: 'd1', kind: 'desk', label: '书桌', x: 24 + ft(14), y: 24 + ft(1), w: ft(4), h: ft(2), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const circ = analyzeCirculation(p)
  const plan = buildTidyPlan(p, circ)
  ok('堆满区生成整理任务', plan.tasks.some((t) => t.kind === 'overflow'))
  ok('整洁区不生成任务', !plan.tasks.some((t) => t.zoneId === 'z-2' && t.kind !== 'rescan'))
  const t = plan.tasks.find((t) => t.kind === 'overflow')
  ok('任务带区域名', t.zoneName === '卧室', t?.zoneName)
  ok('任务带整理前照片', t.photoRef === 'ph-x-1')
  ok('任务带耗时估算', t.estMinutes > 0)
  ok('衣物指向衣柜', t.steps.some((s) => s.includes('衣物') && s.includes('衣柜')), JSON.stringify(t.steps))
  ok('充电器指向书桌', t.steps.some((s) => s.includes('充电器') && s.includes('书桌')), JSON.stringify(t.steps))
  // 「纸箱」含「纸」,若书籍规则在前会被误送去书架 —— 容器类必须先匹配
  const boxPlan = buildTidyPlan(
    { ...p, viewpoints: [{ ...p.viewpoints[0], items: ['纸箱'] }] },
    circ,
  )
  const boxTask = boxPlan.tasks.find((x) => x.kind === 'overflow')
  ok(
    '纸箱进储物柜而非书架',
    boxTask.steps.some((s) => s.includes('纸箱') && !s.includes('书架')),
    JSON.stringify(boxTask.steps.filter((s) => s.includes('纸箱'))),
  )
  ok('计划以复扫收尾', plan.tasks.at(-1).kind === 'rescan')
  ok('总耗时 = 各项之和', plan.totalMinutes === plan.tasks.reduce((s, x) => s + x.estMinutes, 0))
  ok('摘要含项数', /项/.test(plan.summary), plan.summary)
  ok('已跑 VLM 不再提示', plan.needsVlm === false)
  ok('每项都有体力档', plan.tasks.every((x) => ['light', 'medium', 'heavy'].includes(x.effort)))
  // 老数据(只有五档 state、没有 observations)必须还能出任务 —— 不能因为
  // 换了新契约就把用户已有的识别成果全作废
  ok('老数据走退化路径', t.kind === 'overflow' && /旧版识别/.test(t.reason), t.reason)

// ---- 今天只有 15 分钟 ----
  const short = buildTidyPlan(p, circ, { minutes: 15 })
  ok('15 分钟:总耗时不超预算', short.totalMinutes <= 15, `got=${short.totalMinutes}`)
  ok('15 分钟:比不限时少', short.tasks.length < plan.tasks.length)
  ok('15 分钟:剩下的记在账上', short.dropped > 0, `dropped=${short.dropped}`)
  // 塞不下时光说「做不完」等于把人堵在门口 —— 得说差多少
  ok(
    '塞不下时告知最短要多久',
    short.tasks.length ? true : /最短的也要 \d+ 分钟/.test(short.summary),
    short.summary,
  )

  // ---- 时间够做一件事 ----
  const some = buildTidyPlan(p, circ, { minutes: 60 })
  ok('60 分钟:排得进事', some.tasks.length > 0, some.summary)
  ok('60 分钟:不超预算', some.totalMinutes <= 60, `got=${some.totalMinutes}`)

  // ---- 今天只想干轻活 ----
  const light = buildTidyPlan(p, circ, { effort: 'light' })
  ok(
    '只想轻活:不派重活(通行类除外)',
    light.tasks.every((x) => x.effort === 'light' || x.priority <= 1),
    light.tasks.map((x) => `${x.kind}:${x.effort}`).join(','),
  )
}

// ---- 整理计划:没跑 VLM 时只有几何任务 ----
{
  const p = baseProject({
    viewpoints: [{ id: 'vp1', x: 24 + ft(6), y: 24 + ft(5), heading: 0, fovDeg: 69, zoneId: 'z-1' }],
    placements: [
      { id: 'pl1', kind: 'sofa', label: '沙发', x: 24 + ft(12), y: 24, w: ft(8), h: ft(3), rotation: 0, zoneId: 'z-2' },
      { id: 'pl2', kind: 'cabinet', label: '柜', x: 24 + ft(13), y: 24 + ft(4.5), w: ft(7), h: ft(5.5), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const plan = buildTidyPlan(p, analyzeCirculation(p))
  ok('无状态时提示去认房间', plan.needsVlm === true)
  ok('几何任务仍在', plan.tasks.some((t) => t.kind === 'bottleneck'))
  ok('无 VLM 不编杂乱任务', !plan.tasks.some((t) => t.kind === 'overflow' || t.kind === 'messy'))
}

// ---- 储物区件数多 ----
{
  const p = baseProject({
    storageZones: [
      {
        id: 'sz1',
        code: 'A',
        nameZh: '卧室衣柜',
        locationZh: '卧室',
        formZh: '柜',
        bounds: { x: 24, y: 24, w: 100, h: 60 },
        marker: { x: 50, y: 50 },
        zoneId: 'z-1',
        items: Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `物品${i}` })),
      },
    ],
  })
  const plan = buildTidyPlan(p, analyzeCirculation(p))
  const t = plan.tasks.find((x) => x.kind === 'storage')
  ok('多件储物区生成梳理任务', Boolean(t))
  ok('储物任务列出物品', t.items.length === 6, `got=${t?.items.length}`)
  ok('储物任务耗时随件数', t.estMinutes === 29, `got=${t?.estMinutes}`)
}

// ---- 真实的 508 参数户型:手工规划的好户型,不该报出任何动线问题 ----
{
  const { SAMPLE_508 } = await import('../src/lib/spatial/sample-508.js')
  const r = analyzeCirculation(SAMPLE_508)
  ok('508 能分析(无 zones,靠 rooms)', r.ok && r.zoneStats.length >= 9, `zones=${r.zoneStats.length}`)
  // 房间矩形之间隔着墙厚,门正卡在那道缝里 —— 门洞不放行的话洗衣间会被隔离
  ok('508 无孤岛区', r.isolatedZones.length === 0, JSON.stringify(r.isolatedZones))
  ok('508 无堵门', r.blockedDoors.length === 0, JSON.stringify(r.blockedDoors))
  // 厨房的矩形盖住整个玄关,归属取小房间才还得回来(否则玄关只剩 0.8 sqft)
  const entry = r.zoneStats.find((z) => z.nameZh === '玄关')
  ok('玄关面积没被厨房吞掉', entry && entry.areaSqft > 12, `got=${entry?.areaSqft}`)
  ok('508 总面积合理', Math.abs(r.totals.areaSqft - 640) < 40, `got=${r.totals.areaSqft}`)
}

// ---- 汇报 ----
if (fails.length) {
  console.error(`FAIL ${fails.length} (pass ${pass})`)
  for (const f of fails) console.error('  ✗', f)
  process.exit(1)
}
// ---- 分轴观察:碗筷/垃圾/台面/地面脏污各出各的任务 ----
// 这是用户实测提的问题:桌上堆着碗筷垃圾、地板不干净,系统却只报「家具占地 45%」。
// 根因是几何看不见杂物(堆满碗筷的桌子和空桌子,LiDAR 量出来一模一样),
// 而老的五档状态里**根本没有脏污这根轴** —— 屋子再脏也只会被说成「整洁」。
{
  const vp = (obs) => ({
    id: 'vp1',
    x: 24 + ft(6),
    y: 24 + ft(5),
    heading: 0,
    fovDeg: 69,
    zoneId: 'z-1',
    state: '杂乱',
    describedAt: '2026-07-15T00:00:00Z',
    items: ['碗', '衣物'],
    photoRef: 'ph-1',
    observations: obs,
  })
  const P0 = baseProject({
    viewpoints: [vp({ trash: 2, dishes: 3, laundry: 1, surfaces: 3, floorClutter: 2, floorDirt: 2, storageMess: 0 })],
  })
  const circ = analyzeCirculation(P0)
  const plan = buildTidyPlan(P0, circ)
  const kinds = plan.tasks.map((x) => x.kind)
  ok('碗筷垃圾出卫生任务', kinds.includes('hygiene'), JSON.stringify(kinds))
  ok('台面堆积出台面任务', kinds.includes('surfaces'), JSON.stringify(kinds))
  ok('地面杂物出地面任务', kinds.includes('floorClutter'), JSON.stringify(kinds))
  ok('地面脏污出清洁任务', kinds.includes('floorClean'), JSON.stringify(kinds))
  ok('分轴数据不再出泛化任务', !kinds.includes('overflow') && !kinds.includes('messy'), JSON.stringify(kinds))

  // 顺序即方法论:卫生最先(最快、进度看得见),地面清洁必须在所有收拾之后 ——
  // 先扫地、等会儿收台面时灰又落一地,等于白扫。这条最容易被写反。
  const idx = (k) => kinds.indexOf(k)
  ok('卫生排在台面之前', idx('hygiene') < idx('surfaces'), JSON.stringify(kinds))
  ok('台面排在地面杂物之前', idx('surfaces') < idx('floorClutter'), JSON.stringify(kinds))
  ok('地面清洁排在收拾之后', idx('floorClean') > idx('floorClutter'), JSON.stringify(kinds))
  ok('地面清洁只在复扫之前', idx('floorClean') === kinds.length - 2, JSON.stringify(kinds))

  const hyg = plan.tasks.find((x) => x.kind === 'hygiene')
  ok('卫生任务说清看到什么', /碗筷/.test(hyg.reason), hyg.reason)
  ok('卫生任务是轻活', hyg.effort === 'light', hyg.effort)

  // 脏 ≠ 乱:地面很空但落灰,只该出清洁任务,不该出「清空地面」
  const dirtyOnly = baseProject({
    viewpoints: [vp({ trash: 0, dishes: 0, laundry: 0, surfaces: 0, floorClutter: 0, floorDirt: 3, storageMess: 0 })],
  })
  const dk = buildTidyPlan(dirtyOnly, analyzeCirculation(dirtyOnly)).tasks.map((x) => x.kind)
  ok('只脏不乱:出清洁不出收纳', dk.includes('floorClean') && !dk.includes('floorClutter'), JSON.stringify(dk))
  const mop = buildTidyPlan(dirtyOnly, analyzeCirculation(dirtyOnly)).tasks.find((x) => x.kind === 'floorClean')
  ok('很脏要拖地', /拖/.test(mop.title), mop.title)
  ok('清洁任务先确认收空', /收空|白扫/.test(mop.steps[0]), mop.steps[0])

  // 反过来:乱但不脏,不该凭空生出拖地任务
  const messyOnly = baseProject({
    viewpoints: [vp({ trash: 0, dishes: 0, laundry: 0, surfaces: 3, floorClutter: 3, floorDirt: 0, storageMess: 0 })],
  })
  const mk = buildTidyPlan(messyOnly, analyzeCirculation(messyOnly)).tasks.map((x) => x.kind)
  ok('只乱不脏:不出清洁任务', !mk.includes('floorClean'), JSON.stringify(mk))

  // 全干净:除了复扫什么都不该有
  const clean = baseProject({
    viewpoints: [vp({ trash: 0, dishes: 0, laundry: 0, surfaces: 0, floorClutter: 0, floorDirt: 0, storageMess: 0 })],
  })
  const ck = buildTidyPlan(clean, analyzeCirculation(clean)).tasks.filter((x) => x.kind !== 'rescan')
  ok('干净的区不派活', ck.length === 0, JSON.stringify(ck.map((x) => x.kind)))

  // 归位建议要看房间,不能只看「离得近」——
  // 实测抓到的荒谬建议:「归位:碗 → 桌下文件柜」。文件柜和厨房下柜都是 cabinet,
  // 而离餐桌最近的恰好是桌下那个文件柜。碗当然不进文件柜。
  const withCabinets = baseProject({
    viewpoints: [vp({ surfaces: 3, trash: 0, dishes: 0, laundry: 0, floorClutter: 0, floorDirt: 0, storageMess: 0 })],
    placements: [
      // 文件柜就在机位边上(z-1 卧室),厨房下柜在远处的 z-2
      { id: 'pl-f', kind: 'cabinet', label: '桌下文件柜', x: 24 + ft(5), y: 24 + ft(4), w: ft(2), h: ft(2), rotation: 0, zoneId: 'z-1' },
      { id: 'pl-k', kind: 'base_cabinet', label: '厨房下柜', x: 24 + ft(18), y: 24 + ft(8), w: ft(2), h: ft(2), rotation: 0, zoneId: 'z-2' },
    ],
  })
  // z-2 在这个 fixture 里叫「客厅」,给它改名成厨房好让房间线索命中
  withCabinets.zones = withCabinets.zones.map((z) => (z.id === 'z-2' ? { ...z, nameZh: '厨房' } : z))
  const bowlPlan = buildTidyPlan(
    { ...withCabinets, viewpoints: [{ ...withCabinets.viewpoints[0], items: ['碗'] }] },
    analyzeCirculation(withCabinets),
  )
  const bowlStep = bowlPlan.tasks.find((x) => x.kind === 'surfaces')?.steps.find((s) => s.includes('碗'))
  ok('碗进厨柜而非最近的文件柜', /厨房下柜/.test(bowlStep ?? ''), bowlStep ?? '(没有归位步骤)')

  // 但那种房间压根不存在时,不能因此没有去处 —— 退回全屋就近
  const noKitchen = baseProject({
    viewpoints: [vp({ surfaces: 3, trash: 0, dishes: 0, laundry: 0, floorClutter: 0, floorDirt: 0, storageMess: 0 })],
    placements: [
      { id: 'pl-f', kind: 'cabinet', label: '柜子', x: 24 + ft(5), y: 24 + ft(4), w: ft(2), h: ft(2), rotation: 0, zoneId: 'z-1' },
    ],
  })
  const fallback = buildTidyPlan(
    { ...noKitchen, viewpoints: [{ ...noKitchen.viewpoints[0], items: ['碗'] }] },
    analyzeCirculation(noKitchen),
  )
  const fbStep = fallback.tasks.find((x) => x.kind === 'surfaces')?.steps.find((s) => s.includes('碗'))
  ok('没有厨房时仍给去处', Boolean(fbStep), '(碗没有任何去处)')

  // ---- 完成标准:每项都要说得出「做到什么样算完」----
  // 没有验收标准的任务只能靠感觉勾完,而「感觉差不多了」正是屋子第二天又乱的起点。
  ok(
    '每项都有完成标准',
    plan.tasks.every((x) => Array.isArray(x.doneWhen) && x.doneWhen.length > 0),
    plan.tasks.filter((x) => !x.doneWhen?.length).map((x) => x.kind).join(','),
  )
  // 「走不进去的区」是另一条产任务的路径,单测 fixture 碰不到它 —— 单独兜住,
  // 否则专注模式上这张卡是空的:没有标准、没有图(实测就是这么发现的)。
  const iso = buildTidyPlan(P0, { ...circ, isolatedZones: [{ zoneId: 'z-1', nameZh: '卧室' }] })
    .tasks.find((x) => x.id === 'isolated-z-1')
  ok('孤岛区有完成标准', iso?.doneWhen?.length > 0, JSON.stringify(iso?.doneWhen))
  ok('孤岛区有图可定位', Number.isFinite(iso?.focus?.x), JSON.stringify(iso?.focus))
  // 瓶颈的标准要给可量的数,不是「变宽敞」——拿卷尺一量就知道
  const bnTask = plan.tasks.find((x) => x.kind === 'bottleneck')
  if (bnTask) ok('瓶颈标准给具体数字', bnTask.doneWhen.some((d) => /\d+ 英寸/.test(d)), JSON.stringify(bnTask.doneWhen))

  // ---- 备箱子:有东西要收才派,而且不能把活挤掉 ----
  ok('有东西收时派备箱子', plan.tasks.some((x) => x.kind === 'prep'), JSON.stringify(plan.tasks.map(x=>x.kind)))
  ok('备箱子排最前', plan.tasks[0].kind === 'prep', plan.tasks[0].kind)
  // 只挪家具拓通道时不需要五个箱子
  const doorOnly = baseProject({
    placements: [
      { id: 'pl1', kind: 'wardrobe', label: '衣柜', x: 24 + ft(12) - ft(1), y: 24 + ft(3), w: ft(2), h: ft(4), rotation: 0, zoneId: 'z-2' },
    ],
  })
  const dop = buildTidyPlan(doorOnly, analyzeCirculation(doorOnly))
  ok('只挪家具时不派备箱子', !dop.tasks.some((x) => x.kind === 'prep'), JSON.stringify(dop.tasks.map(x=>x.kind)))

  // prep 排在最前又要 10 分钟 —— 进主循环抢预算的话,15 分钟下会只剩「备好箱子」一条,
  // 备完了没事干。它必须是配角:塞不下正片就不该出现。
  const tight15 = buildTidyPlan(P0, circ, { minutes: 15 })
  ok(
    '预算紧时不会只剩备箱子',
    !(tight15.tasks.length === 1 && tight15.tasks[0].kind === 'prep'),
    JSON.stringify(tight15.tasks.map((x) => `${x.kind}:${x.estMinutes}`)),
  )
  ok('预算内不超支', !tight15.totalMinutes || tight15.totalMinutes <= 15, `got=${tight15.totalMinutes}`)
}

console.log(`PASS ${pass} checks`)
