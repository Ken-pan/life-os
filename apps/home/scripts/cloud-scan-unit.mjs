/**
 * 云端扫描 payload 组装单测(HOME.SYNC.4)。不需要 dev server / Supabase。
 *   node scripts/cloud-scan-unit.mjs
 *
 * 覆盖:
 * 1. validateScanPayload 拒错收对
 * 2. buildProjectFromScan 走 buildFromWallGraph 完整 carry —— 房间来自 zones
 *    (不回落 508 样例)、家具/设施/机位齐活、photoPath 被剥掉、储物区置空
 *
 * fixture 与 iOS 端 HomeScanTests 共用同一份契约样例
 * (scripts/fixtures/scan-payload-v1.json)。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SCAN_PAYLOAD_FORMAT_VERSION,
  validateScanPayload,
  buildProjectFromScan,
} from '../src/lib/spatial/scan-payload.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = () =>
  JSON.parse(readFileSync(join(here, 'fixtures/scan-payload-v1.json'), 'utf8'))

let pass = 0
const fails = []
const ok = (n, c, d = '') => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ''}`))

// ---- validateScanPayload ----
ok('fixture 合法', validateScanPayload(fixture()) === null, validateScanPayload(fixture()) ?? '')
ok('空 payload 拒收', validateScanPayload(null) !== null)
{
  const bad = fixture()
  bad.formatVersion = 99
  ok('版本不符拒收', (validateScanPayload(bad) ?? '').includes('版本'))
}
{
  const bad = fixture()
  bad.homeos.zones = []
  ok('缺分区拒收', (validateScanPayload(bad) ?? '').includes('分区'))
}
{
  const bad = fixture()
  bad.homeos.wallGraph.vertices = []
  ok('缺墙体拒收', (validateScanPayload(bad) ?? '').includes('墙体'))
}
ok('契约版本 = 1', SCAN_PAYLOAD_FORMAT_VERSION === 1)

// ---- buildProjectFromScan ----
const p = buildProjectFromScan(fixture())

ok('schemaVersion 5', p.schemaVersion === 5, `got=${p.schemaVersion}`)
ok('layoutMode wallGraph', p.layoutMode === 'wallGraph')
ok('meta 来自扫描', p.meta.id === 'scan-fixture-1' && p.meta.nameZh === '测试扫描')
ok('sourceNote 标注实测', (p.meta.sourceNote ?? '').includes('RoomPlan'))

// 房间必须由 zones 派生,绝不能回落到 508 样例(那是 8 个房间的硬编码户型)
ok('房间数 = 分区数', p.rooms.length === 2, `got=${p.rooms.length}`)
ok(
  '房间名来自分区',
  p.rooms.some((r) => r.nameZh === '卧室') && p.rooms.some((r) => r.nameZh === '书房'),
  p.rooms.map((r) => r.nameZh).join(','),
)

ok('墙体已派生', p.walls.length >= 7, `got=${p.walls.length}`)
ok('门窗已派生', p.openings.length === 2, `got=${p.openings.length}`)
ok('graphOpenings 保留', p.graphOpenings.length === 2)

ok('家具保留', p.placements.length === 1 && p.placements[0].kind === 'bed')
ok('furniture 由 placements 派生', p.furniture.length === 1)
ok('固定设施保留', p.fixtures.length === 1 && p.fixtures[0].kind === 'toilet')

ok('机位保留', p.viewpoints.length === 2)
ok(
  'photoPath 已剥掉',
  p.viewpoints.every((vp) => !('photoPath' in vp)),
)
ok(
  'arkit 朝向来源保留',
  p.viewpoints.every((vp) => vp.headingSource === 'arkit'),
)

ok('储物区置空', p.storageZones.length === 0, `got=${p.storageZones.length}`)
ok('viewport 已算出', p.viewport.width > 0 && p.viewport.height > 0)

// ---- 跨端一致性(可选):iOS 单测落盘的 Swift 产出 payload ----
// 先跑 ios/home-scan 的 xcodebuild test(会写 /tmp/homescan-mock-payload.json),
// 再跑本脚本,即验证 Swift 转换器输出能被网页端原样消化。
import { existsSync } from 'node:fs'
const swiftPayloadPath = '/tmp/homescan-mock-payload.json'
if (existsSync(swiftPayloadPath)) {
  const swift = JSON.parse(readFileSync(swiftPayloadPath, 'utf8'))
  ok('Swift payload 通过校验', validateScanPayload(swift) === null, validateScanPayload(swift) ?? '')
  const sp = buildProjectFromScan(swift)
  ok('Swift payload 组装成功', sp.schemaVersion === 5 && sp.layoutMode === 'wallGraph')
  ok('Swift 分区进房间', sp.rooms.length === swift.homeos.zones.length)
  ok('Swift 家具齐活', sp.placements.length === swift.homeos.placements.length)
  console.log(`(含 Swift 跨端 payload 复验:${swiftPayloadPath})`)
} else {
  console.log('(跳过 Swift 跨端复验:先跑 iOS 单测生成 /tmp/homescan-mock-payload.json)')
}

// ---- 汇报 ----
if (fails.length) {
  console.error(`FAIL ${fails.length} (pass ${pass})`)
  for (const f of fails) console.error('  ✗', f)
  process.exit(1)
}
console.log(`PASS ${pass} checks`)
