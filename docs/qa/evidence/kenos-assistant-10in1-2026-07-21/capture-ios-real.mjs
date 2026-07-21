/**
 * Capture REAL Kenos iOS Simulator screens of /assistant (10 stages)
 * and montage into one review board.
 *
 * Prerequisites:
 * - iPhone Simulator booted with space.kenos.app.ios installed
 * - aios Vite on http://127.0.0.1:5197 (demo seed works on loopback)
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
const RAW = join(OUT, 'raw-ios')
const BUNDLE = 'space.kenos.app.ios'
const ORIGIN = 'http://127.0.0.1:5197'

mkdirSync(RAW, { recursive: true })

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts })
}

function sleep(ms) {
  spawnSync('sleep', [String(ms / 1000)])
}

function bootedUdid() {
  const r = sh('xcrun', ['simctl', 'list', 'devices', 'booted'])
  const m = (r.stdout || '').match(
    /\(([0-9A-F-]{36})\)\s+\(Booted\)/i,
  )
  // Prefer the one that has Kenos installed
  const all = [...(r.stdout || '').matchAll(/\(([0-9A-F-]{36})\)\s+\(Booted\)/gi)].map(
    (x) => x[1],
  )
  for (const id of all) {
    const apps = sh('xcrun', ['simctl', 'listapps', id])
    if ((apps.stdout || '').includes(BUNDLE)) return id
  }
  return process.env.KENOS_SIM_UDID || m?.[1] || all[0]
}

const UDID = bootedUdid()
if (!UDID) {
  console.error('No booted simulator with Kenos')
  process.exit(1)
}
console.log('UDID', UDID)

function terminate() {
  sh('xcrun', ['simctl', 'terminate', UDID, BUNDLE])
}

function launch() {
  const r = sh('xcrun', ['simctl', 'launch', UDID, BUNDLE])
  console.log('launch', (r.stdout || r.stderr || '').trim())
}

function openShell(pathAndQuery) {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`
  const url = `kenos://shell?path=${encodeURIComponent(path)}`
  console.log('open', url)
  const r = sh('xcrun', ['simctl', 'openurl', UDID, url])
  if (r.status !== 0) console.warn(r.stderr || r.stdout)
  // If iOS shows "Open in Kenos?", click Open via Simulator UI
  dismissOpenPrompt()
}

function dismissOpenPrompt() {
  sh('osascript', [
    '-e',
    `tell application "Simulator" to activate
try
  tell application "System Events"
    tell process "Simulator"
      if exists (button "Open" of window 1) then
        click button "Open" of window 1
      end if
      if exists (button "打开" of window 1) then
        click button "打开" of window 1
      end if
    end tell
  end tell
end try`,
  ])
}

function shot(name) {
  const file = join(RAW, name)
  const r = sh('xcrun', ['simctl', 'io', UDID, 'screenshot', file])
  if (!existsSync(file)) {
    console.error('shot fail', name, r.stderr || r.stdout)
    return null
  }
  console.log('shot', name)
  return file
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

/** Clear WK website data for our origin by nuking app Library/WebKit + Caches (sim only). */
function clearWebData() {
  const r = sh('xcrun', ['simctl', 'get_app_container', UDID, BUNDLE, 'data'])
  const container = (r.stdout || '').trim()
  if (!container || !existsSync(container)) {
    console.warn('no container')
    return
  }
  for (const rel of [
    'Library/WebKit',
    'Library/Caches',
    'Library/HTTPStorages',
    'Library/Cookies',
  ]) {
    sh('rm', ['-rf', join(container, rel)])
  }
  console.log('cleared web data', container)
}

const SHOTS = [
  {
    file: '01-locked.png',
    label: '01 锁定 · 需连接账户',
    path: '/assistant?demo=0&kenosDemo=0',
    settle: 3500,
    clear: true,
  },
  {
    file: '02-attention-ready.png',
    label: '02 空态 · Attention Ready',
    path: '/assistant?demo=0&kenosDemo=1',
    settle: 3500,
    clear: true,
  },
  {
    file: '03-chat-debug.png',
    label: '03 对话 · 多轮调试',
    path: '/assistant?demo=1&chat=demo-chat-debug',
    settle: 3500,
    clear: true,
  },
  {
    file: '04-followups.png',
    label: '04 追问建议 · Follow-ups',
    // Shorter thread so follow-up chips stay on-screen
    path: '/assistant?demo=1&chat=demo-chat-email',
    settle: 3500,
    clear: true,
  },
  {
    file: '05-tools-search.png',
    label: '05 工具 · 联网检索',
    path: '/assistant?demo=1&chat=demo-chat-runes',
    settle: 4000,
    clear: true,
  },
  {
    file: '06-image-tool.png',
    label: '06 工具 · 本地生图',
    path: '/assistant?demo=1&chat=demo-chat-image',
    settle: 4000,
    clear: true,
  },
  {
    file: '07-artifact-clock.png',
    label: '07 Artifacts · HTML 时钟',
    path: '/assistant?demo=1&chat=demo-chat-clock',
    settle: 4000,
    clear: true,
  },
  {
    file: '08-scope-work.png',
    label: '08 Scope · Work',
    path: '/assistant?demo=1&chat=demo-chat-sales&scope=work&entity=Kenos%20IA',
    settle: 4000,
    clear: true,
  },
  {
    file: '09-sql-chat.png',
    label: '09 对话 · SQL / 代码',
    path: '/assistant?demo=1&chat=demo-chat-orders',
    settle: 3500,
    clear: true,
  },
  {
    file: '10-compose-trust.png',
    label: '10 Composer · 信任提示',
    path: '/assistant?demo=0&kenosDemo=1',
    settle: 3500,
    clear: true,
  },
]

async function montage(items) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 2200, height: 1280 },
    deviceScaleFactor: 2,
  })
  const cards = items
    .map((it, i) => {
      const b64 = readFileSync(it.file).toString('base64')
      return `<figure>
        <div class="frame"><img src="data:image/png;base64,${b64}" /></div>
        <figcaption><span class="n">${String(i + 1).padStart(2, '0')}</span>${it.label.replace(/^\d+\s*/, '')}</figcaption>
      </figure>`
    })
    .join('\n')

  await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<style>
html,body{margin:0;background:#111214;color:#f3f3f1;font-family:-apple-system,"SF Pro Text","PingFang SC",sans-serif}
.board{width:2200px;height:1280px;box-sizing:border-box;padding:28px 30px 22px;display:flex;flex-direction:column;gap:14px}
header{display:flex;justify-content:space-between;align-items:baseline}
h1{margin:0;font-size:26px;font-weight:650}
.meta{font-size:12px;opacity:.5}
.grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:1fr 1fr;gap:12px}
figure{margin:0;display:flex;flex-direction:column;gap:7px;min-height:0}
.frame{flex:1;min-height:0;border-radius:22px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 30px rgba(0,0,0,.4)}
.frame img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
figcaption{font-size:12px;opacity:.8;display:flex;gap:8px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n{font-weight:700;color:#8fd6b5;font-variant-numeric:tabular-nums}
footer{font-size:11px;opacity:.38}
</style></head><body>
<div class="board">
<header>
  <h1>Kenos iOS App · 助手页真实截图 10合1</h1>
  <div class="meta">Simulator · space.kenos.app.ios · ${ORIGIN} · 2026-07-21</div>
</header>
<div class="grid">${cards}</div>
<footer>来源：iOS Simulator 真 App（WKWebView Daily Beta），非 AI 示意稿 · xcrun simctl io screenshot</footer>
</div></body></html>`)
  await page.waitForTimeout(400)
  const board = join(OUT, 'kenos-assistant-ios-10in1-REAL.png')
  await page.screenshot({ path: board, fullPage: false })
  console.log('BOARD', board)
  await browser.close()
  return board
}

async function main() {
  // Ensure origin reachable
  const ping = sh('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `${ORIGIN}/assistant`])
  if ((ping.stdout || '').trim() !== '200') {
    console.error('aios not up on', ORIGIN)
    process.exit(1)
  }

  setOrigin()
  const captured = []

  for (const s of SHOTS) {
    terminate()
    if (s.clear) clearWebData()
    sleep(400)
    launch()
    sleep(2000)
    openShell(s.path)
    sleep(s.settle)
    // Nudge once more after settle (query-driven SPA reload)
    openShell(s.path)
    sleep(1500)
    const file = shot(s.file)
    if (file) captured.push({ file, label: s.label })
  }

  if (captured.length < 5) {
    console.error('too few shots', captured.length)
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
        shots: captured.map((c) => ({ file: c.file, label: c.label })),
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
