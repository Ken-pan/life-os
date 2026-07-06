const statusEl = document.getElementById('status')
const devModeEl = document.getElementById('dev-agent-mode')
const bridgeStatusEl = document.getElementById('bridge-status')
let pollTimer = null

document
  .getElementById('btn-capture-send')
  .addEventListener('click', () => captureAndSend())
document
  .getElementById('btn-capture')
  .addEventListener('click', () => captureOnly())
document
  .getElementById('btn-send')
  .addEventListener('click', () => captureAndSend({ resendOnly: true }))

document.getElementById('btn-download').addEventListener('click', async () => {
  const res = await sendMessage({ type: 'WSD_GET_LATEST' })
  if (!res.ok || !res.snapshot)
    return setStatus('还没有 snapshot — 请先 Capture & Send', 'error')
  downloadText(
    JSON.stringify(res.snapshot, null, 2),
    `web-snapshot-${Date.now()}.json`,
    'application/json',
  )
  setStatus('Downloaded JSON', 'ok')
})

document.getElementById('btn-summary').addEventListener('click', async () => {
  setStatus('Fetching summary from bridge…', 'info')
  try {
    const res = await fetch('http://127.0.0.1:17321/latest/summary')
    if (!res.ok) throw new Error('Bridge 无 summary — 请先 Capture & Send')
    const md = await res.text()
    downloadText(md, `web-summary-${Date.now()}.md`, 'text/markdown')
    setStatus('Downloaded summary.md', 'ok')
  } catch (err) {
    setStatus(String(err.message), 'error')
  }
})

async function captureOnly() {
  setStatus('Capturing current tab…', 'info')
  const res = await sendMessage({ type: 'WSD_CAPTURE_TAB' })
  if (!res.ok) return setStatus(formatError(res.error), 'error')
  const s = res.snapshot
  const orders = s?.adapter?.items?.length
  setStatus(
    `Captured: ${s?.page?.title || s?.page?.url || 'page'} · ${s?.elements?.length ?? 0} elements${orders != null ? ` · ${orders} orders` : ''}`,
    'ok',
  )
}

async function captureAndSend(opts = {}) {
  setStatus(
    opts.resendOnly ? 'Sending to bridge…' : 'Capturing & sending…',
    'info',
  )
  const res = await sendMessage({
    type: opts.resendOnly ? 'WSD_SEND_TO_BRIDGE' : 'WSD_CAPTURE_AND_SEND',
  })
  if (!res.ok) return setStatus(formatError(res.error), 'error')
  const s = res.snapshot || {}
  const orders = s.orders ?? res.snapshot?.orders
  setStatus(
    `${res.autoCaptured ? 'Captured & sent' : 'Sent'}: ${s.title || s.url || 'page'}${orders != null ? ` · ${orders} Amazon orders` : ''}`,
    'ok',
  )
}

function formatError(msg) {
  if (/No snapshot/i.test(msg)) return '请先点 Capture & Send（不要只点 Send）'
  if (/Bridge error|fetch|Failed to fetch|ECONNREFUSED/i.test(msg))
    return 'Bridge 未运行 — 终端执行: cd tools/web-state-devtools/bridge && npm run bridge'
  if (/Cannot access|permission|scripting/i.test(msg))
    return '无法注入页面 — 请在 Amazon/Best Buy 标签页打开扩展，或 reload 扩展后重试 Capture'
  return msg
}

devModeEl.addEventListener('change', async () => {
  if (devModeEl.checked) {
    try {
      const granted = await chrome.permissions.request({
        origins: ['https://*.amazon.com/*', 'https://*.bestbuy.com/*'],
      })
      if (!granted) {
        devModeEl.checked = false
        setStatus('Amazon / Best Buy 权限未授予 — Agent 模式已关闭', 'error')
        return
      }
    } catch {
      /* optional — localhost/netlify already in host_permissions */
    }
  }
  await chrome.storage.local.set({ wsd_dev_agent_mode: devModeEl.checked })
  await sendMessage({
    type: 'WSD_DEV_MODE_CHANGED',
    enabled: devModeEl.checked,
  })
  setStatus(
    devModeEl.checked
      ? 'Dev Agent Mode ON — Cursor 可控制标签页（无需保持 popup 打开）'
      : 'Dev Agent Mode OFF',
    devModeEl.checked ? 'ok' : 'info',
  )
})

chrome.storage.local.get('wsd_dev_agent_mode').then((data) => {
  devModeEl.checked = !!data.wsd_dev_agent_mode
})

checkBridge()

async function checkBridge() {
  try {
    const res = await fetch('http://127.0.0.1:17321/health')
    if (!res.ok) throw new Error('down')
    const health = await res.json()
    const v = health.version || '?'
    const wsOk = health.agent?.extensionConnected
    const wsHint = String(v).startsWith('0.3')
      ? ' · ⚠ bridge 太旧，请重启'
      : wsOk
        ? ' · agent WS ✓'
        : ' · agent WS 等待连接'
    bridgeStatusEl.textContent = `online v${v}${wsHint}`
    bridgeStatusEl.className = String(v).startsWith('0.3')
      ? 'offline'
      : 'online'
    if (String(v).startsWith('0.3')) {
      setStatus(
        'Bridge 版本过旧 — 请重启: cd tools/web-state-devtools/bridge && npm run bridge',
        'error',
      )
    }
  } catch {
    bridgeStatusEl.textContent = 'offline — run npm run bridge'
    bridgeStatusEl.className = 'offline'
    setStatus('Bridge 离线 — 请先启动 bridge', 'error')
  }
}

function startPolling() {
  /* v0.4: agent loop runs in service worker — popup polling removed */
}

function stopPolling() {}

async function pollCommand() {}

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg)
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function setStatus(text, kind) {
  statusEl.textContent = text
  statusEl.className = `status ${kind}`
}

window.addEventListener('unload', stopPolling)
