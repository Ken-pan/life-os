/**
 * 「④ 视角」smoke —— 守两类回归：
 *  1. 高频输入（罗盘/FOV 滑杆）绝不能直连 store。直连会每秒 pushGraphUndo ~60 次，
 *     把用户真实编辑挤出 24 格撤销栈，并烧掉 ~137ms/s 做全量 hydrate + 落盘。
 *  2. 松手后必须恰好落盘一次。
 *
 * ⚠️ 全程黑盒：只点真实 UI，只从 localStorage 读真值。
 * 不要在 page.evaluate 里 import('/src/lib/state.svelte.js') 来读写状态 ——
 * 那拿到的是与组件不同的模块实例（HMR/别名解析所致），S 是空的，测试会读到平行宇宙。
 *
 * 用法：node apps/home/scripts/viewpoint-smoke.mjs [baseUrl]
 * 需要 dev server（默认 5874）。vite 冷启动首跑可能假失败，先访问一次预热。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5874'
const HERE = dirname(fileURLToPath(import.meta.url))
const SKEY = 'homeos_spatial_v1'
const UNDO_KEY = 'homeos_wall_graph_undo_v1'

const fixture = readFileSync(join(HERE, 'fixtures/viewpoint-fixture.json'), 'utf8')

/** @type {{name:string, ok:boolean, detail:string}[]} */
const rows = []
let failures = 0
function push(name, ok, detail = '') {
  rows.push({ name, ok, detail })
  if (!ok) failures++
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
await page.evaluate(
  ([skey, undoKey, data]) => {
    localStorage.clear()
    localStorage.setItem(skey, data)
    localStorage.setItem(undoKey, JSON.stringify({ undo: [], redo: [] }))
  },
  [SKEY, UNDO_KEY, fixture],
)
await page.reload({ waitUntil: 'networkidle' })

/** localStorage 是持久化真值，与模块实例无关。 */
const readVp = () =>
  page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}')
    const p = s.projects?.[s.activeProjectId]
    return p?.viewpoints?.[0] ?? null
  }, SKEY)
const readUndo = () =>
  page.evaluate((k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || '{}').undo?.length ?? 0
    } catch {
      return -1
    }
  }, UNDO_KEY)

push('夹具载入：机位存在', (await readVp())?.id === 'vp-1')

await page.getByRole('button', { name: '编辑', exact: true }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /视角/ }).first().click()
await page.waitForTimeout(500)

const hit = page.locator('[data-viewpoint-id]').first()
push('机位命中区已渲染', (await hit.count()) > 0)
if (await hit.count()) {
  const b = await hit.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(600)
}

const bar = page.locator('[aria-label="视角快捷操作"]')
push('选中条弹出', await bar.isVisible())

// —— 罗盘：跟随期间只预览，停下才落盘 ——
const compassBtn = bar.getByRole('button', { name: /罗盘/ })
if ((await compassBtn.count()) > 0) {
  const h0 = (await readVp()).heading
  await compassBtn.click()
  await page.waitForTimeout(400)
  push('罗盘跟随已启动', /跟随/.test(await compassBtn.textContent()))

  const u0 = await readUndo()
  await page.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientationabsolute', {
          alpha: 360 - i * 1.5,
          beta: 0,
          gamma: 0,
          absolute: true,
        }),
      )
      await new Promise((r) => requestAnimationFrame(r))
    }
  })
  await page.waitForTimeout(200)

  const undoDuring = (await readUndo()) - u0
  const hDuring = (await readVp()).heading
  push(
    '跟随 60 帧期间不写撤销栈',
    undoDuring === 0,
    `undo +${undoDuring}（>0 说明高频输入又直连了 store）`,
  )
  push('跟随期间 store 朝向不动（只走预览）', hDuring === h0, `${h0} → ${hDuring}`)

  // 预览有没有真的画出来：朝向数字框跟着走
  const shown = await bar.getByLabel('朝向角度').inputValue()
  push('跟随时朝向数字实时更新', Number(shown) !== h0, `显示 ${shown}°`)

  await compassBtn.click()
  await page.waitForTimeout(600)
  const undoTotal = (await readUndo()) - u0
  const hEnd = (await readVp()).heading
  push('停跟随时恰好落盘一次', undoTotal === 1, `undo +${undoTotal}`)
  push('落盘后朝向确实变了', Math.round(hEnd) !== Math.round(h0), `${h0}° → ${Math.round(hEnd)}°`)
  push('朝向来源标记为 compass', (await readVp()).headingSource === 'compass')
} else {
  push('罗盘按钮存在', false, '本环境无 DeviceOrientationEvent')
}

// —— FOV 滑杆：拖动只预览，change 才落盘 ——
{
  const fov = bar.getByLabel('视锥张角')
  const u0 = await readUndo()
  const before = (await readVp()).fovDeg
  // 连续 input 模拟拖动
  await fov.evaluate((el) => {
    for (let v = 40; v <= 120; v += 2) {
      el.value = String(v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.waitForTimeout(200)
  const undoDuringDrag = (await readUndo()) - u0
  const fovDuringDrag = (await readVp()).fovDeg
  push('滑杆拖动期间不写撤销栈', undoDuringDrag === 0, `undo +${undoDuringDrag}`)
  push('滑杆拖动期间 store 不动', fovDuringDrag === before, `${before} → ${fovDuringDrag}`)

  await fov.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))
  await page.waitForTimeout(400)
  const undoTotal = (await readUndo()) - u0
  push('滑杆松手恰好落盘一次', undoTotal === 1, `undo +${undoTotal}`)
  push('滑杆落盘后 fov 已变', (await readVp()).fovDeg === 120, `fov=${(await readVp()).fovDeg}`)
}

await browser.close()

console.log('\n=== 视角 smoke ===\n')
for (const r of rows)
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  —  ${r.detail}` : ''}`)
console.log(`\n${rows.length} checks, ${failures} failures`)
process.exit(failures ? 1 : 0)
