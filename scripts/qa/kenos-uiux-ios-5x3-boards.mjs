#!/usr/bin/env node
/**
 * Kenos UIUX — 3 iOS boards × 5 panels each (real-device DVT).
 *
 *   A) Space Shelf experience
 *   B) Cross-app large titles (Plan / Training / …)
 *   C) Kenos main surfaces (Today / Ask / Inbox / Settings / Spaces)
 *
 * Usage:
 *   node scripts/qa/kenos-uiux-ios-5x3-boards.mjs
 */
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = join(
  ROOT,
  `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/uiux-ios-5x3-${STAMP}`,
)
const LATEST = join(
  ROOT,
  'docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/uiux-ios-5x3-latest',
)
const LAN =
  process.env.KENOS_LAN_IP ||
  spawnSync('ipconfig', ['getifaddr', 'en0'], { encoding: 'utf8' }).stdout.trim() ||
  spawnSync('ipconfig', ['getifaddr', 'en1'], { encoding: 'utf8' }).stdout.trim()
const AIOS = `http://${LAN}:5219`
const PLAN = `http://${LAN}:5188`
const FIT = `http://${LAN}:5190`
const MUSIC = `http://${LAN}:5189`
const DEVICE =
  process.env.KENOS_IOS_DEVICE || '8097F071-CAB6-5AF0-8258-BCD985E9D79E'
const BUNDLE = 'space.kenos.app.ios'
const PYMD =
  process.env.KENOS_PYMD || '/tmp/kenos-ios-shot-venv/bin/pymobiledevice3'

for (const p of ['shelf', 'titles', 'kenos', 'boards', 'logs']) {
  mkdirSync(join(OUT, p), { recursive: true })
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts })
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
  const out = `${r.stdout || ''}${r.stderr || ''}`
  if (r.status !== 0 || out.includes('Locked')) {
    console.warn('launch fail', url, out.slice(0, 240))
    return false
  }
  return true
}

function shotIos(file) {
  const r = sh(PYMD, ['developer', 'dvt', 'screenshot', '--userspace', file], {
    timeout: 60000,
  })
  if (r.status !== 0 || !existsSync(file)) {
    console.error('shot fail', file, (r.stderr || r.stdout || '').slice(0, 300))
    return false
  }
  return true
}

function sleep(sec) {
  spawnSync('sleep', [String(sec)])
}

/** Open shelf after settling on a surface. */
function openShelfFrom(url, settle = 2.8) {
  if (!launchAbsolute(url)) return false
  sleep(settle)
  return launchAbsolute('kenos://shelf', { terminate: false })
}

const BOARDS = {
  shelf: {
    title: 'iOS · Space Shelf experience · 5 shots',
    dir: 'shelf',
    shots: [
      [
        '01-shelf-from-today.png',
        '1 Kenos → Shelf',
        () => openShelfFrom(`${AIOS}/?iosNativeShell=1`),
      ],
      [
        '02-shelf-from-plan.png',
        '2 Plan → Shelf',
        () => openShelfFrom(`${PLAN}/?iosNativeShell=1`, 3.0),
      ],
      [
        '03-shelf-from-training.png',
        '3 Training → Shelf',
        () => openShelfFrom(`${FIT}/?iosNativeShell=1`, 3.0),
      ],
      [
        '04-shelf-from-music.png',
        '4 Music → Shelf',
        () => openShelfFrom(`${MUSIC}/?iosNativeShell=1`, 3.0),
      ],
      [
        '05-shelf-after-pick.png',
        '5 Shelf → Training',
        () => {
          if (!openShelfFrom(`${AIOS}/?iosNativeShell=1`, 2.6)) return false
          sleep(1.2)
          // Enter Training Continuity from deep link (post-shelf destination).
          return launchAbsolute('kenos://domain/training', { terminate: false })
        },
      ],
    ],
  },
  titles: {
    title: 'iOS · Cross-app titles · 5 shots',
    dir: 'titles',
    shots: [
      [
        '01-plan-tasks.png',
        '1 Plan · Tasks',
        () => launchAbsolute(`${PLAN}/?iosNativeShell=1`),
      ],
      [
        '02-plan-calendar.png',
        '2 Plan · Calendar',
        () => launchAbsolute(`${PLAN}/calendar?iosNativeShell=1`),
      ],
      [
        '03-training-today.png',
        '3 Training · Today',
        () => {
          // Domain deep link is more reliable than raw Continuity URL after shelf churn.
          if (launchAbsolute('kenos://domain/training')) {
            sleep(1.4)
            return launchAbsolute(`${FIT}/?iosNativeShell=1`, { terminate: false })
          }
          return launchAbsolute(`${FIT}/?iosNativeShell=1`)
        },
      ],
      [
        '04-training-program.png',
        '4 Training · Program',
        () => launchAbsolute(`${FIT}/program?iosNativeShell=1`),
      ],
      [
        '05-training-explore.png',
        '5 Training · Explore',
        () => launchAbsolute(`${FIT}/discover?iosNativeShell=1`),
      ],
    ],
  },
  kenos: {
    title: 'iOS · Kenos main surfaces · 5 shots',
    dir: 'kenos',
    shots: [
      [
        '01-today.png',
        '1 Today',
        () => launchAbsolute(`${AIOS}/?iosNativeShell=1`),
      ],
      [
        '02-assistant.png',
        '2 Ask',
        () => launchAbsolute(`${AIOS}/assistant?iosNativeShell=1`),
      ],
      [
        '03-inbox.png',
        '3 Inbox',
        () => launchAbsolute(`${AIOS}/inbox?iosNativeShell=1`),
      ],
      [
        '04-settings.png',
        '4 Settings',
        () => launchAbsolute('kenos://settings'),
      ],
      [
        '05-spaces-or-shelf.png',
        '5 Spaces / Shelf',
        () => openShelfFrom(`${AIOS}/?iosNativeShell=1`, 2.6),
      ],
    ],
  },
}

function captureBoard(key) {
  const board = BOARDS[key]
  const dir = join(OUT, board.dir)
  let ok = 0
  const results = []
  for (const [name, label, launch] of board.shots) {
    console.log(`[${key}] ${label}`)
    const launched = launch()
    if (!launched) {
      results.push({ name, label, ok: false, reason: 'launch' })
      continue
    }
    sleep(3.2)
    const file = join(dir, name)
    const shotOk = shotIos(file)
    if (shotOk) ok++
    results.push({ name, label, ok: shotOk })
  }
  return { ok, total: board.shots.length, results }
}

function montageFive(boardKey) {
  const board = BOARDS[boardKey]
  const py = `
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
out = Path(${JSON.stringify(OUT)})
key = ${JSON.stringify(boardKey)}
title = ${JSON.stringify(board.title)}
labels = ${JSON.stringify(board.shots.map(([f, l]) => [f, l]))}
src = out / ${JSON.stringify(board.dir)}
board_path = out / 'boards' / f'uiux-ios-5panel-{key}.png'
# Phone screenshots are tall — 5-up in one wide strip, then pad to near-square.
cols, rows = 5, 1
pad = 24
title_h = 52
gap = 12
# Target readable phone tiles
cell_w = 280
cell_h = 560
side_w = pad * 2 + cols * cell_w + gap * (cols - 1)
side_h = pad * 2 + title_h + cell_h
board = Image.new('RGB', (side_w, side_h), (16, 16, 18))
draw = ImageDraw.Draw(board)
try:
  font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 14)
  title_font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 22)
except Exception:
  font = ImageFont.load_default(); title_font = font
draw.text((pad, 16), title, fill=(236, 236, 240), font=title_font)
for i, (fname, label) in enumerate(labels):
  x = pad + i * (cell_w + gap)
  y = pad + title_h
  path = src / fname
  canvas = Image.new('RGB', (cell_w, cell_h), (28, 28, 32))
  if path.exists():
    im = Image.open(path).convert('RGB')
    # Cover-fit phone frame
    scale = max(cell_w / im.width, cell_h / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - cell_w) // 2
    top = (nh - cell_h) // 2
    im = im.crop((left, top, left + cell_w, top + cell_h))
    canvas.paste(im, (0, 0))
  else:
    draw2 = ImageDraw.Draw(canvas)
    draw2.text((16, cell_h // 2 - 8), 'missing', fill=(120, 120, 128), font=font)
  board.paste(canvas, (x, y))
  # label strip
  draw.rectangle((x, y + cell_h - 28, x + cell_w, y + cell_h), fill=(0, 0, 0,))
  draw.text((x + 8, y + cell_h - 22), label, fill=(220, 220, 226), font=font)
board_path.parent.mkdir(parents=True, exist_ok=True)
board.save(board_path, optimize=True)
print('wrote', board_path)
`
  const r = sh('python3', ['-c', py])
  if (r.status !== 0) {
    console.error('montage fail', boardKey, r.stderr || r.stdout)
    return null
  }
  return join(OUT, 'boards', `uiux-ios-5panel-${boardKey}.png`)
}

function publishLatest(boardPaths) {
  mkdirSync(join(LATEST, 'boards'), { recursive: true })
  for (const p of boardPaths) {
    if (!p || !existsSync(p)) continue
    copyFileSync(p, join(LATEST, 'boards', p.split('/').pop()))
  }
  copyFileSync(join(OUT, 'MANIFEST.json'), join(LATEST, 'MANIFEST.json'))
}

const summary = {
  generatedAt: new Date().toISOString(),
  device: DEVICE,
  lan: { aios: AIOS, plan: PLAN, fit: FIT, music: MUSIC },
  boards: {},
}

console.log('OUT', OUT)
console.log('LAN', LAN)

for (const key of ['shelf', 'titles', 'kenos']) {
  summary.boards[key] = captureBoard(key)
  const path = montageFive(key)
  summary.boards[key].board = path ? path.replace(ROOT + '/', '') : null
}

writeFileSync(join(OUT, 'MANIFEST.json'), JSON.stringify(summary, null, 2))
publishLatest(
  Object.values(summary.boards)
    .map((b) => (b.board ? join(ROOT, b.board) : null))
    .filter(Boolean),
)

console.log(JSON.stringify(summary, null, 2))
console.log('LATEST', LATEST)
