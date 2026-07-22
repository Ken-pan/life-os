/**
 * Capture REAL Kenos iOS Simulator /assistant stages → 10-in-1 board.
 * Cold-start each shot via kenos://shell?path=… so WKWebView hard-loads query
 * (SPA soft-nav keeps chat module state and ignores ?chat=).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const RAW = join(OUT, 'raw-ios')
const BUNDLE = 'space.kenos.app.ios'
const ORIGIN = 'http://127.0.0.1:5197'
/** Prefer the Daily Beta sim we verified has Kenos + working cold deep links */
const UDID =
  process.env.KENOS_SIM_UDID || 'FC61E6C4-7854-4E07-AA79-80306C3FD06F'

mkdirSync(RAW, { recursive: true })

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts })
}

function sleep(ms) {
  spawnSync('sleep', [String(Math.max(0.05, ms / 1000))])
}

function terminate() {
  sh('xcrun', ['simctl', 'terminate', UDID, BUNDLE])
}

function setOrigin() {
  sh('xcrun', [
    'simctl',
    'spawn',
    UDID,
    'defaults',
    'write',
    BUNDLE,
    'kenos.dailyBeta.enabled',
    '-bool',
    'true',
  ])
  sh('xcrun', [
    'simctl',
    'spawn',
    UDID,
    'defaults',
    'write',
    BUNDLE,
    'kenos.dailyBeta.origin',
    ORIGIN,
  ])
}

function clearWebData() {
  const r = sh('xcrun', ['simctl', 'get_app_container', UDID, BUNDLE, 'data'])
  const container = (r.stdout || '').trim()
  if (!container || !existsSync(container)) return
  for (const rel of [
    'Library/WebKit',
    'Library/Caches',
    'Library/HTTPStorages',
    'Library/Cookies',
  ]) {
    sh('rm', ['-rf', join(container, rel)])
  }
}

function dismissOpenPrompt() {
  sh('osascript', [
    '-e',
    `tell application "Simulator" to activate
delay 0.25
tell application "System Events"
  tell process "Simulator"
    repeat 3 times
      if exists (button "Open" of window 1) then
        click button "Open" of window 1
        exit repeat
      end if
      if exists (button "打开" of window 1) then
        click button "打开" of window 1
        exit repeat
      end if
      delay 0.35
    end repeat
  end tell
end tell`,
  ])
}

function coldOpen(pathAndQuery) {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`
  const url = `kenos://shell?path=${encodeURIComponent(path)}`
  console.log('cold', url)
  terminate()
  sleep(350)
  clearWebData()
  sleep(200)
  // Deliver URL while terminated → app cold-starts with shell path (hard load)
  const r = sh('xcrun', ['simctl', 'openurl', UDID, url])
  if (r.status !== 0) console.warn(r.stderr || r.stdout)
  dismissOpenPrompt()
}

function shot(name) {
  const file = join(RAW, name)
  sh('xcrun', ['simctl', 'io', UDID, 'screenshot', file])
  if (!existsSync(file)) throw new Error(`shot missing ${name}`)
  const hash = createHash('md5').update(readFileSync(file)).digest('hex')
  console.log('shot', name, hash.slice(0, 10))
  return { file, hash }
}

const SHOTS = [
  {
    file: '01-locked.png',
    label: '01 锁定 · 需连接账户',
    path: '/assistant?demo=0&kenosDemo=0',
    settle: 5200,
  },
  {
    file: '02-attention-ready.png',
    label: '02 空态 · Attention Ready',
    path: '/assistant?demo=0&kenosDemo=1',
    settle: 5200,
  },
  {
    file: '03-chat-debug.png',
    label: '03 对话 · 多轮调试',
    path: '/assistant?demo=1&chat=demo-chat-debug',
    settle: 5200,
  },
  {
    file: '04-followups.png',
    label: '04 追问建议 · Follow-ups',
    path: '/assistant?demo=1&chat=demo-chat-email',
    settle: 5200,
  },
  {
    file: '05-tools-search.png',
    label: '05 工具 · 联网检索',
    path: '/assistant?demo=1&chat=demo-chat-runes',
    settle: 5500,
  },
  {
    file: '06-image-tool.png',
    label: '06 工具 · 本地生图',
    path: '/assistant?demo=1&chat=demo-chat-image',
    settle: 5500,
  },
  {
    file: '07-artifact-clock.png',
    label: '07 Artifacts · HTML 时钟',
    path: '/assistant?demo=1&chat=demo-chat-clock',
    settle: 5500,
  },
  {
    file: '08-scope-work.png',
    label: '08 Scope · Work',
    path: '/assistant?demo=1&chat=demo-chat-sales&scope=work&entity=Kenos%20IA',
    settle: 5500,
  },
  {
    file: '09-sql-chat.png',
    label: '09 对话 · SQL / 代码',
    path: '/assistant?demo=1&chat=demo-chat-orders',
    settle: 5200,
  },
  {
    file: '10-cap-concept.png',
    label: '10 对话 · 概念讲解',
    path: '/assistant?demo=1&chat=demo-chat-cap',
    settle: 5200,
  },
]

async function montage(items) {
  // Full iPhone frames — contain, never top-crop composer/dock away.
  const cellW = 360
  const cellH = Math.round(cellW * (19.5 / 9))
  const cols = 5
  const rows = 2
  const gap = 16
  const padX = 28
  const padY = 24
  const headerH = 56
  const captionH = 28
  const footerH = 28
  const W = padX * 2 + cols * cellW + (cols - 1) * gap
  const H =
    padY * 2 + headerH + rows * (cellH + captionH) + (rows - 1) * gap + footerH

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  })
  const cards = items
    .map((it, i) => {
      const b64 = readFileSync(it.file).toString('base64')
      const label = it.label.replace(/^\d+\s*/, '')
      return `<figure style="width:${cellW}px">
        <div class="frame" style="width:${cellW}px;height:${cellH}px">
          <img src="data:image/png;base64,${b64}" />
        </div>
        <figcaption><span class="n">${String(i + 1).padStart(2, '0')}</span>${label}</figcaption>
      </figure>`
    })
    .join('\n')

  await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<style>
html,body{margin:0;background:#0f1012;color:#f3f3f1;font-family:-apple-system,"SF Pro Text","PingFang SC",sans-serif}
.board{width:${W}px;height:${H}px;box-sizing:border-box;padding:${padY}px ${padX}px;display:flex;flex-direction:column;gap:12px}
header{height:${headerH - 12}px;display:flex;justify-content:space-between;align-items:baseline}
h1{margin:0;font-size:24px;font-weight:650}
.meta{font-size:12px;opacity:.5}
.grid{display:grid;grid-template-columns:repeat(5,${cellW}px);grid-template-rows:repeat(2,${cellH + captionH}px);gap:${gap}px}
figure{margin:0;display:flex;flex-direction:column;gap:6px}
.frame{border-radius:22px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 30px rgba(0,0,0,.45)}
.frame img{width:100%;height:100%;object-fit:contain;object-position:center center;display:block;background:#000}
figcaption{height:${captionH - 6}px;font-size:12px;opacity:.85;display:flex;gap:8px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n{font-weight:700;color:#8fd6b5;font-variant-numeric:tabular-nums}
footer{font-size:11px;opacity:.4;margin-top:auto}
</style></head><body>
<div class="board">
<header>
  <h1>Kenos iOS App · 助手页真实截图 10合1（完整画面）</h1>
  <div class="meta">Simulator ${UDID.slice(0, 8)}… · ${ORIGIN} · object-fit:contain · 2026-07-21</div>
</header>
<div class="grid">${cards}</div>
<footer>来源：iOS Simulator 真 App · 完整竖屏帧（含 Composer / Dock），非顶部裁切</footer>
</div></body></html>`)
  await page.waitForTimeout(400)
  const board = join(OUT, 'kenos-assistant-ios-10in1-REAL.png')
  await page.screenshot({ path: board, fullPage: false })
  console.log('BOARD', board, `${W}x${H}`)
  await browser.close()
  return board
}

async function main() {
  const ping = sh('curl', [
    '-s',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    `${ORIGIN}/assistant`,
  ])
  if ((ping.stdout || '').trim() !== '200') {
    console.error('aios not up on', ORIGIN)
    process.exit(1)
  }

  // Ensure Kenos installed on target sim
  const apps = sh('xcrun', ['simctl', 'listapps', UDID])
  if (!(apps.stdout || '').includes(BUNDLE)) {
    console.error('Kenos not installed on', UDID)
    process.exit(1)
  }

  setOrigin()
  const captured = []
  const hashes = new Set()

  for (const s of SHOTS) {
    coldOpen(s.path)
    sleep(s.settle)
    // One more dismiss in case prompt was late
    dismissOpenPrompt()
    sleep(400)
    const { file, hash } = shot(s.file)
    if (hashes.has(hash)) {
      console.warn('WARN duplicate frame', s.file, hash.slice(0, 10))
    }
    hashes.add(hash)
    captured.push({ file, label: s.label, hash })
  }

  const unique = hashes.size
  console.log('unique frames', unique, '/', captured.length)
  if (unique < 6) {
    console.error('too many duplicate frames — abort montage')
    process.exit(1)
  }

  const board = await montage(captured)
  writeFileSync(
    join(OUT, 'MANIFEST.json'),
    JSON.stringify(
      {
        udid: UDID,
        origin: ORIGIN,
        bundle: BUNDLE,
        uniqueFrames: unique,
        shots: captured,
        board,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
