/**
 * Today-card module viewport audit — typography + layout screenshots.
 * node scripts/today-card-viewport-audit.mjs
 */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../screenshots/today-card-audit')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'

const VIEWPORTS = [
  { id: '320-reflow', width: 320, height: 568 },
  { id: '375-se', width: 375, height: 667 },
  { id: '390-phone', width: 390, height: 844 },
  { id: '430-pro-max', width: 430, height: 932 },
  { id: '768-tablet', width: 768, height: 1024 },
  { id: '1024-landscape', width: 1024, height: 768 },
  { id: '1280-desktop', width: 1280, height: 900 },
  { id: '1440-wide', width: 1440, height: 900 },
]

function dateKey(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function seed(page) {
  await page.goto(`${BASE}/`)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}')
    s.settings = {
      unit: 'lbs',
      logDetail: 'quick',
      theme: 'dark',
      locale: 'zh',
      ...(s.settings || {}),
    }
    s.weights = { c_bench: 185, ...(s.weights || {}) }
    s.logs = {}
    s.rotation = { next: 0, history: [], lastDeload: null }
    localStorage.setItem('fitos_v2', JSON.stringify(s))
  })
  await page.reload()
  await page.waitForSelector('.today-card')
}

async function probeStyles(page) {
  return page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const st = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        fontSize: st.fontSize,
        fontFamily: st.fontFamily.split(',')[0].replace(/"/g, ''),
        fontWeight: st.fontWeight,
        lineHeight: st.lineHeight,
        color: st.color,
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    }
    const metaSpans = [
      ...document.querySelectorAll('.today-card .tc-meta span'),
    ].map((el, i) => {
      const st = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        index: i,
        text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 48),
        fontSize: st.fontSize,
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    })
    return {
      callout: pick('.today-card .callout'),
      tcMeta: pick('.today-card .tc-meta'),
      tcPct: pick('.today-card .tc-pct'),
      btnStart: pick('.today-card .btn-start'),
      metaSpans,
      card: pick('.today-card'),
    }
  })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const report = []

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    })
    const page = await ctx.newPage()
    await seed(page)
    await page.locator('.today-card').scrollIntoViewIfNeeded()

    const styles = await probeStyles(page)
    report.push({ viewport: vp.id, size: `${vp.width}×${vp.height}`, styles })

    await page.locator('.today-card').screenshot({
      path: path.join(OUT, `${vp.id}.png`),
    })
    console.log(`✓ ${vp.id}`)
    await ctx.close()
  }

  await writeFile(
    path.join(OUT, 'report.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
  console.log('→', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
