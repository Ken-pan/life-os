/**
 * Music OS search flow walkthrough — desktop + mobile screenshots + regression checks
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveScreenshotDir } from '../../../scripts/qa/screenshot-output.mjs'

const BASE = process.env.SEARCH_AUDIT_BASE ?? 'http://127.0.0.1:5189'
const { dir: OUT } = resolveScreenshotDir({
  app: 'music',
  suite: 'search-audit',
  importMetaUrl: import.meta.url,
})
const issues = []

function issue(id, sev, flow, title, detail, shot = '') {
  issues.push({ id, sev, flow, title, detail, screenshot: shot })
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  return `${name}.png`
}

async function wait(page, ms = 600) {
  await page.waitForTimeout(ms)
}

async function seedLibrary(page) {
  await page.goto(`${BASE}/library`)
  await page.evaluate(async () => {
    const req = indexedDB.open('musicos_library', 3)
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('recent')) {
          db.createObjectStore('recent', { keyPath: 'trackId' })
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('playlistTracks')) {
          db.createObjectStore('playlistTracks', {
            keyPath: 'rowId',
            autoIncrement: true,
          })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const db = req.result
    const now = Date.now()
    const samples = [
      {
        id: 'qa-1',
        title: '夜曲',
        artist: '周杰伦',
        album: '十一月的萧邦',
        albumKey: '十一月的萧邦',
        artistKey: '周杰伦',
        duration: 226,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now - 86400000,
        playCount: 12,
        liked: 1,
        words: ['夜曲', '周杰伦', '十一月的萧邦'],
      },
      {
        id: 'qa-2',
        title: '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        albumKey: '叶惠美',
        artistKey: '周杰伦',
        duration: 269,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now - 172800000,
        playCount: 8,
        liked: 0,
        words: ['晴天', '周杰伦', '叶惠美'],
      },
      {
        id: 'qa-3',
        title: '稻香',
        artist: '周杰伦',
        album: '魔杰座',
        albumKey: '魔杰座',
        artistKey: '周杰伦',
        duration: 223,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now,
        playCount: 3,
        liked: 0,
        words: ['稻香', '周杰伦', '魔杰座'],
      },
    ]
    const plId = 'qa-pl-1'
    const tx = db.transaction(
      ['tracks', 'recent', 'playlists', 'playlistTracks'],
      'readwrite',
    )
    for (const t of samples) tx.objectStore('tracks').put(t)
    tx.objectStore('recent').put({ trackId: 'qa-1', playedAt: now - 3600000 })
    tx.objectStore('playlists').put({
      id: plId,
      name: '周杰伦精选',
      kind: 'user',
      createdAt: now,
      updatedAt: now,
    })
    tx.objectStore('playlistTracks').put({
      playlistId: plId,
      trackId: 'qa-1',
      position: 0,
    })
    await new Promise((r, j) => {
      tx.oncomplete = r
      tx.onerror = j
    })
    localStorage.setItem(
      'musicos_recent_searches',
      JSON.stringify(['周杰伦', '夜曲']),
    )
  })
}

async function checkSortLayout(page, shotName) {
  const sort = page.locator('.search-page-sort')
  if ((await sort.count()) === 0) return
  const layout = await sort.evaluate((el) => {
    const btns = [...el.querySelectorAll('button')]
    const rects = btns.map((b) => b.getBoundingClientRect())
    const widths = rects.map((r) => Math.round(r.width))
    const tops = rects.map((r) => Math.round(r.top))
    const overlap =
      btns.length >= 2 &&
      rects.some((r, i) =>
        btns.some((_, j) => {
          if (i >= j) return false
          const o = rects[j]
          return !(
            r.right <= o.left ||
            o.right <= r.left ||
            r.bottom <= o.top ||
            o.bottom <= r.top
          )
        }),
      )
    return {
      display: getComputedStyle(el).display,
      flexDirection: getComputedStyle(el).flexDirection,
      width: Math.round(el.getBoundingClientRect().width),
      btnWidths: widths,
      btnTops: tops,
      overlap,
      hasSegIcons: el.classList.contains('seg-icons'),
    }
  })
  if (
    layout.hasSegIcons ||
    layout.overlap ||
    layout.btnWidths.every((w) => w <= 32)
  ) {
    issue(
      'SR-D17',
      'critical',
      '桌面结果页',
      '排序控件布局崩溃/重叠',
      JSON.stringify(layout),
      shotName,
    )
  }
}

async function checkScopeTabs(page, shotName) {
  const tabs = await page.locator('.search-scopes button').evaluateAll((els) =>
    els.map((b) => ({
      text: b.textContent?.trim() ?? '',
      disabled: b.disabled,
      count:
        b.querySelector('.search-scope-count')?.textContent?.trim() ?? null,
    })),
  )
  if (tabs.some((t) => t.disabled)) {
    issue(
      'SR-D18',
      'medium',
      '桌面 Scope',
      '0 结果 scope 被 disabled',
      JSON.stringify(tabs),
      shotName,
    )
  }
}

async function desktopFlow(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await ctx.newPage()
  await seedLibrary(page)
  await page.reload()
  await wait(page, 1200)

  await page.goto(`${BASE}/`)
  await wait(page, 800)
  let s = await shot(page, 'D01-home')

  const speedDialLabels = await page
    .locator(
      '.speed-dial-grid .speed-dial-cell:not(.speed-dial-cell--surprise) .speed-dial-label',
    )
    .allTextContents()
  const firstSix = speedDialLabels.slice(0, 6)
  if (firstSix.length >= 3 && new Set(firstSix).size !== firstSix.length) {
    issue(
      'SR-P06',
      'high',
      '首页速拨',
      '前 6 格出现重复标题/疑似重复封面',
      JSON.stringify(firstSix),
      s,
    )
  }

  const searchInput = page.locator(
    '.appbar-search-desktop .appbar-search-input',
  )
  await searchInput.waitFor({ state: 'visible', timeout: 15000 })

  await page.keyboard.press('Meta+k')
  await wait(page, 400)
  s = await shot(page, 'D02-cmdk-focus')

  await searchInput.click()
  await searchInput.fill('')
  await wait(page, 300)
  s = await shot(page, 'D03-typeahead-recent')

  await searchInput.fill('周')
  await wait(page, 300)
  s = await shot(page, 'D04-typeahead-1char')

  await searchInput.fill('周杰伦')
  await wait(page, 800)
  s = await shot(page, 'D05-typeahead-results')

  const clearBtn = page.locator('.appbar-search-clear')
  if ((await clearBtn.count()) === 0) {
    issue(
      'SR-D27',
      'low',
      '桌面 Typeahead',
      'AppBar 有 query 时缺少清除按钮',
      '',
      s,
    )
  }

  await page.goto(`${BASE}/search?q=${encodeURIComponent('周杰伦')}`)
  await wait(page, 1000)
  s = await shot(page, 'D06-search-results-all')
  await checkSortLayout(page, s)
  await checkScopeTabs(page, s)

  const sortVisibleAll = await page.locator('.search-page-sort').count()
  if (sortVisibleAll > 0) {
    issue(
      'SR-D21',
      'medium',
      '桌面结果页',
      'scope=all 时不应显示排序条',
      `count=${sortVisibleAll}`,
      s,
    )
  }

  await page.goto(
    `${BASE}/search?q=${encodeURIComponent('周杰伦')}&scope=tracks&sort=title`,
  )
  await wait(page, 800)
  s = await shot(page, 'D07-deeplink')
  await checkSortLayout(page, s)

  await page.goto(
    `${BASE}/search?q=${encodeURIComponent('周杰伦')}&scope=tracks`,
  )
  await wait(page, 800)
  s = await shot(page, 'D08-scope-tracks')
  const trackRow = page
    .locator('.search-page-section .track-row--rich-actions')
    .first()
  if ((await trackRow.count()) === 0) {
    issue('SR-P05', 'medium', '桌面搜索结果', '歌曲行缺少 richActions', '', s)
  } else {
    await trackRow.hover()
    await wait(page, 250)
    s = await shot(page, 'D08b-scope-tracks-hover')
    const moreVisible = await trackRow
      .locator('.track-row-action--more')
      .isVisible()
    if (!moreVisible) {
      issue(
        'SR-P05b',
        'medium',
        '桌面搜索结果',
        'hover 时未显示更多操作',
        '',
        s,
      )
    }
  }

  await page.goto(`${BASE}/search`)
  await wait(page, 800)
  s = await shot(page, 'D09-zero-state')
  const zeroScopes = await page.locator('.search-scopes').count()
  if (zeroScopes > 0) {
    issue(
      'SR-M16',
      'medium',
      'Zero State',
      '无 query 时不应显示 Scope tabs',
      `count=${zeroScopes}`,
      s,
    )
  }

  await page.goto(`${BASE}/search?q=${encodeURIComponent('xyznotfound123')}`)
  await wait(page, 1000)
  s = await shot(page, 'D10-no-results')
  const recovery = await page
    .locator('.search-page-empty-actions, .search-page-chip-list')
    .count()
  if (recovery === 0) {
    issue('SR-D19', 'medium', '桌面无结果', '缺少 recovery 操作区', '', s)
  }

  await page.goto(`${BASE}/search?q=${encodeURIComponent('周杰伦')}`)
  await wait(page, 800)
  await page.locator('.appbar-search-input').click()
  await page.keyboard.press('ArrowDown')
  await wait(page, 300)
  s = await shot(page, 'D11-keyboard-active')

  await page.goto(`${BASE}/search?q=${encodeURIComponent('周杰伦')}`)
  await wait(page, 800)
  s = await shot(page, 'D12-sidebar-search-active')
  const dropdownIdle = await page.locator('.search-suggestions').count()
  if (dropdownIdle > 0) {
    issue(
      'SR-P01',
      'critical',
      '桌面结果页',
      '未 focus 时 typeahead 仍覆盖结果页',
      `count=${dropdownIdle}`,
      s,
    )
  }

  await page.locator('.appbar-search-desktop .appbar-search-input').click()
  await wait(page, 400)
  s = await shot(page, 'D12b-search-focus-overlay')
  const overlayOpen = await page.locator('.search-typeahead-scrim').count()
  const bodyLocked = await page.evaluate(() =>
    document.body.classList.contains('search-typeahead-open'),
  )
  if (overlayOpen === 0 || !bodyLocked) {
    issue(
      'SR-P01b',
      'critical',
      '桌面结果页',
      'focus 时缺少 full-page overlay/scrim',
      `scrim=${overlayOpen}, bodyClass=${bodyLocked}`,
      s,
    )
  }
  const mainPe = await page.evaluate(() => {
    const main = document.querySelector('.main-wrap')
    return main ? getComputedStyle(main).pointerEvents : 'n/a'
  })
  if (mainPe !== 'none') {
    issue(
      'SR-P01c',
      'critical',
      '桌面结果页',
      'overlay 打开时背后内容仍可交互',
      `pointer-events=${mainPe}`,
      s,
    )
  }
  await page.keyboard.press('Escape')
  await wait(page, 300)

  await page.goto(
    `${BASE}/search?q=${encodeURIComponent('周杰伦')}&scope=playlists`,
  )
  await wait(page, 800)
  s = await shot(page, 'D13-playlist-match')
  const meta = await page
    .locator('.search-page-section .track-row-sub')
    .first()
    .textContent()
    .catch(() => '')
  if (!meta || !/\d/.test(meta)) {
    issue(
      'SR-D26',
      'low',
      '歌单结果',
      '缺少曲目数 metadata',
      meta ?? 'empty',
      s,
    )
  }

  await ctx.close()
}

async function mobileFlow(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await seedLibrary(page)
  await page.reload()
  await wait(page, 1200)

  await shot(page, 'M01-home')

  await page.goto(`${BASE}/search`)
  await wait(page, 800)
  let s = await shot(page, 'M02-search-zero')

  await page.goto(`${BASE}/search?q=${encodeURIComponent('周杰伦')}`)
  await wait(page, 1000)
  s = await shot(page, 'M04-search-results')
  await checkSortLayout(page, s)

  const tabsClip = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.search-scopes [role="tab"]')]
    const last = tabs[tabs.length - 1]
    if (!last) return { ok: false, reason: 'no tabs' }
    const rect = last.getBoundingClientRect()
    const parent = last.closest('.search-scopes')
    const parentRect = parent?.getBoundingClientRect()
    const scrollable = parent
      ? parent.scrollWidth > parent.clientWidth + 2
      : false
    const hardClip =
      parentRect &&
      rect.right > parentRect.right + 2 &&
      rect.left < parentRect.right - 8
    return {
      ok: scrollable || !hardClip,
      scrollable,
      lastText: last.textContent?.trim(),
    }
  })
  if (!tabsClip.ok) {
    issue(
      'SR-P02',
      'critical',
      '移动 tabs',
      '最后一项被硬切且不可滚动',
      JSON.stringify(tabsClip),
      s,
    )
  }

  await page
    .locator('.search-scopes [role="tab"]')
    .filter({ hasText: '歌单' })
    .click()
  await wait(page, 800)
  s = await shot(page, 'M05-scope-playlists')
  const playlistsSelected = await page
    .locator('.search-scopes [role="tab"][aria-selected="true"]')
    .filter({ hasText: '歌单' })
    .count()
  if (playlistsSelected === 0) {
    issue('SR-P02b', 'critical', '移动 tabs', '歌单 tab 无法选中', '', s)
  }

  const pageInput = page.locator('.search-page-input')
  if (await pageInput.count()) {
    const nativeClear = await pageInput.evaluate((el) => el.type === 'search')
    const customClear = await page.locator('.search-page-clear').count()
    if (nativeClear && customClear > 0) {
      issue(
        'SR-M13',
        'medium',
        '移动搜索框',
        'type=search 与自定义清除并存',
        `custom=${customClear}`,
        s,
      )
    }
    await page.locator('.search-page-clear').click()
    await wait(page, 500)
    s = await shot(page, 'M06-after-clear')
  }

  await page.goto(`${BASE}/search?q=${encodeURIComponent('xyznotfound123')}`)
  await wait(page, 1000)
  s = await shot(page, 'M07-no-results')

  await page.goto(`${BASE}/search?q=${encodeURIComponent('周杰伦')}`)
  await wait(page, 800)
  s = await shot(page, 'M08-bottom-nav-on-search')
  const searchTabOn = await page
    .locator('.bottom-nav .nav-item.on')
    .filter({ hasText: '搜索' })
    .count()
  const moreTabOn = await page.locator('.bottom-nav .nav-item-more.on').count()
  if (searchTabOn === 0) {
    issue(
      'SR-M19',
      'critical',
      '移动导航',
      '搜索页未高亮搜索 Tab',
      `searchOn=${searchTabOn}`,
      s,
    )
  }
  if (moreTabOn > 0) {
    issue(
      'SR-M19b',
      'critical',
      '移动导航',
      '搜索页错误高亮「更多」',
      `moreOn=${moreTabOn}`,
      s,
    )
  }

  await ctx.close()
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    await desktopFlow(browser)
    await mobileFlow(browser)
  } finally {
    await browser.close()
  }

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    issueCount: issues.length,
    issues,
  }
  await writeFile(join(OUT, 'issues.json'), JSON.stringify(issues, null, 2))
  await writeFile(
    join(OUT, 'REPORT.md'),
    `# Search Audit Report\n\n- Base: ${BASE}\n- Generated: ${report.generatedAt}\n- Issues: ${issues.length}\n\n${
      issues.length
        ? issues
            .map(
              (i) =>
                `- **${i.id}** (${i.sev}) ${i.title} — ${i.flow}${i.screenshot ? ` \`[${i.screenshot}]\`` : ''}`,
            )
            .join('\n')
        : 'No issues detected.'
    }\n`,
  )
  console.log(JSON.stringify(report, null, 2))
  process.exit(issues.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
