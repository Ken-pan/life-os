const BRIDGE_URL = 'http://127.0.0.1:17321'
const STORAGE_LATEST = 'wsd_latest_snapshot'

const CAPTURE_FILES = [
  'lib/deep-dom.js',
  'lib/core.js',
  'lib/ax-snap.js',
  'lib/wait-ready.js',
  'lib/table-walker.js',
  'lib/framework-hints.js',
  'lib/region-scoper.js',
  'lib/action-runner.js',
  'adapters/amazon-orders.js',
  'adapters/bestbuy-orders.js',
  'adapters/life-os.js',
  'capture.js',
]

const ACTION_FILES = ['lib/deep-dom.js', 'lib/action-runner.js']

globalThis.WSD_BRIDGE_URL = BRIDGE_URL

globalThis.WSD_AGENT = {
  bridgeUrl: () => BRIDGE_URL,
  isDevModeEnabled: async () => {
    const d = await chrome.storage.local.get('wsd_dev_agent_mode')
    return !!d.wsd_dev_agent_mode
  },
  openAndCapture,
  clickAndCapture: clickAndCaptureActiveTab,
}

globalThis.WSD_executeAction = executeAction

importScripts('agent-loop.js', 'cdp-handler.js')

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('wsd_dev_agent_mode').then((d) => {
    if (d.wsd_dev_agent_mode) WSD_AGENT_LOOP.startAgentLoop()
    else WSD_AGENT_LOOP.connectAgentWs()
  })
})

chrome.runtime.onStartup.addListener(() => {
  WSD_AGENT_LOOP.startAgentLoop()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.wsd_dev_agent_mode) return
  if (changes.wsd_dev_agent_mode.newValue) WSD_AGENT_LOOP.startAgentLoop()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'WSD_CAPTURE_TAB') {
    captureActiveTab()
      .then((snapshot) => sendResponse({ ok: true, snapshot }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  if (message?.type === 'WSD_SEND_TO_BRIDGE') {
    captureAndSend(message.snapshot)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  if (message?.type === 'WSD_CAPTURE_AND_SEND') {
    captureAndSend()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  if (message?.type === 'WSD_GET_LATEST') {
    chrome.storage.local.get(STORAGE_LATEST).then((data) => {
      sendResponse({ ok: true, snapshot: data[STORAGE_LATEST] || null })
    })
    return true
  }

  if (message?.type === 'WSD_POLL_COMMAND') {
    pollBridgeCommand()
      .then((cmd) =>
        handleCommand(cmd).then((result) =>
          sendResponse({ ok: true, ...result }),
        ),
      )
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  if (message?.type === 'WSD_DEV_MODE_CHANGED') {
    if (message.enabled) WSD_AGENT_LOOP.startAgentLoop()
    sendResponse({ ok: true })
    return true
  }

  if (message?.type === 'WSD_OPEN_AND_CAPTURE') {
    openAndCapture(message.url)
      .then((snapshot) => sendResponse({ ok: true, snapshot }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  if (message?.type === 'WSD_CLICK_AND_CAPTURE') {
    clickAndCaptureActiveTab(message.selector)
      .then((snapshot) => sendResponse({ ok: true, snapshot }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  if (message?.type === 'WSD_RUN_ACTION') {
    executeAction(message.action, message.params || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err?.message || err) }),
      )
    return true
  }

  return false
})

async function executeAction(action, params = {}) {
  if (action !== 'ping' && action !== 'list_tabs') {
    const enabled = await WSD_AGENT.isDevModeEnabled()
    if (!enabled) {
      throw new Error('Dev Agent Mode 未开启 — 请在扩展 popup 中打开')
    }
  }

  switch (action) {
    case 'ping':
      return {
        agent: 'web-state-devtools',
        version: '0.8.0',
        bridge: BRIDGE_URL,
      }

    case 'list_tabs': {
      const tabs = await chrome.tabs.query({})
      return tabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        windowId: t.windowId,
      }))
    }

    case 'navigate': {
      const { url, tabId, active = true } = params
      if (!url) throw new Error('url required')
      if (tabId) {
        await chrome.tabs.update(tabId, { url, active })
        await waitForTabComplete(tabId)
        return { tabId, url }
      }
      const tab = await chrome.tabs.create({ url, active })
      await waitForTabComplete(tab.id)
      return { tabId: tab.id, url }
    }

    case 'navigate_and_capture': {
      const { url, waitMs = 800 } = params
      if (!url) throw new Error('url required')
      const nav = await executeAction('navigate', { url, tabId: params.tabId })
      if (waitMs) await sleep(waitMs)
      const snapshot = await captureTab(nav.tabId)
      await sendToBridge(snapshot)
      return { tabId: nav.tabId, url, snapshot: summarizeSnapshot(snapshot) }
    }

    case 'click': {
      const tabId = await resolveTabId(params)
      await injectActions(tabId)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => window.__WSD_ACTIONS__.clickSelector(sel),
        args: [params.selector],
      })
      return { tabId, ...result }
    }

    case 'fill': {
      const tabId = await resolveTabId(params)
      await injectActions(tabId)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, text, clear) =>
          window.__WSD_ACTIONS__.fillSelector(sel, text, clear),
        args: [params.selector, params.text ?? '', params.clear !== false],
      })
      return { tabId, ...result }
    }

    case 'scroll': {
      const tabId = await resolveTabId(params)
      await injectActions(tabId)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (y, preset) => {
          if (preset === 'bottom')
            return window.__WSD_ACTIONS__.scrollToBottom()
          return window.__WSD_ACTIONS__.scrollPage(y)
        },
        args: [params.y ?? 800, params.preset],
      })
      return { tabId, ...result }
    }

    case 'wait_for': {
      const tabId = await resolveTabId(params)
      await injectActions(tabId)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel, timeoutMs) =>
          window.__WSD_ACTIONS__.waitForSelector(sel, timeoutMs),
        args: [params.selector, params.timeoutMs ?? 10000],
      })
      return { tabId, ...result }
    }

    case 'get_text': {
      const tabId = await resolveTabId(params)
      await injectActions(tabId)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => window.__WSD_ACTIONS__.getText(sel),
        args: [params.selector ?? null],
      })
      return { tabId, ...result }
    }

    case 'run_preset': {
      const tabId = await resolveTabId(params)
      await injectActions(tabId)
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (name) => window.__WSD_ACTIONS__.runPreset(name),
        args: [params.preset],
      })
      return { tabId, ...result }
    }

    case 'capture': {
      const tabId = await resolveTabId(params)
      const snapshot = await captureTab(tabId, params)
      if (params.send !== false) await sendToBridge(snapshot)
      return { tabId, snapshot: summarizeSnapshot(snapshot) }
    }

    case 'cdp_attach': {
      const tabId = await resolveTabId(params)
      return WSD_CDP.attachTab(tabId)
    }

    case 'cdp_detach': {
      const tabId = await resolveTabId(params)
      return WSD_CDP.detachTab(tabId)
    }

    case 'network_start': {
      const tabId = await resolveTabId(params)
      return WSD_CDP.startNetworkCapture(tabId, {
        reset: params.reset !== false,
        maxBufferMb: params.maxBufferMb,
      })
    }

    case 'network_stop': {
      const tabId = await resolveTabId(params)
      return WSD_CDP.stopNetworkCapture(tabId)
    }

    case 'network_get': {
      const tabId = await resolveTabId(params)
      return WSD_CDP.getNetworkBuffer(tabId)
    }

    case 'network_wait_idle': {
      const tabId = await resolveTabId(params)
      if (params.startCapture) {
        await WSD_CDP.startNetworkCapture(tabId, { reset: false })
      }
      const idle = await WSD_CDP.waitNetworkIdle(
        tabId,
        params.quietMs ?? 600,
        params.timeoutMs ?? 8000,
      )
      const buf = WSD_CDP.getNetworkBuffer(tabId)
      return { ...idle, ...buf }
    }

    case 'capture_enhanced': {
      const tabId = await resolveTabId(params)
      const useCdp = params.cdp !== false
      const useNetwork = params.network !== false

      if (useNetwork) {
        await WSD_CDP.startNetworkCapture(tabId, {
          reset: params.resetNetwork !== false,
        })
      }

      if (useCdp && params.waitNetworkIdle) {
        await WSD_CDP.waitNetworkIdle(
          tabId,
          params.quietMs ?? 600,
          params.timeoutMs ?? 8000,
        )
      }

      let snapshot = await captureTab(tabId)

      if (useCdp) {
        try {
          const cdpSnap = await WSD_CDP.getFullAXTree(tabId)
          snapshot.snapV2 = WSD_CDP.mergeSnapV2(snapshot.snapV2, cdpSnap)
          snapshot.cdp = {
            ...(snapshot.cdp || {}),
            ax: cdpSnap.stats,
            capturedAt: new Date().toISOString(),
          }
        } catch (err) {
          snapshot.cdpError = String(err?.message || err)
        }
      }

      if (useNetwork) {
        if (params.waitNetworkIdle) {
          await WSD_CDP.waitNetworkIdle(
            tabId,
            params.quietMs ?? 600,
            params.timeoutMs ?? 8000,
          )
        }
        const buf = WSD_CDP.getNetworkBuffer(tabId)
        snapshot.cdp = {
          ...(snapshot.cdp || {}),
          network: {
            capturedAt: new Date().toISOString(),
            events: buf.events,
          },
        }
      }

      if (params.detachCdp) await WSD_CDP.detachTab(tabId)

      if (params.send !== false) await sendToBridge(snapshot)
      return {
        tabId,
        snapshot: summarizeSnapshot(snapshot),
        cdp: snapshot.cdp,
        tables: snapshot.tables?.length,
        snapV2Refs: Object.keys(snapshot.snapV2?.refs || {}).length,
      }
    }

    case 'click_and_capture': {
      await executeAction('click', params)
      await sleep(params.waitMs ?? 600)
      return executeAction('capture', {
        tabId: params.tabId,
        send: params.send,
      })
    }

    case 'run_steps': {
      const steps = params.steps || []
      const results = []
      for (const step of steps) {
        const r = await executeAction(step.action, {
          ...params,
          ...step.params,
          tabId: step.tabId ?? params.tabId,
        })
        results.push({ action: step.action, result: r })
        if (step.delayMs) await sleep(step.delayMs)
      }
      return { steps: results }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

async function resolveTabId(params) {
  if (params.tabId) return params.tabId
  if (params.urlContains) {
    const tabs = await chrome.tabs.query({})
    const match = tabs.find((t) => t.url?.includes(params.urlContains))
    if (match?.id) return match.id
    throw new Error(`No tab matching urlContains: ${params.urlContains}`)
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  return tab.id
}

function summarizeSnapshot(snapshot) {
  return {
    url: snapshot.page?.url,
    title: snapshot.page?.title,
    elements: snapshot.elements?.length,
    controls: snapshot.controls?.length,
    orders: snapshot.adapter?.items?.length,
    tables: snapshot.tables?.length,
    networkEvents: snapshot.cdp?.network?.events?.length,
    adapter: snapshot.adapter?.entity
      ? {
          site: snapshot.adapter.site,
          entity: snapshot.adapter.entity,
          count: snapshot.adapter.items?.length,
        }
      : undefined,
  }
}

async function handleCommand(cmd) {
  if (!cmd) return { command: null }
  if (cmd.type === 'open_url_for_capture' && cmd.url) {
    const snapshot = await openAndCapture(cmd.url)
    return { command: cmd, snapshot: { url: snapshot.page?.url } }
  }
  if (cmd.type === 'click_and_capture' && cmd.selector) {
    const snapshot = await clickAndCaptureActiveTab(cmd.selector)
    return { command: cmd, snapshot: { url: snapshot.page?.url } }
  }
  return { command: cmd, skipped: true }
}

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  return captureTab(tab.id)
}

async function captureTab(tabId, params = {}) {
  if (params.wait || params.fast) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (wait, captureOpts) => {
        window.__WSD_CAPTURE_WAIT__ = wait || undefined
        window.__WSD_CAPTURE_OPTS__ = captureOpts || undefined
      },
      args: [
        params.wait || null,
        params.fast
          ? {
              quietMs: 60,
              timeoutMs: 400,
              skipQuiescence: true,
              skipAxSnap: true,
            }
          : params.captureOpts || null,
      ],
    })
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    files: CAPTURE_FILES,
  })
  if (!result) throw new Error('Capture returned empty result')
  await chrome.storage.local.set({ [STORAGE_LATEST]: result })
  return result
}

async function injectActions(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ACTION_FILES,
  })
}

async function clickAndCaptureActiveTab(selector) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab for click')
  await injectActions(tab.id)
  const [{ result: clickResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => window.__WSD_INTERACT__.clickSelector(sel),
    args: [selector],
  })
  await sleep(600)
  const snapshot = await captureTab(tab.id)
  await sendToBridge(snapshot)
  await fetch(`${BRIDGE_URL}/commands/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'click_and_capture',
      selector,
      clickResult,
      status: 'captured',
    }),
  }).catch(() => {})
  return snapshot
}

async function captureAndSend(existingSnapshot) {
  let snapshot = existingSnapshot
  let autoCaptured = false
  if (!snapshot) {
    const stored = await chrome.storage.local.get(STORAGE_LATEST)
    snapshot = stored[STORAGE_LATEST]
  }
  if (!snapshot) {
    snapshot = await captureActiveTab()
    autoCaptured = true
  }
  const bridgeResult = await sendToBridge(snapshot)
  return {
    ...bridgeResult,
    autoCaptured,
    snapshot: summarizeSnapshot(snapshot),
  }
}

async function sendToBridge(snapshot) {
  if (!snapshot) throw new Error('No snapshot to send')
  const res = await fetch(`${BRIDGE_URL}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Bridge error ${res.status}: ${text}`)
  }
  return res.json()
}

async function pollBridgeCommand() {
  const res = await fetch(`${BRIDGE_URL}/commands/next`, { method: 'GET' })
  if (!res.ok) throw new Error(`Bridge poll failed: ${res.status}`)
  const data = await res.json()
  return data.command || null
}

async function openAndCapture(url) {
  const tab = await chrome.tabs.create({ url, active: true })
  await waitForTabComplete(tab.id)
  await sleep(800)
  const snapshot = await captureTab(tab.id)
  await sendToBridge(snapshot)
  await fetch(`${BRIDGE_URL}/commands/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, status: 'captured' }),
  }).catch(() => {})
  return snapshot
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error('Tab load timeout'))
    }, timeoutMs)

    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(onUpdated)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t.status === 'complete') {
          clearTimeout(timer)
          chrome.tabs.onUpdated.removeListener(onUpdated)
          resolve()
        }
      })
      .catch(reject)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Start WS on load
WSD_AGENT_LOOP.startAgentLoop()
