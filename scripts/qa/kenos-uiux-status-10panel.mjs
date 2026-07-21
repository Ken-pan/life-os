#!/usr/bin/env node
/**
 * Capture current Kenos UIUX for status board:
 * - fresh Mac Web Daily Beta shots (Playwright)
 * - reuse latest iOS native evidence shots
 * - reuse / capture macOS desktop viewport shots
 * Outputs:
 *   - uiux-current-10panel.png  (10 tiles)
 *   - platform-web.png / platform-ios.png / platform-macos.png
 */
import { chromium } from 'playwright'
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const OUT = join(
  ROOT,
  'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/uiux-status-2026-07-21',
)
const IOS_EV = join(
  ROOT,
  'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots',
)
const BOARDS = join(
  ROOT,
  'docs/qa/evidence/kenos-uiux-review-boards-2026-07-20',
)
const ORIGIN = process.env.KENOS_UIUX_ORIGIN || 'http://127.0.0.1:5219'

mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'singles'), { recursive: true })

async function shot(page, path, url) {
  await page
    .goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    .catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path, fullPage: false })
}

async function captureWeb() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const routes = [
    ['web-today.png', `${ORIGIN}/`],
    ['web-spaces.png', `${ORIGIN}/spaces`],
    ['web-inbox.png', `${ORIGIN}/inbox`],
    ['web-assistant.png', `${ORIGIN}/assistant`],
  ]
  for (const [name, url] of routes) {
    await shot(page, join(OUT, 'singles', name), url)
  }
  await browser.close()
}

async function captureMacosViewport() {
  // Desktop chrome viewport representing macOS web surface (same Daily Beta origin)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await shot(page, join(OUT, 'singles', 'macos-today.png'), `${ORIGIN}/`)
  await shot(page, join(OUT, 'singles', 'macos-spaces.png'), `${ORIGIN}/spaces`)
  await browser.close()
}

function copyIos() {
  const map = [
    ['ios-today.png', '52-native-today-final.png'],
    ['ios-spaces.png', '52-native-spaces.png'],
    ['ios-inbox.png', '52-native-inbox.png'],
    ['ios-assistant.png', '52-native-assistant.png'],
  ]
  for (const [dest, src] of map) {
    const from = join(IOS_EV, src)
    if (!existsSync(from)) throw new Error(`missing iOS shot: ${src}`)
    copyFileSync(from, join(OUT, 'singles', dest))
  }
}

function montage() {
  // Prefer Python PIL montage for labels
  const py = `
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
out = Path(${JSON.stringify(OUT)})
singles = out / 'singles'
tiles = [
  ('web-today.png', 'Web · Today'),
  ('web-spaces.png', 'Web · Spaces'),
  ('web-inbox.png', 'Web · Inbox'),
  ('web-assistant.png', 'Web · Assistant'),
  ('ios-today.png', 'iOS · Today'),
  ('ios-spaces.png', 'iOS · Spaces'),
  ('ios-inbox.png', 'iOS · Inbox'),
  ('ios-assistant.png', 'iOS · Assistant'),
  ('macos-today.png', 'macOS · Today'),
  ('macos-spaces.png', 'macOS · Spaces'),
]
cols, rows = 5, 2
cell_w, cell_h = 420, 320
pad, label_h, gap = 24, 36, 16
W = pad*2 + cols*cell_w + (cols-1)*gap
H = pad*2 + rows*(cell_h+label_h) + (rows-1)*gap + 52
board = Image.new('RGB', (W, H), (18, 18, 20))
draw = ImageDraw.Draw(board)
try:
  font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 18)
  title_font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 22)
except Exception:
  font = ImageFont.load_default()
  title_font = font
draw.text((pad, 16), 'Kenos UIUX — current Daily Beta · 10 shots · Web / iOS / macOS', fill=(235,235,240), font=title_font)
for i, (name, label) in enumerate(tiles):
  r, c = divmod(i, cols)
  x = pad + c*(cell_w+gap)
  y = 52 + pad + r*(cell_h+label_h+gap)
  im = Image.open(singles/name).convert('RGB')
  im.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
  canvas = Image.new('RGB', (cell_w, cell_h), (28,28,32))
  ox = (cell_w - im.width)//2
  oy = (cell_h - im.height)//2
  canvas.paste(im, (ox, oy))
  board.paste(canvas, (x, y))
  draw.text((x, y+cell_h+6), label, fill=(180,180,190), font=font)
board.save(out/'uiux-current-10panel.png', optimize=True)
# Three platform heroes
for plat, src in [('platform-web.png','web-today.png'),('platform-ios.png','ios-today.png'),('platform-macos.png','macos-today.png')]:
  Image.open(singles/src).convert('RGB').save(out/plat, optimize=True)
print('wrote', out/'uiux-current-10panel.png')
`
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr)
    process.exit(r.status || 1)
  }
  console.log(r.stdout.trim())
}

const manifest = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  aggregate: 'uiux-current-10panel.png',
  platforms: ['platform-web.png', 'platform-ios.png', 'platform-macos.png'],
  note: 'iOS tiles from 17 Pro native-shell evidence (52-*); Web/macOS from live Daily Beta :5219',
}

await captureWeb()
await captureMacosViewport()
copyIos()
montage()
writeFileSync(join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))
console.log('OUT', OUT)
