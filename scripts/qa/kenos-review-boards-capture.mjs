#!/usr/bin/env node
/**
 * Capture 12 core Kenos pages × 3 platforms, merge into 6 review PNGs.
 *
 * Output:
 *   output/uiux/kenos-visual-rescue-2026-07-20/review-boards/
 *     web-01.png  web-02.png
 *     ios-01.png  ios-02.png
 *     macos-01.png macos-02.png
 *
 * Usage:
 *   node scripts/qa/kenos-review-boards-capture.mjs [--port 5291]
 */
import { chromium, devices } from 'playwright'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')

const port = Number(
  process.argv.includes('--port')
    ? process.argv[process.argv.indexOf('--port') + 1]
    : 5291,
)
const base = `http://127.0.0.1:${port}`
const outRoot = join(
  root,
  'output/uiux/kenos-visual-rescue-2026-07-20/review-boards',
)
const singles = join(outRoot, 'singles')

const PAGES = [
  { id: '01-today', path: '/?kenosDemo=1', label: 'Today' },
  { id: '02-spaces', path: '/spaces?kenosDemo=1', label: 'Spaces' },
  {
    id: '03-continue',
    path: '/?kenosDemo=1',
    label: 'Continue',
    openContinue: true,
  },
  { id: '04-plan', path: '/spaces/plan?kenosDemo=1', label: 'Plan' },
  {
    id: '05-training',
    path: '/spaces/training?kenosDemo=1',
    label: 'Training',
  },
  { id: '06-money', path: '/spaces/money?kenosDemo=1', label: 'Money' },
  { id: '07-music', path: '/spaces/music?kenosDemo=1', label: 'Music' },
  { id: '08-home', path: '/spaces/home?kenosDemo=1', label: 'Home' },
  {
    id: '09-knowledge',
    path: '/spaces/knowledge?kenosDemo=1',
    label: 'Knowledge',
  },
  { id: '10-work', path: '/work?kenosDemo=1', label: 'Work' },
  { id: '11-inbox', path: '/inbox?kenosDemo=1', label: 'Inbox' },
  { id: '12-assistant', path: '/assistant?kenosDemo=1', label: 'Assistant' },
]

const PLATFORMS = {
  web: {
    // Standard laptop browser
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    colorScheme: 'dark',
  },
  ios: {
    // iPhone-class viewport (Playwright device)
    ...devices['iPhone 14 Pro'],
    colorScheme: 'dark',
  },
  macos: {
    // macOS desktop window
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    colorScheme: 'dark',
  },
}

async function seed(page) {
  await page.goto(`${base}/?kenosDemo=1`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('aios_demo', '1')
    localStorage.setItem('kenos_phase2_demo', '1')
  })
}

async function prepare(page) {
  await page.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
  })
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.waitForTimeout(350)
}

async function openContinue(page) {
  const mobile = page.locator(
    '[data-testid="kenos-system-bar"] [data-testid="kenos-space-switcher-fab"]',
  )
  const desk = page.locator('[data-testid="kenos-space-switcher-sidebar"]')
  const trigger = page.locator(
    '[data-testid="kenos-space-switcher-trigger"]:visible',
  )
  if (
    (await mobile.count()) > 0 &&
    (await mobile.isVisible().catch(() => false))
  ) {
    await mobile.click({ force: true })
  } else if ((await desk.count()) > 0) {
    await desk.first().click({ force: true })
  } else if ((await trigger.count()) > 0) {
    await trigger.first().click({ force: true })
  } else {
    await page.keyboard.press('Meta+.')
  }
  await page
    .waitForSelector('[data-testid="kenos-space-switcher"]', { timeout: 4000 })
    .catch(() => {})
  await page.waitForTimeout(300)
}

async function capturePlatform(browser, platform) {
  const cfg = PLATFORMS[platform]
  const dir = join(singles, platform)
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({
    ...cfg,
    locale: 'zh-CN',
  })
  const page = await ctx.newPage()
  await seed(page)
  await page.reload({ waitUntil: 'networkidle' })
  await prepare(page)

  for (const spec of PAGES) {
    await page.goto(`${base}${spec.path}`, { waitUntil: 'networkidle' })
    await prepare(page)
    if (spec.openContinue) await openContinue(page)
    const file = join(dir, `${spec.id}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log(`✓ ${platform}/${spec.id}`)
  }
  await ctx.close()
  return dir
}

/** Build contact sheet with Pillow via python */
function buildSheets(platform) {
  const dir = join(singles, platform)
  const files = PAGES.map((p) => join(dir, `${p.id}.png`))
  const labels = PAGES.map((p) => p.label)
  const py = `
from PIL import Image, ImageDraw, ImageFont
import os

files = ${JSON.stringify(files)}
labels = ${JSON.stringify(labels)}
out_dir = ${JSON.stringify(outRoot)}
platform = ${JSON.stringify(platform)}
os.makedirs(out_dir, exist_ok=True)

imgs = [Image.open(f).convert('RGB') for f in files]

def sheet(batch, labels_batch, out_path, title):
    cols, rows = 3, 2
    max_w = max(im.width for im in batch)
    target_w = 480 if max_w > 800 else 360
    cells = []
    for im in batch:
        scale = target_w / im.width
        nh = int(im.height * scale)
        cells.append(im.resize((target_w, nh), Image.Resampling.LANCZOS))
    cell_h = max(c.height for c in cells) + 36
    cell_w = target_w
    pad = 16
    header = 48
    W = cols * cell_w + (cols + 1) * pad
    H = header + rows * cell_h + (rows + 1) * pad
    canvas = Image.new('RGB', (W, H), (18, 18, 20))
    draw = ImageDraw.Draw(canvas)
    font = font_sm = ImageFont.load_default()
    for path in (
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/Library/Fonts/Arial.ttf',
    ):
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, 22)
                font_sm = ImageFont.truetype(path, 15)
                break
            except Exception:
                pass
    draw.text((pad, 14), title, fill=(240, 240, 242), font=font)
    for i, cell in enumerate(cells):
        r, c = divmod(i, cols)
        x = pad + c * (cell_w + pad)
        y = header + pad + r * (cell_h + pad)
        bg = Image.new('RGB', (cell_w, cell_h - 28), (28, 28, 30))
        oy = max(0, ((cell_h - 28) - cell.height) // 2)
        bg.paste(cell, (0, oy))
        canvas.paste(bg, (x, y))
        draw.text((x, y + cell_h - 24), labels_batch[i], fill=(180, 180, 185), font=font_sm)
    canvas.save(out_path, 'PNG', optimize=True)
    print('wrote', out_path, canvas.size)

sheet(imgs[0:6], labels[0:6], os.path.join(out_dir, f'{platform}-01.png'), f'Kenos · {platform.upper()} · 1/2')
sheet(imgs[6:12], labels[6:12], os.path.join(out_dir, f'{platform}-02.png'), f'Kenos · {platform.upper()} · 2/2')
`
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout)
    throw new Error(`montage failed for ${platform}`)
  }
  console.log(r.stdout.trim())
}

async function main() {
  mkdirSync(singles, { recursive: true })
  // health
  const health = await fetch(`${base}/`)
    .then((r) => r.status)
    .catch(() => 0)
  if (health !== 200) {
    console.error(`Preview not up at ${base} (status ${health})`)
    process.exit(1)
  }
  const browser = await chromium.launch({ headless: true })
  for (const platform of ['web', 'ios', 'macos']) {
    await capturePlatform(browser, platform)
    buildSheets(platform)
  }
  await browser.close()
  const boards = readdirSync(outRoot).filter(
    (f) => f.endsWith('.png') && !f.includes('/'),
  )
  writeFileSync(
    join(outRoot, 'README.md'),
    `# Kenos review boards — 2026-07-20\n\n12 core pages × 3 platforms → 6 PNGs.\n\n${boards.map((b) => `- \`${b}\``).join('\n')}\n`,
  )
  console.log('DONE', outRoot)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
