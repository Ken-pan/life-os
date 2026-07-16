/**
 * 跨扫描身份匹配(scan-identity.js)单测。不需要 dev server / Supabase。
 *   node scripts/scan-identity-unit.mjs
 *
 * 锚点全部来自真实数据(fixtures/scan-identity-real.json,抽自
 * 2026-07-15 真机扫描 payload 与云端权威副本 v16):
 * 1. KIND_FAMILY 补族:扫描「柜」↔ 权威「冰箱顶吊柜」(wall_cabinet)必须认亲
 * 2. 高度带(elevIn):吊柜 69.5 vs 66 加分;12.3ft 巨柜(elevIn 54.8)
 *    不得因此项与落地柜攀亲(与 iOS ScanIdentity.swift 约定:
 *    加分 +0.1、罚分 -0.15、阈值 6″/18″、缺省视为 0)
 * 3. 用户纠正(attrs.scanAliases):鸟笼惯被误检成冰箱/电视,alias 命中
 *    视同同 kind(不吃跨族否决、不吃 CROSS_KIND_PENALTY)
 */
import { readFileSync } from 'node:fs'
import { matchScanObjects } from '../src/lib/spatial/scan-identity.js'

const real = JSON.parse(
  readFileSync(new URL('./fixtures/scan-identity-real.json', import.meta.url), 'utf8'),
)
const canonPl = (id) => real.canonical.placements.find((o) => o.id === id)
const scanPl = (id) => real.scan.placements.find((o) => o.id === id)
const scanFx = (id) => real.scan.fixtures.find((o) => o.id === id)

let pass = 0
const fails = []
const ok = (n, c, d = '') => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ''}`))

// ---- 1. KIND_FAMILY:cabinet ↔ wall_cabinet 同族(真实吊柜认亲) ----
{
  // 权威 pl-18「冰箱顶吊柜」wall_cabinet 2.9×1.4ft elevIn 66
  // vs 扫描 pl-18「柜」cabinet 3.0×1.3ft elevIn 69.5 —— 同一件
  const m = matchScanObjects([canonPl('pl-18')], [scanPl('pl-18')])
  ok('吊柜认亲:wall_cabinet ↔ cabinet 匹配成功', m.pairs.length === 1, JSON.stringify(m))
  ok(
    '吊柜认亲:判 same_*(不是 possibly_same)',
    m.pairs[0]?.state?.startsWith('same'),
    m.pairs[0]?.state,
  )
  ok('吊柜认亲:不再判「消失+新增」', m.added.length === 0 && m.removed.length === 0)

  // 跨族仍一票否决:吊柜 ↔ 桌,同足迹也不许认
  const cross = matchScanObjects(
    [canonPl('pl-18')],
    [{ ...scanPl('pl-18'), kind: 'table' }],
  )
  ok('跨族(wall_cabinet ↔ table)仍否决', cross.pairs.length === 0)
}

// ---- 2. 高度带(elevIn) ----
{
  // 拉开:同足迹同色的落地柜 vs 真吊柜,扫描件 elevIn 69.5 必须选中吊柜
  // (落地柜缺 elevIn 视为 0,差 69.5″ >18″ 吃罚分;吊柜差 3.5″ ≤6″ 吃加分
  //  —— 差距 0.25 分,远超歧义边距,不许 possibly_same)
  const hang = canonPl('pl-18')
  const floorTwin = {
    ...hang,
    id: 'pl-floor',
    kind: 'cabinet',
    label: '落地柜',
    attrs: { ...hang.attrs, elevIn: undefined },
  }
  delete floorTwin.attrs.elevIn
  const m = matchScanObjects([hang, floorTwin], [scanPl('pl-18')])
  ok('elev 拉开:选中吊柜而不是同足迹落地柜', m.pairs[0]?.prevId === 'pl-18', JSON.stringify(m.pairs))
  ok('elev 拉开:且不判歧义', m.pairs[0]?.state !== 'possibly_same', m.pairs[0]?.state)

  // 真实巨柜:扫描 pl-3(12.3ft,elevIn 54.8)vs 权威 pl-3 厨房下柜(落地)
  // —— 尺寸差 6ft + 高度带差 54.8″,绝不许攀亲
  const giant = matchScanObjects([canonPl('pl-3')], [scanPl('pl-3')])
  ok('巨柜 vs 厨房下柜(落地)不攀亲', giant.pairs.length === 0, JSON.stringify(giant.pairs))

  // 高度项的方向性(同足迹、距离 160px 的临界对,真实巨柜当扫描件):
  // 对落地柜(缺 elevIn → 0,差 54.8″)罚分压到线下;对同高吊柜加分抬过线
  const g = scanPl('pl-3')
  const floorAt = (attrs) => ({
    id: 'pl-x',
    kind: 'cabinet',
    label: '对照柜',
    x: g.x + 160,
    y: g.y,
    w: g.w,
    h: g.h,
    rotation: 0,
    ...(attrs ? { attrs } : {}),
  })
  const vsFloor = matchScanObjects([floorAt(null)], [g])
  ok('临界对:elevIn 54.8 vs 落地缺省 0 → 罚分,不匹配', vsFloor.pairs.length === 0,
    JSON.stringify(vsFloor.pairs))
  const vsHung = matchScanObjects([floorAt({ elevIn: 54 })], [g])
  ok('临界对(对照):同高吊柜(54 vs 54.8)→ 加分,匹配', vsHung.pairs.length === 1,
    JSON.stringify(vsHung.pairs))

  // 双方都缺 elevIn = 都默认落地,不算证据:临界对不许白涨 0.1 分
  const a = { id: 'p-a', kind: 'cabinet', x: 100, y: 100, w: 90, h: 60, rotation: 0 }
  const b = { id: 'p-b', kind: 'cabinet', x: 306, y: 100, w: 90, h: 60, rotation: 0 }
  const both = matchScanObjects([a], [b])
  ok('双方都缺 elevIn 不加分(临界对仍不匹配)', both.pairs.length === 0, JSON.stringify(both.pairs))
}

// ---- 3. 用户纠正:attrs.scanAliases ----
{
  // 真实案例:权威 pl-26「鸟笼」(bird_cage,主色 #330000)每轮被扫成
  // 冰箱(本轮 fx-1:low、#2E1022、足迹强重叠)。带 aliases 后必须认上
  const bird = canonPl('pl-26')
  const lockedBird = {
    ...bird,
    attrs: { ...bird.attrs, scanAliases: ['fridge', 'tv'], identityLocked: true },
  }
  const m = matchScanObjects([lockedBird], [scanFx('fx-1')])
  ok('鸟笼 + aliases:误检冰箱被旧身份认领', m.pairs.length === 1, JSON.stringify(m))

  // 对照:没有 aliases 时 bird_cage ↔ fridge 跨族否决(这就是每轮重犯的原因)
  const noAlias = matchScanObjects([bird], [scanFx('fx-1')])
  ok('无 aliases 对照:跨族否决,认不上', noAlias.pairs.length === 0)

  // alias 也接 tv(鸟笼的另一种惯性误检)
  const asTv = matchScanObjects(
    [lockedBird],
    [{ ...scanFx('fx-1'), kind: 'tv', label: '电视' }],
  )
  ok('alias 命中 tv 同样认领', asTv.pairs.length === 1)

  // alias 命中视同**同 kind**:不吃 CROSS_KIND_PENALTY(-0.05)。
  // 临界对设计:d=180px → 分数 ≈0.525;若被错当同族罚 0.05 会跌破 0.5
  const far = {
    id: 'p-cage',
    kind: 'bird_cage',
    x: 100,
    y: 100,
    w: 90,
    h: 90,
    rotation: 0,
    attrs: { scanAliases: ['fridge'] },
  }
  const farNext = { id: 'p-fr', kind: 'fridge', x: 280, y: 100, w: 90, h: 90, rotation: 0 }
  const border = matchScanObjects([far], [farNext])
  ok('alias 命中不吃 CROSS_KIND_PENALTY(临界对仍匹配)', border.pairs.length === 1,
    JSON.stringify(border.pairs))
}

if (fails.length) {
  console.error(`FAIL ${fails.length} (pass ${pass})`)
  for (const f of fails) console.error('  ✗', f)
  process.exit(1)
}
console.log(`PASS ${pass} checks`)
