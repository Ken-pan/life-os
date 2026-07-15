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
console.log(`PASS ${pass} checks`)
