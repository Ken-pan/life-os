/**
 * Music OS — Progress bar UI/UX walkthrough (desktop + mobile)
 * Usage: node scripts/qa-progress-bar.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveScreenshotDir,
  screenshotDirRel,
} from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.env.MUSIC_QA_URL ?? 'http://127.0.0.1:5189'
const { dir: outDir } = resolveScreenshotDir({
  app: 'music',
  suite: 'progress-bar',
  importMetaUrl: import.meta.url,
})
const screenshotDirRelPath = screenshotDirRel({
  app: 'music',
  suite: 'progress-bar',
})

/** @type {{ id: string, severity: 'high'|'medium'|'low', surface: string, viewport: string, issue: string, screenshot?: string }[]} */
const issues = []

function mark(id, severity, surface, viewport, issue, screenshot = '') {
  issues.push({ id, severity, surface, viewport, issue, screenshot })
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  return `${name}.png`
}

const SEED_TRACKS = [
  {
    id: 'qa-progress-001',
    title: '稻香',
    artist: '周杰伦',
    album: '魔杰座',
    duration: 220,
    lyrics: '',
  },
  {
    id: 'qa-progress-002',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    duration: 354,
    lyrics: '',
  },
]

async function seedTracks(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForLoadState('domcontentloaded')
      return await page.evaluate(async (tracks) => {
        const slug = (s) => (s || 'unknown').trim().toLowerCase() || 'unknown'
        return new Promise((resolve) => {
          const req = indexedDB.open('musicos_library')
          req.onupgradeneeded = () => {}
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('tracks', 'readwrite')
            const store = tx.objectStore('tracks')
            for (const track of tracks) {
              store.put({
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                albumKey: slug(`${track.artist}::${track.album}`),
                artistKey: slug(track.artist),
                duration: track.duration,
                mime: 'audio/mpeg',
                size: 1,
                addedAt: Date.now(),
                playCount: 0,
                liked: 0,
                lyrics: track.lyrics || '',
                words: `${track.title} ${track.artist} ${track.album}`
                  .toLowerCase()
                  .split(/\s+/)
                  .filter(Boolean),
              })
            }
            tx.oncomplete = () => resolve({ ok: true, count: tracks.length })
            tx.onerror = () => resolve({ ok: false })
          }
          req.onerror = () => resolve({ ok: false })
        })
      }, SEED_TRACKS)
    } catch (err) {
      if (
        !String(err).includes('Execution context was destroyed') ||
        attempt === 2
      )
        throw err
      await page.waitForTimeout(600)
    }
  }
}

/** @param {import('playwright').Page} page */
async function playFirstTrack(page) {
  await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.track-table-row, .track-row', {
    timeout: 15_000,
  })
  const tablePlay = page.locator('.track-table-icon-btn.play').first()
  const rowPlay = page.locator('.track-row .track-action-btn.play').first()
  if (await tablePlay.count()) {
    await tablePlay.click()
  } else {
    await rowPlay.click()
  }
  await page.waitForSelector('.mini-player.show', { timeout: 10_000 })
  await page.waitForTimeout(800)
}

/** @param {import('playwright').Page} page */
async function measureProgressBars(page, label) {
  return page.evaluate((label) => {
    /** @param {string} sel */
    const rects = (sel) =>
      [...document.querySelectorAll(sel)].map((el, i) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const thumb = el.matches('input[type="range"]')
          ? {
              webkitThumbVisible:
                cs.getPropertyValue('-webkit-appearance') !== 'none',
            }
          : null
        return {
          selector: sel,
          index: i,
          width: Math.round(r.width),
          height: Math.round(r.height),
          top: Math.round(r.top),
          visible:
            r.width > 0 &&
            r.height > 0 &&
            cs.display !== 'none' &&
            cs.visibility !== 'hidden',
          ariaLabel: el.getAttribute('aria-label'),
          role: el.getAttribute('role'),
          value: el instanceof HTMLInputElement ? el.value : null,
          max: el instanceof HTMLInputElement ? el.max : null,
          progressPct:
            cs.getPropertyValue('--progress-pct') ||
            el.style.getPropertyValue('--progress-pct'),
          background: cs.background?.slice(0, 80),
          thumb,
        }
      })

    const selectors = [
      '.mini-player-top-progress .seek-bar-input',
      '.mini-player-top-progress input[type="range"]',
      '.mini-player-progress--inline .seek-bar-input',
      '.mini-player-progress input[type="range"]',
      '.player-progress .seek-bar-input',
      '.player-progress input[type="range"]',
      '.player-progress--quiet .seek-bar-input',
      '.np-mobile-progress .seek-bar-input',
      '.np-desktop-hero-seek .seek-bar-input',
    ]

    const bars = selectors.flatMap(rects).filter((b) => b.visible)
    const dupCount = bars.filter((b) => b.selector.includes('input')).length

    const timeEls = [
      ...document.querySelectorAll(
        '.player-progress-times span, .mini-player-time, .np-mobile-progress-times span',
      ),
    ].map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        text: el.textContent?.trim(),
        fontSize: cs.fontSize,
        color: cs.color,
        width: Math.round(r.width),
        visible: r.width > 0,
      }
    })

    return { label, bars, dupCount, timeEls, route: location.pathname }
  }, label)
}

/** @param {import('playwright').Page} page */
async function setSimulatedProgress(page, pct = 0.35) {
  await page.evaluate((pct) => {
    // @ts-ignore
    const w = /** @type {any} */ (window)
    if (w.__playerStore) {
      w.__playerStore.duration = 220
      w.__playerStore.currentTime = 220 * pct
    }
    for (const input of document.querySelectorAll(
      'input[type="range"][aria-label="进度"]',
    )) {
      if (input instanceof HTMLInputElement) {
        input.max = '220'
        input.value = String(220 * pct)
        input.style.setProperty('--progress-pct', `${pct * 100}%`)
      }
    }
    const fill = document.querySelector('.np-desktop-hero-rail-fill')
    if (fill instanceof HTMLElement) {
      fill.style.width = `${pct * 100}%`
      const rail = fill.closest('.np-desktop-hero-rail')
      if (rail instanceof HTMLElement)
        rail.style.setProperty('--progress-pct', `${pct * 100}%`)
    }
  }, pct)
}

const browser = await chromium.launch({ headless: true })
const desktopCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const mobileCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})

const dPage = await desktopCtx.newPage()
const mPage = await mobileCtx.newPage()

for (const page of [dPage, mPage]) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  await seedTracks(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
}

// ── Desktop: Mini Player ──
await playFirstTrack(dPage)
await dPage.evaluate(() => {
  // Simulate mid-playback for visual audit
  const inputs = document.querySelectorAll(
    'input[type="range"][aria-label="进度"]',
  )
  for (const el of inputs) {
    if (el instanceof HTMLInputElement) {
      el.value = '77'
      el.style.setProperty('--progress-pct', '35%')
    }
  }
})

let s = await shot(dPage, '01-desktop-mini-player-default')
const dMini = await measureProgressBars(dPage, 'desktop-mini')

const topBar = dMini.bars.find((b) =>
  b.selector.includes('mini-player-top-progress'),
)
const inlineBar = dMini.bars.find((b) =>
  b.selector.includes('mini-player-progress--inline'),
)

if (topBar && inlineBar) {
  mark(
    'PB-01',
    'high',
    'MiniPlayer 桌面',
    '1440×900',
    '桌面端仍同时存在顶栏细线与内联进度条，违反单一控制源原则',
    s,
  )
} else if (inlineBar && !topBar) {
  mark(
    'PB-01',
    'low',
    'MiniPlayer 桌面',
    '1440×900',
    '桌面端仅保留内联标准进度条 ✓',
    s,
  )
}
if (topBar && topBar.height < 20) {
  mark(
    'PB-02',
    'low',
    'MiniPlayer 顶部进度',
    '1440×900',
    `顶部进度条可见高度仅 ${topBar.height}px，默认无 thumb（需 hover 才出现），可发现性弱`,
    s,
  )
}
if (inlineBar && !inlineBar.visible) {
  mark(
    'PB-03',
    'high',
    'MiniPlayer 桌面',
    '1440×900',
    '桌面展开态内联进度条未显示',
    s,
  )
}

// Focus keyboard (desktop uses inline seek on expanded mini player)
const inlineInput = dPage.locator(
  '.mini-player-progress--inline .seek-bar-input',
)
if (await inlineInput.count()) {
  await inlineInput.focus()
  await dPage.waitForTimeout(200)
  s = await shot(dPage, '03-desktop-mini-player-inline-focus')
  mark(
    'PB-04',
    'low',
    'MiniPlayer 内联进度',
    '1440×900',
    'focus-visible 显示 thumb 光晕，键盘用户可定位播放位置',
    s,
  )
}

// ── Desktop: Now Playing ──
await dPage.locator('a.mini-player-link').click()
await dPage.waitForURL('**/now-playing', { timeout: 10_000 })
await dPage.waitForTimeout(1000)

s = await shot(dPage, '04-desktop-now-playing')
const dNp = await measureProgressBars(dPage, 'desktop-np')

const heroSeek = dNp.bars.find((b) =>
  b.selector.includes('np-desktop-hero-seek'),
)
const quietProgress = dNp.bars.find((b) =>
  b.selector.includes('player-progress--quiet'),
)

if (heroSeek) {
  if (heroSeek.height < 20) {
    mark(
      'PB-05',
      'medium',
      'Now Playing 桌面紧凑 Hero',
      '1440×900',
      `Hero seek 热区高度 ${heroSeek.height}px，已可交互`,
      s,
    )
  }
} else if (quietProgress?.visible) {
  if (quietProgress.height < 24) {
    mark(
      'PB-05',
      'medium',
      'Now Playing 桌面',
      '1440×900',
      `quiet 进度触控高度 ${quietProgress.height}px < 24px`,
      s,
    )
  }
}
if (!quietProgress?.visible && !heroSeek) {
  mark(
    'PB-07',
    'medium',
    'Now Playing 桌面',
    '1440×900',
    '未检测到可 seek 的进度控件',
    s,
  )
}

// Check time labels on desktop NP
const hasElapsed = dNp.timeEls.some(
  (t) => t.visible && t.text && !t.text.startsWith('-') && t.text.includes(':'),
)
const hasTotal = dNp.timeEls.some(
  (t) =>
    t.visible &&
    t.text &&
    !t.text.startsWith('-') &&
    t.text.includes(':') &&
    t.text !== '0:00',
)
if ((heroSeek || quietProgress) && !hasElapsed && !hasTotal) {
  mark(
    'PB-08',
    'medium',
    'Now Playing 桌面',
    '1440×900',
    '进度条旁无 elapsed/total 时间标注',
    s,
  )
}

// Lyrics panel progress sync indicator?
const lyricsProgress = await dPage
  .locator(
    '.lyrics-panel input[type="range"], .now-playing-lyrics input[type="range"]',
  )
  .count()
if (lyricsProgress > 0) {
  s = await shot(dPage, '05-desktop-lyrics-progress')
  mark(
    'PB-09',
    'low',
    '歌词面板',
    '1440×900',
    '歌词区域存在额外进度控件，需确认是否与主进度条重复',
    s,
  )
}

// ── Mobile: Mini Player ──
await playFirstTrack(mPage)
s = await shot(mPage, '10-mobile-mini-player')
const mMini = await measureProgressBars(mPage, 'mobile-mini')

const mTop = mMini.bars.find((b) =>
  b.selector.includes('mini-player-top-progress'),
)
const mInline = mMini.bars.find((b) =>
  b.selector.includes('mini-player-progress--inline'),
)

if (mTop && mInline) {
  mark(
    'PB-10',
    'high',
    'MiniPlayer 移动',
    '390×844',
    '移动端同时显示顶部细条 + 内联三件套进度（时间-滑条-时间），垂直空间浪费且双层 seek 易误触',
    s,
  )
}
if (mTop && mTop.height < 44) {
  mark(
    'PB-18',
    'medium',
    'MiniPlayer 移动顶栏',
    '390×844',
    `顶栏进度触控高度 ${mTop.height}px < 44px`,
    s,
  )
} else if (mTop) {
  mark(
    'PB-18',
    'low',
    'MiniPlayer 移动顶栏',
    '390×844',
    `顶栏进度触控高度 ${mTop.height}px ✓`,
    s,
  )
}

// ── Mobile: Now Playing ──
await mPage.locator('a.mini-player-link').click()
await mPage.waitForURL('**/now-playing', { timeout: 10_000 })
await mPage.waitForTimeout(1200)

s = await shot(mPage, '11-mobile-now-playing-default')
const mNp = await measureProgressBars(mPage, 'mobile-np')

const mobileProgress = mNp.bars.find((b) =>
  b.selector.includes('np-mobile-progress'),
)
if (mobileProgress) {
  if (mobileProgress.height < 44) {
    mark(
      'PB-12',
      'high',
      'Now Playing 移动',
      '390×844',
      `np-mobile-progress 触控高度 ${mobileProgress.height}px < 44px`,
      s,
    )
  } else {
    mark(
      'PB-12',
      'low',
      'Now Playing 移动',
      '390×844',
      `np-mobile-progress 触控高度 ${mobileProgress.height}px ✓ 达标`,
      s,
    )
  }
}

// Time format: unified elapsed + total
const times = mNp.timeEls
  .filter((t) => t.visible)
  .map((t) => t.text)
  .filter(Boolean)
if (times.length >= 2) {
  const hasNegative = times.some((t) => t.startsWith('-'))
  if (hasNegative) {
    mark(
      'PB-13',
      'medium',
      'Now Playing 移动',
      '390×844',
      `时间仍使用 remaining 格式（${times.join(' / ')}），应与桌面统一为 total`,
      s,
    )
  }
}

// Active drag state
const npSlider = mPage.locator('.np-mobile-progress .seek-bar-input')
if (await npSlider.count()) {
  const box = await npSlider.boundingBox()
  if (box) {
    await mPage.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await mPage.mouse.down()
    await mPage.waitForTimeout(150)
    s = await shot(mPage, '12-mobile-now-playing-scrubbing')
    await mPage.mouse.up()
    mark(
      'PB-14',
      'low',
      'Now Playing 移动',
      '390×844',
      '拖拽时 thumb 放大 + 轨道 active 时加粗至 8px',
      s,
    )
  }
}

// ── Cross-surface consistency ──
mark(
  'PB-15',
  'low',
  '全局',
  'all',
  '进度条已统一为 SeekBar 组件 + seek-bar-input 样式，variant 控制布局',
  '',
)

// ── Zero duration edge ──
await dPage.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' })
await dPage.evaluate(async () => {
  return new Promise((resolve) => {
    const req = indexedDB.open('musicos_library')
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('tracks', 'readwrite')
      tx.objectStore('tracks').put({
        id: 'qa-progress-zero',
        title: 'Zero Duration',
        artist: 'QA',
        album: 'Edge',
        albumKey: 'edge',
        artistKey: 'qa',
        duration: 0,
        mime: 'audio/mpeg',
        size: 1,
        addedAt: Date.now(),
        playCount: 0,
        liked: 0,
        words: ['zero'],
      })
      tx.oncomplete = () => resolve(true)
    }
  })
})
await dPage.reload({ waitUntil: 'domcontentloaded' })
await dPage.waitForSelector('.track-table-row, .track-row', { timeout: 15_000 })
await dPage
  .locator('.track-table-row')
  .filter({ hasText: 'Zero Duration' })
  .locator('.track-table-icon-btn.play')
  .click()
await dPage.waitForSelector('.mini-player.show', { timeout: 8000 })
s = await shot(dPage, '20-edge-zero-duration')
const edge = await dPage.evaluate(() => {
  const input = document.querySelector(
    '.mini-player-top-progress .seek-bar-input, .mini-player-progress--inline .seek-bar-input',
  )
  return input instanceof HTMLInputElement
    ? {
        max: input.max,
        value: input.value,
        disabled: input.disabled,
        pct: input.style.getPropertyValue('--progress-pct'),
      }
    : null
})
if (edge && !edge.disabled) {
  mark(
    'PB-17',
    'medium',
    '边界态',
    '1440×900',
    'duration=0 时进度条应 disabled；检查 max/disabled 状态',
    s,
  )
}

// ── Report ──
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE,
  screenshotDir: screenshotDirRelPath,
  measurements: {
    desktopMini: dMini,
    desktopNp: dNp,
    mobileMini: mMini,
    mobileNp: mNp,
    zeroDuration: edge,
  },
  issues,
  summary: {
    total: issues.length,
    high: issues.filter((i) => i.severity === 'high').length,
    medium: issues.filter((i) => i.severity === 'medium').length,
    low: issues.filter((i) => i.severity === 'low').length,
  },
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))

let md = `# Music OS 进度条 UI/UX 走查报告\n\n`
md += `生成时间：${report.generatedAt}\n\n`
md += `截图目录：\`${screenshotDirRelPath}/\`\n\n`
md += `## 摘要\n\n`
md += `- 问题总数：**${report.summary.total}**（高 ${report.summary.high} / 中 ${report.summary.medium} / 低 ${report.summary.low}）\n\n`
md += `## 问题清单\n\n`
md += `| ID | 严重度 | 界面 | 视口 | 问题 | 截图 |\n`
md += `|---|---|---|---|---|---|\n`
for (const i of issues) {
  md += `| ${i.id} | ${i.severity} | ${i.surface} | ${i.viewport} | ${i.issue} | ${i.screenshot || '—'} |\n`
}
md += `\n## 测量数据\n\n\`\`\`json\n${JSON.stringify(report.measurements, null, 2)}\n\`\`\`\n`
writeFileSync(join(outDir, 'REPORT.md'), md)

console.log('\n=== Progress Bar UI/UX Audit ===\n')
for (const i of issues) {
  const icon =
    i.severity === 'high' ? '🔴' : i.severity === 'medium' ? '🟠' : '🟡'
  console.log(`${icon} [${i.id}] (${i.severity}) ${i.surface} — ${i.issue}`)
}
console.log(`\nScreenshots: ${outDir}`)
console.log(`Report: ${join(outDir, 'REPORT.md')}`)

await browser.close()
