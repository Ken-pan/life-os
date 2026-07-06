/**
 * CDP capture via chrome.debugger — AX tree + network JSON (MV3 service worker).
 */
;(function initCdpHandler(global) {
  /** @type {Map<number, { networkBuffer: object[], networkEnabled: boolean, pending: Map<string, object>, inflight: number, lastActivity: number }>} */
  const sessions = new Map()

  const JSON_MIME = /json|graphql|javascript|text\/plain|application\/vnd\.api/i

  async function attachTab(tabId) {
    if (sessions.has(tabId)) return { attached: true, already: true }
    await chrome.debugger.attach({ tabId }, '1.3')
    sessions.set(tabId, {
      networkBuffer: [],
      networkEnabled: false,
      pending: new Map(),
      inflight: 0,
      lastActivity: Date.now(),
    })
    return { attached: true }
  }

  async function detachTab(tabId) {
    if (!sessions.has(tabId)) return { detached: false }
    try {
      await chrome.debugger.detach({ tabId })
    } catch {
      /* already detached */
    }
    sessions.delete(tabId)
    return { detached: true }
  }

  async function cdpSend(tabId, method, params = {}) {
    return chrome.debugger.sendCommand({ tabId }, method, params)
  }

  function session(tabId) {
    const s = sessions.get(tabId)
    if (!s) throw new Error(`Tab ${tabId} not attached — call cdp_attach first`)
    return s
  }

  async function startNetworkCapture(tabId, opts = {}) {
    await attachTab(tabId)
    const s = session(tabId)
    if (!s.networkEnabled) {
      await cdpSend(tabId, 'Network.enable', {
        maxTotalBufferSize: opts.maxBufferMb
          ? opts.maxBufferMb * 1024 * 1024
          : 5_000_000,
      })
      s.networkEnabled = true
    }
    if (opts.reset) s.networkBuffer = []
    return { started: true, count: s.networkBuffer.length }
  }

  async function stopNetworkCapture(tabId) {
    const s = sessions.get(tabId)
    if (!s) return { stopped: false, events: [] }
    s.networkEnabled = false
    try {
      await cdpSend(tabId, 'Network.disable')
    } catch {
      /* ignore */
    }
    return { stopped: true, events: s.networkBuffer.slice() }
  }

  async function tryStoreResponseBody(tabId, requestId, meta) {
    const s = session(tabId)
    const maxBytes = 80_000
    try {
      const body = await cdpSend(tabId, 'Network.getResponseBody', {
        requestId,
      })
      let text = body.body || ''
      if (body.base64Encoded) {
        if (!/json|text|graphql/i.test(meta.mimeType || '')) return
        try {
          text = atob(text)
        } catch {
          return
        }
      }
      if (text.length > maxBytes) {
        s.networkBuffer.push({
          ...meta,
          size: text.length,
          truncated: true,
          preview: text.slice(0, 400),
        })
        return
      }
      /** @type {Record<string, unknown>} */
      const entry = { ...meta, size: text.length }
      if (
        JSON_MIME.test(meta.mimeType || '') ||
        /\/api\/|graphql|\.json/i.test(meta.url || '')
      ) {
        try {
          entry.json = JSON.parse(text)
        } catch {
          entry.preview = text.slice(0, 800)
        }
      } else {
        entry.preview = text.slice(0, 400)
      }
      s.networkBuffer.push(entry)
      if (s.networkBuffer.length > 150) s.networkBuffer.shift()
    } catch {
      s.networkBuffer.push({ ...meta, bodySkipped: true })
    }
  }

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId
    const s = sessions.get(tabId)
    if (!s || !s.networkEnabled) return

    if (method === 'Network.requestWillBeSent') {
      s.inflight += 1
      s.lastActivity = Date.now()
    }
    if (method === 'Network.responseReceived') {
      s.pending.set(params.requestId, {
        url: params.response.url,
        mimeType: params.response.mimeType,
        status: params.response.status,
        resourceType: params.type,
      })
      s.lastActivity = Date.now()
    }
    if (method === 'Network.loadingFinished') {
      s.inflight = Math.max(0, s.inflight - 1)
      s.lastActivity = Date.now()
      const meta = s.pending.get(params.requestId)
      if (meta) {
        s.pending.delete(params.requestId)
        if (
          JSON_MIME.test(meta.mimeType || '') ||
          meta.resourceType === 'XHR' ||
          meta.resourceType === 'Fetch' ||
          /\/api\/|graphql/i.test(meta.url || '')
        ) {
          tryStoreResponseBody(tabId, params.requestId, meta)
        }
      }
    }
    if (method === 'Network.loadingFailed') {
      s.inflight = Math.max(0, s.inflight - 1)
      s.pending.delete(params.requestId)
    }
  })

  chrome.debugger.onDetach.addListener((source) => {
    sessions.delete(source.tabId)
  })

  if (chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      sessions.delete(tabId)
    })
  }

  function pickAxName(node) {
    return (
      node.name?.value ||
      node.description?.value ||
      node.value?.value ||
      ''
    ).trim()
  }

  function formatAxNodes(nodes, maxLines = 500) {
    if (!nodes?.length)
      return { axTree: '', refs: {}, stats: { nodeCount: 0, refCount: 0 } }

    const byId = new Map(nodes.map((n) => [n.nodeId, n]))
    /** @type {Record<string, unknown>} */
    const refs = {}
    const lines = []
    let refCounter = 0

    function childrenOf(node) {
      const ids = node.childIds || []
      return ids.map((id) => byId.get(id)).filter(Boolean)
    }

    function walk(node, depth) {
      if (!node || lines.length >= maxLines) return
      const role = node.role?.value || 'unknown'
      const name = pickAxName(node).slice(0, 120)
      const ref = `e${++refCounter}`
      const flags = []
      if (node.properties) {
        for (const p of node.properties) {
          if (p.name === 'disabled' && p.value.value) flags.push('disabled')
          if (p.name === 'expanded')
            flags.push(p.value.value ? 'expanded' : 'collapsed')
          if (p.name === 'selected' && p.value.value) flags.push('selected')
        }
      }
      const flagStr = flags.length ? ` [${flags.join(',')}]` : ''
      const label = name ? `"${name.replace(/"/g, "'")}"` : ''
      lines.push(
        `${'  '.repeat(Math.min(depth, 10))}- ${role} ${label} [ref=${ref}]${flagStr}`.trim(),
      )

      refs[ref] = {
        role,
        name: name || undefined,
        backendDOMNodeId: node.backendDOMNodeId,
        nodeId: node.nodeId,
      }

      for (const child of childrenOf(node)) {
        walk(child, depth + 1)
      }
    }

    const root = nodes.find((n) => n.role?.value === 'RootWebArea') || nodes[0]
    walk(root, 0)

    return {
      axTree: lines.join('\n'),
      refs,
      stats: {
        nodeCount: nodes.length,
        refCount: refCounter,
        lineCount: lines.length,
      },
    }
  }

  async function getFullAXTree(tabId) {
    await attachTab(tabId)
    await cdpSend(tabId, 'Accessibility.enable').catch(() => {})
    const { nodes } = await cdpSend(tabId, 'Accessibility.getFullAXTree')
    return formatAxNodes(nodes || [])
  }

  async function waitNetworkIdle(tabId, quietMs = 600, timeoutMs = 8000) {
    const s = session(tabId)
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (s.inflight === 0 && Date.now() - s.lastActivity >= quietMs) {
        return { idle: true, inflight: 0, waitedMs: Date.now() - start }
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    return { idle: false, inflight: s.inflight, timedOut: true }
  }

  async function getNetworkBuffer(tabId) {
    const s = sessions.get(tabId)
    return {
      events: s?.networkBuffer?.slice() || [],
      count: s?.networkBuffer?.length || 0,
    }
  }

  function mergeSnapV2(existing, cdpSnap) {
    if (!cdpSnap?.axTree) return existing
    return {
      schema: 'web-state-devtools/snap/v2',
      source: 'cdp+polyfill',
      axTree: cdpSnap.axTree,
      refs: { ...(existing?.refs || {}), ...(cdpSnap.refs || {}) },
      stats: {
        ...(existing?.stats || {}),
        cdpNodeCount: cdpSnap.stats?.nodeCount,
        refCount: Object.keys({
          ...(existing?.refs || {}),
          ...(cdpSnap.refs || {}),
        }).length,
        polyfillRefCount: existing?.stats?.refCount,
      },
      polyfillAxTree: existing?.axTree,
    }
  }

  global.WSD_CDP = {
    attachTab,
    detachTab,
    startNetworkCapture,
    stopNetworkCapture,
    waitNetworkIdle,
    getFullAXTree,
    getNetworkBuffer,
    mergeSnapV2,
    formatAxNodes,
    isAttached: (tabId) => sessions.has(tabId),
  }
})(globalThis)
