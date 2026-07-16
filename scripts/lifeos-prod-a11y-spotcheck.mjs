#!/usr/bin/env node
/**
 * DSGN.CATALOG.7 — 生产四站共享 primitive a11y 抽检。
 *
 * catalog 的 a11y gates 只证明组件在 catalog 环境里绿；本脚本对
 * planner / fitness / finance / music 的 **生产构建** 抽查共享 primitive
 * 在真实品牌组合下的表现（不做全页面 audit）：
 *
 *   1. 页面标题 (h1/.page-title)   对比度 ≥ 3（大字号 AA）
 *   2. 导航项文本 (.nav-item)      对比度 ≥ 3（UI 组件 AA；3–4.5 记 warn）
 *   3. 移动端底栏触控目标           高度 ≥ 44px
 *   4. 键盘焦点可见                Tab 后 activeElement 有 outline / box-shadow
 *
 * 每站跑 light + dark 两种模式。用法：
 *   node scripts/lifeos-prod-a11y-spotcheck.mjs [planner,fitness,...]
 * 需要 apps/<id>/build 已存在（缺失时 preview-app.sh 会自动构建）。
 */
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { getAppList, appBaseUrl } from './pwa/apps.config.mjs'

const WCAG_AA_UI = 3
const WCAG_AA_TEXT = 4.5
const MIN_TOUCH_PX = 44
const PROD_IDS = ['planner', 'fitness', 'finance', 'music']

const filter = process.argv[2]?.split(',').filter(Boolean)
const apps = getAppList({ ids: filter?.length ? filter : PROD_IDS })

/** 在页面内解析颜色并沿祖先链合成有效背景（对齐 design-catalog.a11y.helpers） */
const CONTRAST_SNIPPET = `
  const parse = (color) => {
    const c = color.trim()
    if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
    const alpha = (raw) => raw == null ? 1 : raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
    let m = c.match(/rgba?\\(\\s*([\\d.]+)[\\s,]+([\\d.]+)[\\s,]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.%]+))?/)
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: alpha(m[4]) }
    m = c.match(/color\\(\\s*srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.%]+))?/)
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: alpha(m[4]) }
    return null
  }
  const effectiveBg = (el) => {
    const layers = []
    let node = el
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
      node = node.parentElement
    }
    if (!layers.length || layers[layers.length - 1].a < 1) {
      const canvas = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }
      layers.push(canvas.a >= 1 ? canvas : { r: 255, g: 255, b: 255, a: 1 })
    }
    let acc = layers[layers.length - 1]
    for (let i = layers.length - 2; i >= 0; i--) {
      const s = layers[i]
      acc = { r: s.r * s.a + acc.r * (1 - s.a), g: s.g * s.a + acc.g * (1 - s.a), b: s.b * s.a + acc.b * (1 - s.a), a: 1 }
    }
    return acc
  }
  const lum = ({ r, g, b }) => {
    const ch = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
  }
  const ratio = (el) => {
    const bg = effectiveBg(el)
    let fg = parse(getComputedStyle(el).color)
    if (!fg) return 0
    if (fg.a < 1) fg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
    const l1 = lum(fg), l2 = lum(bg)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
`

async function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // server not up yet
    }
    await delay(500)
  }
  throw new Error(`server not reachable: ${url}`)
}

const failures = []
const warnings = []
const passes = []

function record(level, app, mode, check, detail) {
  const line = `[${app}/${mode}] ${check}: ${detail}`
  if (level === 'fail') failures.push(line)
  else if (level === 'warn') warnings.push(line)
  else passes.push(line)
}

const browser = await chromium.launch()

for (const app of apps) {
  const server = spawn('bash', ['scripts/pwa/preview-app.sh', app.id], {
    stdio: 'ignore',
    detached: true,
  })
  const base = appBaseUrl(app)
  try {
    await waitForServer(base)

    for (const mode of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: 393, height: 852 },
      })
      await page.goto(base, { waitUntil: 'networkidle' })
      await page.evaluate((m) => {
        document.documentElement.dataset.theme = m
        try {
          localStorage.setItem('theme', m)
        } catch {}
      }, mode)
      await page.waitForTimeout(250)

      // 1. 页面标题对比度
      const titleRatio = await page.evaluate(`(() => {
        ${CONTRAST_SNIPPET}
        const el = document.querySelector('.page-title, main h1, h1')
        return el ? ratio(el) : null
      })()`)
      if (titleRatio == null) record('warn', app.id, mode, 'title', '未找到标题元素')
      else if (titleRatio < WCAG_AA_UI)
        record('fail', app.id, mode, 'title-contrast', titleRatio.toFixed(2))
      else record('pass', app.id, mode, 'title-contrast', titleRatio.toFixed(2))

      // 2+3. 底栏导航项：对比度 + 触控目标
      const navProbe = await page.evaluate(`(() => {
        ${CONTRAST_SNIPPET}
        const items = [...document.querySelectorAll('nav .nav-item')].filter(
          (el) => el.offsetParent !== null,
        )
        return items.map((el) => {
          const rect = el.getBoundingClientRect()
          const label = el.querySelector('.nav-lbl') ?? el
          return {
            label: (el.textContent ?? '').trim().slice(0, 12),
            height: rect.height,
            active: el.classList.contains('on') || el.classList.contains('active'),
            ratio: ratio(label),
          }
        })
      })()`)
      if (!navProbe.length) {
        record('warn', app.id, mode, 'nav', '未找到可见导航项')
      }
      for (const item of navProbe) {
        const tag = `nav「${item.label}」${item.active ? '(active)' : ''}`
        if (item.ratio < WCAG_AA_UI)
          record('fail', app.id, mode, `${tag} contrast`, item.ratio.toFixed(2))
        else if (item.ratio < WCAG_AA_TEXT)
          record('warn', app.id, mode, `${tag} contrast`, `${item.ratio.toFixed(2)}（3–4.5）`)
        else record('pass', app.id, mode, `${tag} contrast`, item.ratio.toFixed(2))
        if (item.height < MIN_TOUCH_PX)
          record('fail', app.id, mode, `${tag} touch`, `${item.height.toFixed(0)}px < ${MIN_TOUCH_PX}px`)
        else record('pass', app.id, mode, `${tag} touch`, `${item.height.toFixed(0)}px`)
      }

      // 4. 键盘焦点可见（Tab 两次，跳过 skip-link 后看第一个焦点）
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      const focusProbe = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName.toLowerCase(),
          outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
          boxShadow: cs.boxShadow !== 'none',
          border: cs.borderColor,
        }
      })
      if (!focusProbe) record('warn', app.id, mode, 'focus', 'Tab 后无聚焦元素')
      else if (!focusProbe.outline && !focusProbe.boxShadow)
        record('fail', app.id, mode, 'focus-visible', `${focusProbe.tag} 无 outline/box-shadow`)
      else record('pass', app.id, mode, 'focus-visible', focusProbe.tag)

      await page.close()
    }
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      server.kill('SIGTERM')
    }
  }
}

await browser.close()

console.log(`\n=== 生产四站共享 primitive a11y 抽检 ===`)
console.log(`pass ${passes.length} · warn ${warnings.length} · fail ${failures.length}\n`)
if (warnings.length) {
  console.log('WARN:')
  for (const w of warnings) console.log('  ' + w)
}
if (failures.length) {
  console.log('FAIL:')
  for (const f of failures) console.log('  ' + f)
  process.exit(1)
}
console.log('OK — 抽检全部通过（warn 见上）')
