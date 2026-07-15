/**
 * 储藏区「几何绑定」的撤销/重做回归测试。
 *
 * 直接驱动真实的 state.svelte.js（runes 只能在浏览器里跑，node 起不来），
 * 所以测的就是 ⌘Z / ⌥⌘Z 真正会走的那条路径。
 *
 * 同时钉住两条互相拉扯的性质：
 *   1. 指派/解除指派必须能撤销 —— snapshotEditSource 曾经漏了 storageZones。
 *   2. 物品清单不能被几何编辑的撤销冲掉 —— items 走 updateStorageZones，
 *      刻意绕开撤销栈。所以快照只能取绑定字段，不能整个 storageZones 塞进去。
 *   第 2 条是第 1 条的天然反例：修 1 的时候一不小心就会破坏 2。
 *
 * Usage: node apps/home/scripts/storage-undo-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5874'

let pass = 0
let fail = 0
/** @param {string} name @param {boolean} ok @param {string} detail */
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' })
  // 干净起点：这个 origin 的存档清掉，免得上一次跑的残留干扰
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })

  const result = await page.evaluate(async () => {
    const St = await import('/src/lib/state.svelte.js')
    const cur = () => St.S.projects[St.S.activeProjectId]
    const sz = (code) => cur().storageZones.find((z) => z.code === code)

    if (!St.isWallGraphMode()) St.activateWallGraphMode()
    const code = cur().storageZones[0].code
    const zid = St.addZone(
      [
        { x: 60, y: 60 },
        { x: 220, y: 60 },
        { x: 220, y: 220 },
        { x: 60, y: 220 },
      ],
      '撤销测试区',
    )

    // 起点：确保未指派
    St.unassignStorageZone(code)
    const start = { zoneId: sz(code).zoneId ?? null, marker: !!sz(code).marker }

    // --- 性质 1：指派 → 撤销 → 重做 ---
    St.assignStorageZone(code, { zoneId: zid })
    const assigned = { zoneId: sz(code).zoneId ?? null, marker: !!sz(code).marker }

    St.undoGraphEdit()
    const undone = { zoneId: sz(code).zoneId ?? null, marker: !!sz(code).marker }

    St.redoGraphEdit()
    const redone = { zoneId: sz(code).zoneId ?? null, marker: !!sz(code).marker }

    // --- 性质 1b：解除指派也要能撤销 ---
    St.unassignStorageZone(code)
    const unassigned = { zoneId: sz(code).zoneId ?? null, marker: !!sz(code).marker }
    St.undoGraphEdit()
    const unassignUndone = { zoneId: sz(code).zoneId ?? null, marker: !!sz(code).marker }

    // --- 性质 2：物品清单不能被几何编辑的撤销冲掉 ---
    // 顺序是关键：物品必须在快照**之后**才加，才撞得到危险。
    // 先加物品再做几何编辑的话，物品早已被写进快照，怎么撤都还在 —— 测了个寂寞。
    const before = sz(code).items.length
    St.addZone(
      [
        { x: 300, y: 300 },
        { x: 380, y: 300 },
        { x: 380, y: 380 },
        { x: 300, y: 380 },
      ],
      '临时区',
    ) // ← 此刻压入快照，items 还是 before
    St.addStorageItem(code, '撤销测试物品') // ← 绕开撤销栈，快照里没有它
    const afterAdd = sz(code).items.length
    St.undoGraphEdit() // ← 撤销那次几何编辑：天真修法会把物品一起冲掉
    const afterUndo = sz(code).items.length

    return {
      zid,
      start,
      assigned,
      undone,
      redone,
      unassigned,
      unassignUndone,
      items: { before, afterAdd, afterUndo },
    }
  })

  const r = result
  check(
    '起点未指派',
    r.start.zoneId === null && !r.start.marker,
    `zoneId=${r.start.zoneId} marker=${r.start.marker}`,
  )
  check(
    '指派后已绑定且有标记',
    r.assigned.zoneId === r.zid && r.assigned.marker,
    `zoneId=${r.assigned.zoneId} marker=${r.assigned.marker}`,
  )
  check(
    '撤销指派 → 绑定被撤回',
    r.undone.zoneId === null,
    `撤销后 zoneId 仍是 ${r.undone.zoneId}`,
  )
  check(
    '撤销指派 → 标记一并消失（不能赖在原地）',
    !r.undone.marker,
    '绑定撤回了但 marker 还在，撤销等于没撤',
  )
  check(
    '重做指派 → 绑定与标记回来',
    r.redone.zoneId === r.zid && r.redone.marker,
    `zoneId=${r.redone.zoneId} marker=${r.redone.marker}`,
  )
  check(
    '解除指派生效',
    r.unassigned.zoneId === null && !r.unassigned.marker,
    `zoneId=${r.unassigned.zoneId} marker=${r.unassigned.marker}`,
  )
  check(
    '撤销「解除指派」→ 绑定恢复',
    r.unassignUndone.zoneId === r.zid && r.unassignUndone.marker,
    `zoneId=${r.unassignUndone.zoneId} marker=${r.unassignUndone.marker}`,
  )
  check(
    '物品清单不被几何编辑的撤销冲掉',
    r.items.afterUndo === r.items.afterAdd && r.items.afterAdd === r.items.before + 1,
    `${r.items.before} → 加物品 ${r.items.afterAdd} → 撤销后 ${r.items.afterUndo}`,
  )
} finally {
  await browser.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
