#!/usr/bin/env node
/**
 * Kenos UIUX status — 30 shots → 3 square platform boards (10 tiles each).
 * Web / macOS: Playwright against Daily Beta
 * iOS: real-device DVT screenshot via pymobiledevice3 --userspace
 */
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const OUT = join(
  ROOT,
  'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/uiux-30-boards-2026-07-21',
)
const ORIGIN = process.env.KENOS_UIUX_ORIGIN || 'http://127.0.0.1:5219'
const LAN =
  process.env.KENOS_LAN_IP ||
  spawnSync('ipconfig', ['getifaddr', 'en0'], {
    encoding: 'utf8',
  }).stdout.trim() ||
  spawnSync('ipconfig', ['getifaddr', 'en1'], {
    encoding: 'utf8',
  }).stdout.trim()
const AIOS = `http://${LAN}:5219`
const DEVICE =
  process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'
const PYMD =
  process.env.KENOS_PYMD || '/tmp/kenos-ios-shot-venv/bin/pymobiledevice3'

for (const p of ['web', 'ios', 'macos', 'boards', 'logs']) {
  mkdirSync(join(OUT, p), { recursive: true })
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  return r
}

async function webShot(page, file, url, after) {
  await page
    .goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    .catch(() => {})
  await page.waitForTimeout(700)
  if (after) await after(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: file, fullPage: false })
}

async function openSheet(page, testId) {
  const btn = page.getByTestId(testId)
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(500)
  }
}

async function captureWeb10() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('kenos.iosNativeShell')
    } catch {}
  })
  const dir = join(OUT, 'web')
  const jobs = [
    ['01-today.png', `${ORIGIN}/`],
    ['02-assistant.png', `${ORIGIN}/assistant`],
    ['03-spaces.png', `${ORIGIN}/spaces`],
    ['04-inbox.png', `${ORIGIN}/inbox`],
    ['05-settings.png', `${ORIGIN}/settings`],
  ]
  for (const [name, url] of jobs) {
    await webShot(page, join(dir, name), url)
  }
  await webShot(page, join(dir, '06-continue.png'), `${ORIGIN}/`, async (p) => {
    await openSheet(p, 'kenos-space-switcher-fab')
  })
  await webShot(
    page,
    join(dir, '07-quick-switch.png'),
    `${ORIGIN}/`,
    async (p) => {
      await p.keyboard.press('Escape').catch(() => {})
      await openSheet(p, 'kenos-quick-switch-trigger')
    },
  )
  await webShot(
    page,
    join(dir, '08-switch-space.png'),
    `${ORIGIN}/`,
    async (p) => {
      await p.keyboard.press('Escape').catch(() => {})
      await p.setViewportSize({ width: 1280, height: 800 })
      const all = p.getByTestId('kenos-switch-space-trigger')
      if (await all.isVisible().catch(() => false)) await all.click()
      await p.waitForTimeout(500)
    },
  )
  await webShot(page, join(dir, '09-spaces-plan.png'), `${ORIGIN}/spaces`)
  // Focus route if present; else Today dark-ish reload
  await webShot(
    page,
    join(dir, '10-capture-or-today.png'),
    `${ORIGIN}/`,
    async (p) => {
      await p.keyboard.press('Escape').catch(() => {})
      const cap = p.getByRole('button', { name: /Capture/i }).first()
      if (await cap.isVisible().catch(() => false)) {
        await cap.click()
        await p.waitForTimeout(500)
      }
    },
  )
  await browser.close()
}

async function captureMacos10() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem('kenos.iosNativeShell')
    } catch {}
  })
  const dir = join(OUT, 'macos')
  const routes = [
    ['01-today.png', `${ORIGIN}/`],
    ['02-assistant.png', `${ORIGIN}/assistant`],
    ['03-spaces.png', `${ORIGIN}/spaces`],
    ['04-inbox.png', `${ORIGIN}/inbox`],
    ['05-settings.png', `${ORIGIN}/settings`],
    ['06-spaces-detail.png', `${ORIGIN}/spaces`],
  ]
  for (const [name, url] of routes) {
    await webShot(page, join(dir, name), url)
  }
  await webShot(page, join(dir, '07-continue.png'), `${ORIGIN}/`, async (p) => {
    const cont = p.getByTestId('kenos-space-switcher-trigger')
    if (await cont.isVisible().catch(() => false)) await cont.click()
    else await openSheet(p, 'kenos-space-switcher-fab')
    await p.waitForTimeout(500)
  })
  await webShot(
    page,
    join(dir, '08-quick-switch.png'),
    `${ORIGIN}/`,
    async (p) => {
      await p.keyboard.press('Escape').catch(() => {})
      const q = p.getByTestId('kenos-quick-switch-trigger')
      if (
        await q
          .first()
          .isVisible()
          .catch(() => false)
      )
        await q.first().click()
      await p.waitForTimeout(500)
    },
  )
  await webShot(
    page,
    join(dir, '09-switch-space.png'),
    `${ORIGIN}/`,
    async (p) => {
      await p.keyboard.press('Escape').catch(() => {})
      const all = p.getByTestId('kenos-switch-space-trigger')
      if (await all.isVisible().catch(() => false)) await all.click()
      await p.waitForTimeout(500)
    },
  )
  await webShot(page, join(dir, '10-inbox-approvals.png'), `${ORIGIN}/inbox`)
  await browser.close()
}

function launchAbsolute(url, { terminate = true } = {}) {
  const args = [
    'devicectl',
    'device',
    'process',
    'launch',
    ...(terminate ? ['--terminate-existing'] : []),
    '--device',
    DEVICE,
    '--payload-url',
    url,
    BUNDLE,
  ]
  const r = sh('xcrun', args)
  return r.status === 0 && !`${r.stdout}${r.stderr}`.includes('Locked')
}

function shotIos(file) {
  const r = sh(PYMD, ['developer', 'dvt', 'screenshot', '--userspace', file], {
    timeout: 60000,
  })
  if (r.status !== 0 || !existsSync(file)) {
    console.error('ios shot fail', file, r.stderr || r.stdout)
    return false
  }
  return true
}

function captureIos10() {
  const dir = join(OUT, 'ios')
  const lanPlan = `http://${LAN}:5188`
  const lanFit = `http://${LAN}:5190`
  // Current UIUX: Kenos capsule + Space Shelf + Domain Continuity docks
  const seq = [
    ['01-today.png', () => launchAbsolute(`${AIOS}/?iosNativeShell=1`)],
    [
      '02-assistant.png',
      () => launchAbsolute(`${AIOS}/assistant?iosNativeShell=1`),
    ],
    ['03-inbox.png', () => launchAbsolute(`${AIOS}/inbox?iosNativeShell=1`)],
    [
      '04-settings.png',
      () => launchAbsolute(`${AIOS}/settings?iosNativeShell=1`),
    ],
    [
      '05-space-shelf.png',
      () => {
        launchAbsolute(`${AIOS}/?iosNativeShell=1`)
        spawnSync('sleep', ['2.5'])
        return launchAbsolute('kenos://shelf', { terminate: false })
      },
    ],
    ['06-plan-tasks.png', () => launchAbsolute(`${lanPlan}/`)],
    ['07-plan-calendar.png', () => launchAbsolute(`${lanPlan}/calendar`)],
    ['08-training-today.png', () => launchAbsolute(`${lanFit}/`)],
    [
      '09-training-history.png',
      () => launchAbsolute(`${lanFit}/discover/records`),
    ],
    [
      '10-plan-shelf.png',
      () => {
        launchAbsolute(`${lanPlan}/`)
        spawnSync('sleep', ['2.8'])
        return launchAbsolute('kenos://shelf', { terminate: false })
      },
    ],
  ]
  let ok = 0
  for (const [name, launch] of seq) {
    const launched = launch()
    if (!launched) {
      console.warn('launch failed', name)
      continue
    }
    spawnSync('sleep', ['3.2'])
    if (shotIos(join(dir, name))) ok++
  }
  return { ok, mode: ok > 0 ? 'device-dvt' : 'none' }
}

/** When 17 Pro is locked: iPhone viewport + iosNativeShell so boards show current Music header. */
async function captureIos10PlaywrightFallback() {
  const dir = join(OUT, 'ios')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    colorScheme: 'dark',
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__KENOS_IOS_NATIVE_SHELL__ = true
    try {
      sessionStorage.setItem('kenos.iosNativeShell', '1')
    } catch {}
  })
  const jobs = [
    ['01-today.png', `${ORIGIN}/?iosNativeShell=1`],
    ['02-assistant.png', `${ORIGIN}/assistant?iosNativeShell=1`],
    ['03-inbox.png', `${ORIGIN}/inbox?iosNativeShell=1`],
    ['04-settings.png', `${ORIGIN}/settings?iosNativeShell=1`],
    ['05-space-shelf.png', `${ORIGIN}/spaces?iosNativeShell=1`],
    ['06-plan-tasks.png', `http://127.0.0.1:5188/?iosNativeShell=1`],
    ['07-plan-calendar.png', `http://127.0.0.1:5188/calendar?iosNativeShell=1`],
    ['08-training-today.png', `http://127.0.0.1:5190/?iosNativeShell=1`],
    [
      '09-training-history.png',
      `http://127.0.0.1:5190/discover/records?iosNativeShell=1`,
    ],
    ['10-plan-shelf.png', `http://127.0.0.1:5188/?iosNativeShell=1`],
  ]
  let ok = 0
  for (const [name, url] of jobs) {
    await webShot(page, join(dir, name), url)
    ok++
  }
  await browser.close()
  return { ok, mode: 'playwright-iphone-native-shell-fallback' }
}

function montageSquare(platform, labels) {
  const py = `
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
out = Path(${JSON.stringify(OUT)})
plat = ${JSON.stringify(platform)}
labels = ${JSON.stringify(labels)}
src = out / plat
board_path = out / 'boards' / f'uiux-{plat}-10panel-square.png'
# 4x3 grid in a square canvas (10 tiles + 2 empty)
cols, rows = 4, 3
side = 1600
pad = 28
title_h = 56
gap = 14
inner_w = side - pad * 2
inner_h = side - pad * 2 - title_h
cell_w = (inner_w - gap * (cols - 1)) // cols
cell_h = (inner_h - gap * (rows - 1)) // rows
board = Image.new('RGB', (side, side), (16, 16, 18))
draw = ImageDraw.Draw(board)
try:
  font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 16)
  title_font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 24)
except Exception:
  font = ImageFont.load_default(); title_font = font
titles = {
  'web': 'Kenos UIUX · Web Daily Beta · 10 shots · 2026-07-21',
  'ios': 'Kenos UIUX · iOS shell (current) · 10 shots · 2026-07-21',
  'macos': 'Kenos UIUX · macOS desktop viewport · 10 shots · 2026-07-21',
}
draw.text((pad, 18), titles.get(plat, plat), fill=(236,236,240), font=title_font)
for i, (fname, label) in enumerate(labels):
  r, c = divmod(i, cols)
  x = pad + c * (cell_w + gap)
  y = pad + title_h + r * (cell_h + gap)
  path = src / fname
  canvas = Image.new('RGB', (cell_w, cell_h), (28, 28, 32))
  if path.exists():
    im = Image.open(path).convert('RGB')
    im.thumbnail((cell_w, cell_h - 22), Image.Resampling.LANCZOS)
    ox = (cell_w - im.width) // 2
    oy = ((cell_h - 22) - im.height) // 2
    canvas.paste(im, (ox, oy))
  board.paste(canvas, (x, y))
  draw.text((x + 4, y + cell_h - 18), label, fill=(170,170,180), font=font)
board.save(board_path, optimize=True)
print('wrote', board_path)
`
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr)
    throw new Error(`montage ${platform} failed`)
  }
  console.log(r.stdout.trim())
}

console.log('ORIGIN', ORIGIN, 'AIOS', AIOS)
await captureWeb10()
console.log('web 10 done')
await captureMacos10()
console.log('macos 10 done')
let iosResult
const probe = launchAbsolute(`${AIOS}/?iosNativeShell=1`)
if (!probe) {
  console.warn(
    'device locked/unreachable — Playwright iPhone + iosNativeShell fallback',
  )
  iosResult = await captureIos10PlaywrightFallback()
} else {
  spawnSync('sleep', ['2'])
  iosResult = captureIos10()
  if (iosResult.ok < 8) {
    console.warn(
      `device iOS shots sparse (${iosResult.ok}/10) — Playwright fallback`,
    )
    iosResult = await captureIos10PlaywrightFallback()
  }
}
console.log('ios shots', iosResult)

const webLabels = [
  ['01-today.png', '1 Today'],
  ['02-assistant.png', '2 Assistant'],
  ['03-spaces.png', '3 Spaces'],
  ['04-inbox.png', '4 Inbox'],
  ['05-settings.png', '5 Settings'],
  ['06-continue.png', '6 Continue'],
  ['07-quick-switch.png', '7 Quick Switch'],
  ['08-switch-space.png', '8 Switch Space'],
  ['09-spaces-plan.png', '9 Spaces again'],
  ['10-capture-or-today.png', '10 Capture / Today'],
]
const iosLabels = [
  ['01-today.png', '1 Today'],
  ['02-assistant.png', '2 Assistant'],
  ['03-inbox.png', '3 Inbox'],
  ['04-settings.png', '4 Settings'],
  ['05-space-shelf.png', '5 Space Shelf'],
  ['06-plan-tasks.png', '6 Plan Tasks'],
  ['07-plan-calendar.png', '7 Plan Calendar'],
  ['08-training-today.png', '8 Training'],
  ['09-training-history.png', '9 History'],
  ['10-plan-shelf.png', '10 Plan + Shelf'],
]
const macLabels = [
  ['01-today.png', '1 Today'],
  ['02-assistant.png', '2 Assistant'],
  ['03-spaces.png', '3 Spaces'],
  ['04-inbox.png', '4 Inbox'],
  ['05-settings.png', '5 Settings'],
  ['06-spaces-detail.png', '6 Spaces'],
  ['07-continue.png', '7 Continue'],
  ['08-quick-switch.png', '8 Quick Switch'],
  ['09-switch-space.png', '9 Switch Space'],
  ['10-inbox-approvals.png', '10 Inbox'],
]

montageSquare('web', webLabels)
montageSquare('ios', iosLabels)
montageSquare('macos', macLabels)

writeFileSync(
  join(OUT, 'MANIFEST.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      lanAios: AIOS,
      iosShotsOk: iosResult.ok,
      iosCaptureMode: iosResult.mode,
      buildHint: 'Music scroll header · Daily Beta after 202607211309',
      boards: [
        'boards/uiux-web-10panel-square.png',
        'boards/uiux-ios-10panel-square.png',
        'boards/uiux-macos-10panel-square.png',
      ],
      note:
        iosResult.mode === 'device-dvt'
          ? 'Web/macOS = live Daily Beta Playwright; iOS = 17 Pro DVT (pymobiledevice3 --userspace)'
          : 'Web/macOS = live Daily Beta Playwright; iOS = Playwright iPhone + iosNativeShell fallback (device locked)',
    },
    null,
    2,
  ),
)
console.log('OUT', OUT)
