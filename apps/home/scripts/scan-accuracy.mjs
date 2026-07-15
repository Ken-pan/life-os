/**
 * 扫描精度验收 —— 拿一次扫描的 payload 对照 508 Golden Ground Truth 打分。
 *   node scripts/scan-accuracy.mjs [payload.json] [golden.json]
 *   npm run test:scan-accuracy            # 默认吃 /tmp/homescan-mock-payload.json
 *
 * 验收目标(产品门槛,不是 RoomPlan 的宣称精度):
 *   宽/深误差   中位 ≤5cm(2.0″)  P95 ≤10cm(3.9″)
 *   高度误差    中位 ≤7.5cm(3.0″) P95 ≤12cm(4.7″)
 *   到墙距离    中位 ≤5cm         P95 ≤10cm
 *
 * golden 里为 null 的字段跳过;真值一件没填时只打印操作说明(exit 0),
 * 填了真值且任一指标超限时 exit 1 —— 可以直接当 CI 门用。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wallSegments } from '../src/lib/spatial/scan-register.js'
import { gapToWall } from '../src/lib/spatial/scan-merge.js'

const here = dirname(fileURLToPath(import.meta.url))
const payloadPath = process.argv[2] ?? '/tmp/homescan-mock-payload.json'
const goldenPath = process.argv[3] ?? join(here, 'fixtures/golden-508.json')

if (!existsSync(payloadPath)) {
  console.error(`找不到扫描 payload:${payloadPath}`)
  console.error('先跑 iOS 单测(会写 /tmp/homescan-mock-payload.json),或传入真实扫描的 payload JSON。')
  process.exit(1)
}
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))

const IN = (px) => px / 3 // 36px/ft = 3px/in
const objects = [
  ...(payload.homeos?.placements ?? []).map((p) => ({ ...p, box: { x: p.x, y: p.y, w: p.w, h: p.h } })),
  ...(payload.homeos?.fixtures ?? []).map((f) => ({ ...f, box: f.bounds })),
]
const segs = wallSegments(payload.homeos?.wallGraph)
const SIDE = { west: 'left', east: 'right', north: 'up', south: 'down' }

/** 按 label 匹配;同 label 多件取尺寸最接近的 */
function findObject(g) {
  const cands = objects.filter((o) => o.label === g.label || (g.kind && o.kind === g.kind))
  if (!cands.length) return null
  if (cands.length === 1 || g.wIn == null) return cands[0]
  return cands.reduce((best, o) =>
    Math.abs(IN(o.box.w) - g.wIn) < Math.abs(IN(best.box.w) - g.wIn) ? o : best,
  )
}

/** 忽略 90° 朝向差异比宽深 */
function sizeErrors(box, g) {
  const w = IN(box.w)
  const h = IN(box.h)
  const direct = Math.abs(w - g.wIn) + Math.abs(h - g.dIn)
  const swapped = Math.abs(w - g.dIn) + Math.abs(h - g.wIn)
  return direct <= swapped
    ? { w: Math.abs(w - g.wIn), d: Math.abs(h - g.dIn) }
    : { w: Math.abs(w - g.dIn), d: Math.abs(h - g.wIn) }
}

const errs = { w: [], d: [], h: [], gap: [] }
const rows = []
let filled = 0
for (const g of golden.furniture ?? []) {
  const hasTruth = g.wIn != null || g.hIn != null || Object.values(g.gapIn ?? {}).some((v) => v != null)
  if (!hasTruth) continue
  filled++
  const o = findObject(g)
  if (!o) {
    rows.push(`  ✗ ${g.label} —— 扫描里没找到(漏检或 label 不一致)`)
    continue
  }
  const parts = []
  if (g.wIn != null && g.dIn != null) {
    const e = sizeErrors(o.box, g)
    errs.w.push(e.w)
    errs.d.push(e.d)
    parts.push(`宽Δ${e.w.toFixed(1)}″ 深Δ${e.d.toFixed(1)}″`)
  }
  if (g.hIn != null && o.attrs?.heightIn != null) {
    const e = Math.abs(o.attrs.heightIn - g.hIn)
    errs.h.push(e)
    parts.push(`高Δ${e.toFixed(1)}″`)
  }
  for (const [dir, truth] of Object.entries(g.gapIn ?? {})) {
    if (truth == null) continue
    const measured = gapToWall(segs, o.box, SIDE[dir])
    if (measured == null) {
      parts.push(`${dir}墙距:扫描找不到正对墙`)
      continue
    }
    const e = Math.abs(IN(measured) - truth)
    errs.gap.push(e)
    parts.push(`${dir}墙距Δ${e.toFixed(1)}″`)
  }
  rows.push(`  ○ ${g.label}: ${parts.join(' · ') || '(真值字段与扫描数据对不上)'}`)
}

if (!filled) {
  console.log('golden-508.json 还没填真值 —— 用卷尺/激光测距仪量出主要家具的宽/深/高与到墙距离,')
  console.log(`填进 ${goldenPath} 后重跑本脚本即可给扫描打分。`)
  process.exit(0)
}

const pct = (arr, q) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]
}
const GATES = [
  ['宽度', errs.w, 2.0, 3.9],
  ['深度', errs.d, 2.0, 3.9],
  ['高度', errs.h, 3.0, 4.7],
  ['到墙距离', errs.gap, 2.0, 3.9],
]
console.log(`扫描精度验收:${payloadPath}`)
for (const r of rows) console.log(r)
console.log('')
let failed = 0
for (const [name, arr, medMax, p95Max] of GATES) {
  if (!arr.length) {
    console.log(`  ${name}: (无样本)`)
    continue
  }
  const med = pct(arr, 0.5)
  const p95 = pct(arr, 0.95)
  const pass = med <= medMax && p95 <= p95Max
  if (!pass) failed++
  console.log(
    `  ${pass ? 'PASS' : 'FAIL'} ${name}: 中位 ${med.toFixed(1)}″ (≤${medMax}″) · P95 ${p95.toFixed(1)}″ (≤${p95Max}″) · n=${arr.length}`,
  )
}
process.exit(failed ? 1 : 0)
