/**
 * Capture real Kenos /assistant UI states → 10-in-1 review board.
 * Requires aios dev on http://127.0.0.1:5197
 */
import { chromium, devices } from 'playwright'
import { createRequire } from 'module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const RAW = path.join(OUT, 'raw')
const BASE = 'http://127.0.0.1:5197'
const require = createRequire(import.meta.url)

fs.mkdirSync(RAW, { recursive: true })

const iphone = devices['iPhone 13']

/** @type {{ id: string, label: string, setup: (page: import('playwright').Page) => Promise<void> }[]} */
const shots = [
  {
    id: '01-empty-attention-ready',
    label: '01 空态 · Attention Ready',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=0&kenosDemo=1&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '0')
        localStorage.setItem('kenos_phase2_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.attention-brief, .hero, .composer, textarea', {
        timeout: 15000,
      })
      await page.waitForTimeout(800)
    },
  },
  {
    id: '02-locked-unavailable',
    label: '02 锁定 · 需连接账户',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=0&kenosDemo=0&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '0')
        localStorage.setItem('kenos_phase2_demo', '0')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.attention-brief, .hero, .composer, textarea', {
        timeout: 15000,
      })
      await page.waitForTimeout(800)
    },
  },
  {
    id: '03-syncing',
    label: '03 同步中 · Syncing',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=0&kenosDemo=1&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '0')
        localStorage.setItem('kenos_phase2_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      // Force syncing presentation on live CONTROL + session resolution path
      await page.evaluate(async () => {
        const mod = await import('/src/lib/kenos/controlCenter.svelte.js')
        const { CONTROL } = mod
        CONTROL.loading = true
        CONTROL.sources = {
          ...(CONTROL.sources || {}),
          today: { status: 'loading', source: 'demo' },
          inbox: { status: 'loading', source: 'demo' },
        }
      })
      await page.waitForTimeout(600)
    },
  },
  {
    id: '04-chat-debug',
    label: '04 对话 · 多轮调试',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=1&kenosDemo=1&chat=demo-chat-debug&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.setItem('kenos_phase2_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('[data-role], .message, .thread', {
        timeout: 15000,
      })
      await page.waitForTimeout(700)
    },
  },
  {
    id: '05-scope-work',
    label: '05 Scope · Work',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=1&kenosDemo=1&chat=demo-chat-sales&scope=work&entity=Kenos%20IA&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.setItem('kenos_phase2_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector(
        '[data-testid="assistant-scope-chip"], .scope-chip',
        { timeout: 15000 },
      )
      await page.waitForTimeout(700)
    },
  },
  {
    id: '06-tools-search',
    label: '06 工具 · 联网检索',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=1&chat=demo-chat-runes&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.tool, .tools, details.tool', {
        timeout: 15000,
      })
      // Expand first tool row
      const tool = page.locator('details.tool').first()
      if (await tool.count()) {
        await tool.locator('summary').click({ force: true }).catch(() => {})
      }
      await page.waitForTimeout(700)
    },
  },
  {
    id: '07-followups',
    label: '07 追问建议 · Follow-ups',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=1&chat=demo-chat-debug&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.follow-ups, .follow-chip', {
        timeout: 15000,
      })
      // Scroll follow-ups into view
      await page
        .locator('.follow-ups, .follow-chip')
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {})
      await page.waitForTimeout(700)
    },
  },
  {
    id: '08-image-tool',
    label: '08 工具 · 本地生图',
    async setup(page) {
      await page.goto(
        `${BASE}/assistant?demo=1&chat=demo-chat-image&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.tool, img, .tools', { timeout: 15000 })
      await page.waitForTimeout(800)
    },
  },
  {
    id: '09-artifact-clock',
    label: '09 Artifacts · 侧栏预览',
    async setup(page) {
      // Desktop viewport for side panel
      await page.setViewportSize({ width: 1180, height: 820 })
      await page.goto(
        `${BASE}/assistant?demo=1&chat=demo-chat-clock&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('pre, .message, .thread', { timeout: 15000 })
      // Try open artifact via preview button or code block action
      const previewBtn = page
        .locator(
          'button:has-text("预览"), button[title*="预览"], button[aria-label*="预览"], button:has-text("Preview")',
        )
        .first()
      if (await previewBtn.count()) {
        await previewBtn.click({ force: true }).catch(() => {})
      } else {
        // Programmatically open artifact from the clock HTML block
        await page.evaluate(async () => {
          const { openArtifact } = await import('/src/lib/panel.svelte.js')
          const { C } = await import('/src/lib/chat.svelte.js')
          const conv = C.conversations.find((c) => c.id === 'demo-chat-clock')
          const msg = conv?.messages?.find((m) => m.role === 'assistant')
          const m = msg?.content?.match(/```html\s*\n([\s\S]*?)```/)
          if (m?.[1]) {
            openArtifact({
              lang: 'html',
              code: m[1],
              title: conv.title || '时钟',
            })
          }
        })
      }
      await page.waitForTimeout(1000)
    },
  },
  {
    id: '10-model-picker',
    label: '10 模型切换 · ModelPicker',
    async setup(page) {
      await page.setViewportSize(iphone.viewport)
      await page.goto(
        `${BASE}/assistant?demo=1&chat=demo-chat-email&t=${Date.now()}`,
        { waitUntil: 'networkidle' },
      )
      await page.evaluate(() => {
        localStorage.setItem('aios_demo', '1')
        localStorage.removeItem('aios_chats_v1')
        sessionStorage.removeItem('aios_active_chat_v1')
      })
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      // Open model picker
      const picker = page
        .locator(
          '[data-testid="model-picker"], button:has-text("模型"), .model-picker button, button.model-btn, .chat-top-right button',
        )
        .first()
      if (await picker.count()) {
        await picker.click({ force: true }).catch(() => {})
      }
      // Fallback: click any visible model control in top bar
      const topBtns = page.locator('.chat-top-right button, .chat-top button')
      const n = await topBtns.count()
      for (let i = 0; i < Math.min(n, 4); i++) {
        const t = await topBtns.nth(i).innerText().catch(() => '')
        if (/模型|Model|本地|云端|Kimi|35B|4B|llm/i.test(t) || t.length < 12) {
          await topBtns.nth(i).click({ force: true }).catch(() => {})
          break
        }
      }
      await page.waitForTimeout(700)
    },
  },
]

async function main() {
  const browser = await chromium.launch({ headless: true })
  const paths = []

  for (const shot of shots) {
    const context = await browser.newContext({
      ...iphone,
      locale: 'zh-CN',
      colorScheme: 'dark',
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    try {
      await shot.setup(page)
      const file = path.join(RAW, `${shot.id}.png`)
      await page.screenshot({ path: file, fullPage: false })
      paths.push({ file, label: shot.label, id: shot.id })
      console.log('ok', shot.id)
    } catch (err) {
      console.error('FAIL', shot.id, err?.message || err)
      const file = path.join(RAW, `${shot.id}-FAIL.png`)
      await page.screenshot({ path: file, fullPage: false }).catch(() => {})
      paths.push({ file, label: shot.label + ' (FAIL)', id: shot.id })
    }
    await context.close()
  }

  await browser.close()

  // Composite with sharp if available, else pure canvas via playwright page
  await composite(paths)
}

async function composite(items) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 2200, height: 1240 },
    deviceScaleFactor: 2,
  })

  const cards = items
    .map((it, i) => {
      const b64 = fs.readFileSync(it.file).toString('base64')
      return `
      <figure>
        <div class="frame"><img src="data:image/png;base64,${b64}" alt="${it.label}" /></div>
        <figcaption><span class="n">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(it.label.replace(/^\d+\s*/, ''))}</figcaption>
      </figure>`
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; background: #1a1b1e; color: #f2f2f0; font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; }
  .board { width: 2200px; height: 1240px; box-sizing: border-box; padding: 28px 32px 24px; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  h1 { margin: 0; font-size: 28px; font-weight: 650; letter-spacing: 0.01em; }
  .meta { font-size: 13px; opacity: 0.55; }
  .grid { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: 1fr 1fr; gap: 14px 12px; min-height: 0; }
  figure { margin: 0; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .frame { flex: 1; min-height: 0; border-radius: 18px; overflow: hidden; background: #0e0f12; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 28px rgba(0,0,0,0.35); }
  .frame img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  figcaption { font-size: 12px; opacity: 0.78; display: flex; gap: 8px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { font-variant-numeric: tabular-nums; font-weight: 700; opacity: 0.9; color: #9ad7c0; }
  footer { font-size: 11px; opacity: 0.4; }
</style>
</head>
<body>
  <div class="board">
    <header>
      <h1>Kenos 助手 /assistant — 真实页面 10合1 审核板</h1>
      <div class="meta">localhost:5197 · Playwright 实截 · 2026-07-21</div>
    </header>
    <div class="grid">${cards}</div>
    <footer>来源：aios 本地真实 DOM（demo / kenosDemo / scope / chat 查询参数）。非 AI 示意稿。</footer>
  </div>
</body>
</html>`

  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const outFile = path.join(OUT, 'kenos-assistant-10in1-REAL.png')
  await page.screenshot({ path: outFile, fullPage: false })
  console.log('BOARD', outFile)
  await browser.close()
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
