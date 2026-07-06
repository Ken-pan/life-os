/**
 * Background agent — WebSocket to bridge + poll fallback. Loaded via importScripts in service worker.
 */
/* global WSD_AGENT, WSD_BRIDGE_URL, WSD_executeAction */

const WS_PATH = '/agent'
const MIN_WS_BRIDGE_VERSION = '0.4.0'

let ws = null
let wsConnecting = false
let reconnectTimer = null
let pollTimer = null
let wsSupported = null
let wsDisabledReason = null

function bridgeUrl() {
  return typeof WSD_BRIDGE_URL !== 'undefined'
    ? WSD_BRIDGE_URL
    : 'http://127.0.0.1:17321'
}

function wsUrl() {
  return bridgeUrl().replace(/^http/, 'ws') + WS_PATH
}

function parseVersion(v) {
  return String(v || '0.0.0')
    .split('.')
    .map((n) => Number(n) || 0)
}

function versionAtLeast(current, minimum) {
  const a = parseVersion(current)
  const b = parseVersion(minimum)
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return true
}

async function checkBridgeWsSupport() {
  try {
    const res = await fetch(`${bridgeUrl()}/health`)
    if (!res.ok) {
      wsSupported = false
      wsDisabledReason = `bridge health ${res.status}`
      return false
    }
    const health = await res.json()
    if (!versionAtLeast(health.version, MIN_WS_BRIDGE_VERSION)) {
      wsSupported = false
      wsDisabledReason = `bridge v${health.version} — need >= ${MIN_WS_BRIDGE_VERSION}`
      console.warn('[wsd]', wsDisabledReason)
      return false
    }
    wsSupported = true
    wsDisabledReason = null
    return true
  } catch {
    wsSupported = false
    wsDisabledReason = 'bridge offline'
    return false
  }
}

function safeWsSend(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  try {
    socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    return true
  } catch (err) {
    console.warn('[wsd] ws send skipped:', err?.message || err)
    return false
  }
}

async function sendActionComplete(socket, msg, result, error) {
  const body = {
    type: 'complete',
    id: msg.id,
    ok: !error,
    result: result ?? undefined,
    error: error || undefined,
  }
  if (safeWsSend(socket, body)) return
  try {
    await fetch(`${bridgeUrl()}/actions/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msg.id, ok: !error, result, error }),
    })
  } catch {
    /* bridge offline */
  }
}

function teardownSocket(socket) {
  if (!socket) return
  socket.onopen = null
  socket.onmessage = null
  socket.onclose = null
  socket.onerror = null
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    try {
      socket.close()
    } catch {
      /* ignore */
    }
  }
}

function connectAgentWs() {
  if (ws?.readyState === WebSocket.OPEN) return
  if (ws?.readyState === WebSocket.CONNECTING || wsConnecting) return
  if (wsSupported === false) return

  checkBridgeWsSupport().then((ok) => {
    if (!ok) return
    if (
      ws?.readyState === WebSocket.OPEN ||
      ws?.readyState === WebSocket.CONNECTING ||
      wsConnecting
    ) {
      return
    }

    wsConnecting = true
    let socket
    try {
      socket = new WebSocket(wsUrl())
      ws = socket
    } catch {
      wsConnecting = false
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      if (socket !== ws) return
      wsConnecting = false
      safeWsSend(socket, {
        type: 'hello',
        agent: 'web-state-devtools',
        version: '0.8.0',
      })
      console.log('[wsd] agent WS connected')
    }

    socket.onmessage = async (ev) => {
      if (socket !== ws) return
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type !== 'run' || !msg.id || !msg.action) return

      try {
        const result = await WSD_executeAction(msg.action, msg.params || {})
        await sendActionComplete(socket, msg, result, null)
      } catch (err) {
        await sendActionComplete(socket, msg, null, String(err?.message || err))
      }
    }

    socket.onclose = (ev) => {
      wsConnecting = false
      if (socket === ws) ws = null
      if (ev.code === 1006 || ev.code === 1002) {
        wsSupported = false
        wsDisabledReason = 'WebSocket /agent unavailable — using poll fallback'
        console.warn('[wsd]', wsDisabledReason)
        return
      }
      scheduleReconnect()
    }

    socket.onerror = () => {
      wsConnecting = false
      if (socket === ws) teardownSocket(socket)
    }
  })
}

function scheduleReconnect() {
  if (wsSupported === false) return
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connectAgentWs, 5000)
}

async function pollLoop() {
  const enabled = await WSD_AGENT.isDevModeEnabled()
  if (!enabled) return

  if (wsSupported === false && !ws && !wsConnecting) {
    await checkBridgeWsSupport()
    if (wsSupported) connectAgentWs()
  }

  try {
    const res = await fetch(`${WSD_AGENT.bridgeUrl()}/commands/next`)
    if (!res.ok) return
    const data = await res.json()
    const cmd = data.command
    if (!cmd) return

    if (cmd.type === 'open_url_for_capture' && cmd.url) {
      await WSD_AGENT.openAndCapture(cmd.url)
    } else if (cmd.type === 'click_and_capture' && cmd.selector) {
      await WSD_AGENT.clickAndCapture(cmd.selector)
    } else if (cmd.action && cmd.id) {
      try {
        const result = await WSD_executeAction(cmd.action, cmd.params || {})
        await fetch(`${WSD_AGENT.bridgeUrl()}/actions/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: cmd.id, ok: true, result }),
        })
      } catch (err) {
        await fetch(`${WSD_AGENT.bridgeUrl()}/actions/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cmd.id,
            ok: false,
            error: String(err?.message || err),
          }),
        })
      }
    }
  } catch {
    /* bridge offline */
  }
}

function startAgentLoop() {
  wsSupported = null
  connectAgentWs()
  clearInterval(pollTimer)
  pollTimer = setInterval(pollLoop, 2000)
}

function stopAgentLoop() {
  clearInterval(pollTimer)
  pollTimer = null
  clearTimeout(reconnectTimer)
  teardownSocket(ws)
  ws = null
  wsConnecting = false
}

function getAgentLoopStatus() {
  return {
    wsConnected: ws?.readyState === WebSocket.OPEN,
    wsConnecting,
    wsSupported,
    wsDisabledReason,
  }
}

globalThis.WSD_AGENT_LOOP = {
  startAgentLoop,
  stopAgentLoop,
  connectAgentWs,
  getAgentLoopStatus,
}
