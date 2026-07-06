/**
 * IME composition guard audit — GlobalSearch (Chrome + Safari-order simulation)
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.IME_AUDIT_BASE ?? 'http://127.0.0.1:5196'
const OUT = join(process.cwd(), '.qa-screenshots/ime-audit')
const issues = []

function issue(id, title, detail) {
  issues.push({ id, title, detail })
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
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const db = req.result
    const tx = db.transaction('tracks', 'readwrite')
    const store = tx.objectStore('tracks')
    const now = Date.now()
    await new Promise((resolve, reject) => {
      const put = store.put({
        id: 'ime-1',
        title: '夜曲',
        artist: '周杰伦',
        album: '十一月的萧邦',
        albumKey: '十一月的萧邦',
        artistKey: '周杰伦',
        duration: 226,
        mime: 'audio/mpeg',
        size: 0,
        addedAt: now,
        playCount: 1,
        liked: 0,
        words: ['夜曲', '周杰伦'],
      })
      put.onsuccess = () => resolve()
      put.onerror = () => reject(put.error)
    })
  })
}

/** @param {import('playwright').Page} page */
async function getSearchInput(page) {
  const input = page.locator('.appbar-search-input').first()
  await input.waitFor({ state: 'visible', timeout: 8000 })
  return input
}

/** @param {import('playwright').Page} page @param {import('playwright').Locator} input */
async function dispatchCompositionInput(page, input, text) {
  await input.focus()
  await input.evaluate((el, text) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    el.value = text
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: text,
        isComposing: true,
      }),
    )
  }, text)
}

/** @param {import('playwright').Locator} input @param {KeyboardEventInit} init */
async function dispatchKeydown(input, init) {
  await input.evaluate((el, init) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
  }, init)
}

/** @param {import('playwright').Locator} input @param {string} data */
async function dispatchCompositionEnd(input, data) {
  await input.evaluate((el, data) => {
    el.value = data
    el.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data }),
    )
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data,
        isComposing: false,
      }),
    )
  }, data)
}

async function run() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  })
  const page = await ctx.newPage()

  await seedLibrary(page)
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(800)

  const input = await getSearchInput(page)

  // T1: Enter during isComposing=true must not navigate
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(400)
  const input1 = await getSearchInput(page)
  await dispatchCompositionInput(page, input1, 'zhoujie')
  await dispatchKeydown(input1, {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    isComposing: true,
  })
  await page.waitForTimeout(300)
  if (!page.url().endsWith('/') && !page.url().match(/\/\?/)) {
    const path = new URL(page.url()).pathname
    if (path.startsWith('/search')) {
      issue(
        'IME-T1',
        'Enter during isComposing navigates to search',
        page.url(),
      )
    }
  }

  // T2: Safari order — compositionend then Enter in same turn must not submit
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(400)
  const input2 = await getSearchInput(page)
  await dispatchCompositionInput(page, input2, 'zhoujielun')
  await input2.evaluate((el) => {
    el.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '周杰伦' }),
    )
    el.value = '周杰伦'
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: '周杰伦',
        isComposing: false,
      }),
    )
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        isComposing: false,
        keyCode: 13,
      }),
    )
  })
  await page.waitForTimeout(50)
  if (new URL(page.url()).pathname.startsWith('/search')) {
    issue(
      'IME-T2',
      'Safari-order IME confirm Enter submits search',
      page.url(),
    )
  }

  // T3: keyCode 229 Enter must not submit
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(400)
  const input3 = await getSearchInput(page)
  await dispatchKeydown(input3, {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: false,
  })
  await page.waitForTimeout(100)
  if (new URL(page.url()).pathname.startsWith('/search')) {
    issue('IME-T3', 'keyCode 229 Enter submits search', page.url())
  }

  // T4: After composition settles, intentional Enter submits
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(400)
  const input4 = await getSearchInput(page)
  await dispatchCompositionEnd(input4, '周杰伦')
  await page.waitForTimeout(30)
  await dispatchKeydown(input4, {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    isComposing: false,
  })
  await page.waitForTimeout(600)
  const url4 = page.url()
  if (!url4.includes('q=%E5%91%A8%E6%9D%B0%E4%BC%A6') && !url4.includes('q=周杰伦')) {
    issue(
      'IME-T4',
      'Enter after composition should submit search',
      url4,
    )
  }

  // T5: composition期间 suggestPending should not flip true mid-pinyin (debounced guard)
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(400)
  const input5 = await getSearchInput(page)
  let pendingDuringComposition = false
  await input5.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  })
  for (const ch of ['z', 'h', 'o', 'u']) {
    await input5.evaluate((el, ch) => {
      el.value += ch
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: ch,
          isComposing: true,
        }),
      )
    }, ch)
    await page.waitForTimeout(30)
    pendingDuringComposition = await page.evaluate(() => {
      const el = document.querySelector('.search-suggestions')
      return Boolean(el?.textContent?.includes('搜索中'))
    })
    if (pendingDuringComposition) break
  }
  if (pendingDuringComposition) {
    issue(
      'IME-T5',
      'Typeahead fired during IME composition',
      'saw loading state while isComposing',
    )
  }

  // ── Mobile /search page toolbar input ──
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const mobilePage = await mobileCtx.newPage()
  await seedLibrary(mobilePage)
  await mobilePage.goto(`${BASE}/search`)
  await mobilePage.waitForTimeout(600)

  const pageInput = mobilePage.locator('.search-page-input').first()
  await pageInput.waitFor({ state: 'visible', timeout: 8000 })

  // T6: partial pinyin during composition must not land in URL
  await dispatchCompositionInput(mobilePage, pageInput, 'zhoujie')
  await mobilePage.waitForTimeout(350)
  const q6 = new URL(mobilePage.url()).searchParams.get('q') ?? ''
  if (/zhou/i.test(q6)) {
    issue(
      'IME-T6',
      'Search page URL updated with partial pinyin during composition',
      mobilePage.url(),
    )
  }

  // T7: Safari-order confirm Enter on /search must not leave partial query
  await mobilePage.goto(`${BASE}/search`)
  await mobilePage.waitForTimeout(400)
  const pageInput7 = mobilePage.locator('.search-page-input').first()
  await dispatchCompositionInput(mobilePage, pageInput7, 'zhoujielun')
  await pageInput7.evaluate((el) => {
    el.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '周杰伦' }),
    )
    el.value = '周杰伦'
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: '周杰伦',
        isComposing: false,
      }),
    )
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        isComposing: false,
        keyCode: 13,
      }),
    )
  })
  await mobilePage.waitForTimeout(500)
  const q7 = new URL(mobilePage.url()).searchParams.get('q') ?? ''
  if (/zhou/i.test(q7)) {
    issue(
      'IME-T7',
      'Search page Safari-order IME left partial pinyin in URL',
      mobilePage.url(),
    )
  }

  // T8: full search should not run mid-composition on /search
  await mobilePage.goto(`${BASE}/search`)
  await mobilePage.waitForTimeout(400)
  const pageInput8 = mobilePage.locator('.search-page-input').first()
  await pageInput8.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  })
  for (const ch of ['z', 'h', 'o']) {
    await pageInput8.evaluate((el, ch) => {
      el.value += ch
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: ch, isComposing: true }),
      )
    }, ch)
  }
  await mobilePage.waitForTimeout(350)
  const pendingMidCompose = await mobilePage
    .locator('.search-page-summary')
    .textContent()
    .then((t) => (t ?? '').includes('搜索中'))
    .catch(() => false)
  if (pendingMidCompose) {
    issue(
      'IME-T8',
      'Search page full search pending during IME composition',
      'search-page-summary showed loading',
    )
  }

  await mobileCtx.close()

  await page.screenshot({ path: join(OUT, 'ime-audit-final.png') })
  await browser.close()

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    issueCount: issues.length,
    issues,
  }
  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exit(issues.length ? 1 : 0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
