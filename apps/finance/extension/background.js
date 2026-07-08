// Finance OS Sync — background service worker。
// 扩展不直连 Supabase；经 bridge.js 与 Finance OS 页面通信，由页面写入 Life OS（public schema）。
// 职责：维护 capture 队列（chrome.storage.local）、in-flight（session）、
// DLQ、同步状态；Robinhood 持仓详情后台批量补齐。

importScripts('rhDetailsShared.js')

if (!self.FOS_RH) {
  console.error('[FOS] rhDetailsShared.js 未加载，Robinhood 详情补齐不可用')
}

const QUEUE_KEY = 'fos_capture_queue'
const HISTORY_KEY = 'fos_capture_history'
const SNAPSHOT_KEY = 'fos_app_snapshot'
const DLQ_KEY = 'fos_capture_dlq'
const INFLIGHT_KEY = 'fos_inflight'
const SYNC_STATE_KEY = 'fos_last_sync_state'
const RH_ENRICH_STATE_KEY = 'fos_rh_enrich_state'
const RH_LAST_HOLDINGS_KEY = 'fos_rh_last_holdings'
const QUEUE_MAX = 50
const HISTORY_MAX = 30
const DLQ_MAX = 20
const MAX_DELIVERY_ATTEMPTS = 8
const INFLIGHT_STALE_MS = 45000
const RH_DETAIL_TAB_TIMEOUT_MS = 20_000
const RH_MAX_ENRICH_TICKERS = 30
const RH_ENRICH_TAB_GAP_MS = 400

/** @type {Promise<void> | null} */
let rhEnrichChain = null

const FINANCE_OS_PRODUCTION_URL = 'https://finance.kenos.space/home/today'
const FINANCE_OS_PRODUCTION_HOSTS = [
  'finance.kenos.space',
  'kensfinanceos.netlify.app',
]
const TAB_EDIT_RETRY_ATTEMPTS = 8
const TAB_EDIT_RETRY_MS = 250

function isTabEditBlockedError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /tabs cannot be edited/i.test(msg) || /dragging a tab/i.test(msg)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Chrome 在用户拖拽标签页时会 transient 拒绝 tabs/windows 变更。 */
async function withTabEditRetry(
  fn,
  { attempts = TAB_EDIT_RETRY_ATTEMPTS, delayMs = TAB_EDIT_RETRY_MS } = {},
) {
  let lastErr
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTabEditBlockedError(err) || i >= attempts - 1) throw err
      await sleep(delayMs * (i + 1))
    }
  }
  throw lastErr
}

function safeTabsUpdate(tabId, updateProperties) {
  return withTabEditRetry(() => chrome.tabs.update(tabId, updateProperties))
}

function safeTabsCreate(createProperties) {
  return withTabEditRetry(() => chrome.tabs.create(createProperties))
}

function safeTabsReload(tabId, reloadProperties) {
  return withTabEditRetry(() => chrome.tabs.reload(tabId, reloadProperties))
}

function safeTabsRemove(tabIds) {
  return withTabEditRetry(() => chrome.tabs.remove(tabIds))
}

function safeWindowsUpdate(windowId, updateProperties) {
  return withTabEditRetry(() =>
    chrome.windows.update(windowId, updateProperties),
  )
}

async function tryFocusTab(tab) {
  if (tab?.id == null) return false
  try {
    await safeTabsUpdate(tab.id, { active: true })
    if (tab.windowId != null) {
      await safeWindowsUpdate(tab.windowId, { focused: true })
    }
    return true
  } catch (err) {
    if (isTabEditBlockedError(err)) {
      console.warn('[FOS] tab focus skipped (user may be dragging a tab)')
      return false
    }
    throw err
  }
}

// match pattern 无法限定端口，localhost/netlify 通配会命中其它 Life OS 应用，
// 因此逐个验证：生产域名 / 标题 / bridge 握手。
function isFinanceOsTitle(title) {
  if (typeof title !== 'string' || !title) return false
  const upper = title.toUpperCase()
  return upper.includes('FINANCE.OS') || upper.includes('FINANCE OS')
}

function isFinanceOsProductionUrl(url) {
  try {
    return FINANCE_OS_PRODUCTION_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

async function isFinanceOsTab(tab) {
  if (tab.id == null) return false
  if (isFinanceOsProductionUrl(tab.url ?? '')) return true
  if (isFinanceOsTitle(tab.title)) return true
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'FOS_PING' })
    // bridge 已注入且 Finance OS React 桥已就绪（其它 Netlify 子站仅有 bridge、无 appReady）
    return res?.ok === true && res.appReady === true
  } catch {
    return false
  }
}

async function focusFinanceOsTab() {
  const tabs = await chrome.tabs.query({
    url: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://finance.kenos.space/*',
      'https://*.netlify.app/*',
    ],
  })
  const ranked = [...tabs].sort((a, b) => {
    const score = (t) => {
      if (isFinanceOsProductionUrl(t.url ?? '')) return 0
      if (isFinanceOsTitle(t.title)) return 1
      return 2
    }
    return score(a) - score(b)
  })
  for (const tab of ranked) {
    if (!(await isFinanceOsTab(tab))) continue
    await tryFocusTab(tab)
    if (tab.url) {
      await chrome.storage.local.set({ fos_preferred_app_url: tab.url })
    }
    return tab
  }
  // 优先开生产站；本地 dev 未启动时 localhost:5173 会显示空白页。
  const fallback =
    (await chrome.storage.local.get('fos_preferred_app_url'))
      .fos_preferred_app_url ?? FINANCE_OS_PRODUCTION_URL
  try {
    return await safeTabsCreate({ url: fallback })
  } catch (err) {
    if (isTabEditBlockedError(err)) {
      console.warn(
        '[FOS] Finance OS tab create skipped (user may be dragging a tab)',
      )
      return null
    }
    throw err
  }
}

async function getQueue() {
  const obj = await chrome.storage.local.get(QUEUE_KEY)
  return obj[QUEUE_KEY] ?? []
}

async function setQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-QUEUE_MAX) })
}

async function mutateQueue(mutator) {
  const queue = await getQueue()
  const prev = [...queue]
  const next = mutator([...queue])
  const resolved = Array.isArray(next) ? next : queue
  const removedIds = prev
    .filter((c) => !resolved.some((n) => n.id === c.id))
    .map((c) => c.id)
  if (removedIds.length > 0) {
    await releaseInflightIds(removedIds)
  }
  await setQueue(resolved)
  return resolved
}

async function releaseInflightIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const inflight = await getInflightMap()
  let changed = false
  for (const id of ids) {
    if (inflight[id]) {
      delete inflight[id]
      changed = true
    }
  }
  if (changed) await setInflightMap(inflight)
}

/** 清空全部 in-flight，便于「打开 Finance OS 并同步」时重新投递。 */
async function clearAllInflight() {
  await setInflightMap({})
}

async function releaseInflightForQueue() {
  const inflight = await getInflightMap()
  const queue = await getQueue()
  const queueIds = new Set(queue.map((c) => c.id))
  const toRelease = Object.keys(inflight).filter((id) => queueIds.has(id))
  await releaseInflightIds(toRelease)
}

async function getDlq() {
  const obj = await chrome.storage.local.get(DLQ_KEY)
  return obj[DLQ_KEY] ?? []
}

async function setDlq(items) {
  await chrome.storage.local.set({ [DLQ_KEY]: items.slice(-DLQ_MAX) })
}

async function getInflightMap() {
  const obj = await chrome.storage.session.get(INFLIGHT_KEY)
  const raw = obj[INFLIGHT_KEY]
  return raw && typeof raw === 'object' ? raw : {}
}

async function setInflightMap(map) {
  await chrome.storage.session.set({ [INFLIGHT_KEY]: map })
}

async function appendHistory(entry) {
  const obj = await chrome.storage.local.get(HISTORY_KEY)
  const history = obj[HISTORY_KEY] ?? []
  history.push(entry)
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(-HISTORY_MAX) })
}

function capturePathname(c) {
  try {
    return new URL(c.pageUrl ?? '').pathname
  } catch {
    return ''
  }
}

function captureQueueKey(c) {
  return `${c.source}|${c.kind}|${capturePathname(c)}`
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function localTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function contentHash(text) {
  let h = 2166136261
  const s = String(text)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function buildRobinhoodHoldingsCapture(holdings) {
  const asOfDate = todayISO()
  const positions = holdings.positions ?? []
  const fingerprint = contentHash(
    JSON.stringify({
      source: 'robinhood',
      kind: 'holdings',
      asOfDate,
      positions: positions.map((p) => [
        p.ticker,
        p.shares,
        p.price,
        p.averageCostPerShare,
        p.todayReturnAmount,
        p.totalReturnAmount,
      ]),
    }),
  )
  return {
    v: 1,
    id: `robinhood_holdings_${fingerprint}`,
    source: 'robinhood',
    kind: 'holdings',
    capturedAt: new Date().toISOString(),
    asOfDate,
    asOfTimeLocal: localTime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pageUrl: 'https://robinhood.com/',
    data: {
      institution: holdings.institution ?? 'Robinhood',
      accountLabel: holdings.accountLabel ?? 'Robinhood individual',
      totalValue: holdings.totalValue,
      positions,
    },
  }
}

async function loadRhDetailsCache() {
  const obj = await chrome.storage.local.get(self.FOS_RH.RH_DETAILS_KEY)
  return obj[self.FOS_RH.RH_DETAILS_KEY] ?? {}
}

async function setRhEnrichState(patch) {
  const obj = await chrome.storage.local.get(RH_ENRICH_STATE_KEY)
  const prev = obj[RH_ENRICH_STATE_KEY] ?? {}
  await chrome.storage.local.set({
    [RH_ENRICH_STATE_KEY]: { ...prev, ...patch, updatedAt: Date.now() },
  })
}

async function enqueueRobinhoodHoldings(holdings) {
  const cache = await loadRhDetailsCache()
  const positions = self.FOS_RH.mergePositionsWithCache(
    holdings.positions ?? [],
    cache,
  )
  const capture = buildRobinhoodHoldingsCapture({ ...holdings, positions })
  const newKey = captureQueueKey(capture)
  await mutateQueue((queue) => {
    const filtered = queue.filter((c) => captureQueueKey(c) !== newKey)
    filtered.push(capture)
    return filtered
  })
  return capture
}

function waitForDetailSaved(ticker, tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.runtime.onMessage.removeListener(onMessage)
      resolve(result)
    }
    const onMessage = (msg, sender) => {
      if (msg?.type !== 'FOS_RH_DETAIL_SAVED') return
      if (
        String(msg.ticker ?? '').toUpperCase() !== String(ticker).toUpperCase()
      )
        return
      if (sender.tab?.id !== tabId) return
      finish({ ok: true, detail: msg.detail })
    }
    const timer = setTimeout(
      () => finish({ ok: false, reason: 'timeout' }),
      timeoutMs,
    )
    chrome.runtime.onMessage.addListener(onMessage)
  })
}

async function resolveRobinhoodEnrichTab() {
  const tabs = await chrome.tabs.query({ url: 'https://robinhood.com/*' })
  const listTab = tabs.find((t) =>
    /robinhood\.com\/?(?:\?.*)?$/i.test(t.url ?? ''),
  )
  const anyTab = tabs.find((t) => /robinhood\.com/i.test(t.url ?? ''))
  if (listTab?.id != null) return { tabId: listTab.id, created: false }
  if (anyTab?.id != null) return { tabId: anyTab.id, created: false }
  const tab = await safeTabsCreate({
    url: 'https://robinhood.com/',
    active: false,
  })
  if (tab?.id == null) throw new Error('Failed to open Robinhood tab')
  await new Promise((r) => setTimeout(r, 2500))
  return { tabId: tab.id, created: true }
}

async function captureDetailInTab(tabId, ticker) {
  const url = `https://robinhood.com/stocks/${encodeURIComponent(ticker)}`
  let waitPromise = waitForDetailSaved(ticker, tabId, RH_DETAIL_TAB_TIMEOUT_MS)
  try {
    await safeTabsUpdate(tabId, { url, active: false })
    await new Promise((r) => setTimeout(r, 2000))
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'FOS_RH_FORCE_DETAIL_CAPTURE',
      })
    } catch {
      // 页面仍在加载，依赖 captureWhenStable
    }
    let result = await waitPromise
    if (!result.ok) {
      waitPromise = waitForDetailSaved(ticker, tabId, 12_000)
      await safeTabsReload(tabId)
      await new Promise((r) => setTimeout(r, 2500))
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'FOS_RH_FORCE_DETAIL_CAPTURE',
        })
      } catch {
        // ignore
      }
      result = await waitPromise
    }
    return result.ok
  } catch {
    return false
  } finally {
    await new Promise((r) => setTimeout(r, RH_ENRICH_TAB_GAP_MS))
  }
}

async function runRhDetailEnrichment(tickers, holdings) {
  const cache = await loadRhDetailsCache()
  const queue = self.FOS_RH.tickersNeedingEnrich(
    tickers,
    cache,
    RH_MAX_ENRICH_TICKERS,
  )
  if (queue.length === 0) {
    await setRhEnrichState({ running: false, done: 0, total: 0, current: null })
    if (holdings) await enqueueRobinhoodHoldings(holdings)
    return { enriched: 0, queued: Boolean(holdings) }
  }

  const state = {
    running: true,
    total: queue.length,
    done: 0,
    current: null,
    failures: [],
    startedAt: Date.now(),
  }
  await setRhEnrichState(state)

  let enrichTab
  try {
    enrichTab = await resolveRobinhoodEnrichTab()
  } catch {
    await setRhEnrichState({
      running: false,
      current: null,
      finishedAt: Date.now(),
      failures: queue,
    })
    if (holdings) await enqueueRobinhoodHoldings(holdings)
    return { enriched: 0, queued: Boolean(holdings), failures: queue }
  }

  for (const ticker of queue) {
    state.current = ticker
    await setRhEnrichState({ current: ticker, done: state.done })
    const ok = await captureDetailInTab(enrichTab.tabId, ticker)
    if (!ok) state.failures.push(ticker)
    state.done += 1
    await setRhEnrichState({ done: state.done, failures: state.failures })
  }

  if (enrichTab.created) {
    try {
      await safeTabsRemove(enrichTab.tabId)
    } catch {
      // ignore
    }
  } else {
    try {
      await safeTabsUpdate(enrichTab.tabId, {
        url: 'https://robinhood.com/',
        active: false,
      })
    } catch {
      // ignore
    }
  }

  await setRhEnrichState({
    running: false,
    current: null,
    finishedAt: Date.now(),
    failures: state.failures,
  })

  if (holdings) {
    await enqueueRobinhoodHoldings(holdings)
    const tab = await focusFinanceOsTab()
    await nudgeFinanceOsTab(tab)
  }

  return {
    enriched: queue.length,
    failures: state.failures,
    queued: Boolean(holdings),
  }
}

function scheduleRhDetailEnrichment(tickers, holdings) {
  const task = async () => {
    await runRhDetailEnrichment(tickers, holdings)
  }
  rhEnrichChain = (rhEnrichChain ?? Promise.resolve()).then(task, task)
  return rhEnrichChain
}

async function moveCaptureToDlq(id, reason) {
  const queue = await getQueue()
  const capture = queue.find((c) => c.id === id)
  if (!capture) return false
  await setQueue(queue.filter((c) => c.id !== id))
  const dlq = await getDlq()
  dlq.push({
    id: capture.id,
    source: capture.source,
    kind: capture.kind,
    capturedAt: capture.capturedAt,
    summary: capture.kind,
    reason,
    dlqAt: new Date().toISOString(),
    capture,
  })
  await setDlq(dlq)
  const inflight = await getInflightMap()
  delete inflight[id]
  await setInflightMap(inflight)
  return true
}

async function markInflight(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, inflight: {} }
  const inflight = await getInflightMap()
  const now = Date.now()
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue
    const prev = inflight[id]
    const attempts = (prev?.attempts ?? 0) + 1
    if (attempts > MAX_DELIVERY_ATTEMPTS) {
      await moveCaptureToDlq(id, `超过 ${MAX_DELIVERY_ATTEMPTS} 次投递仍未 ACK`)
      continue
    }
    inflight[id] = { sentAt: now, attempts }
  }
  await setInflightMap(inflight)
  return { ok: true, inflight }
}

async function sweepStaleInflight() {
  const inflight = await getInflightMap()
  const queue = await getQueue()
  const queueIds = new Set(queue.map((c) => c.id))
  const now = Date.now()
  let changed = false
  for (const [id, meta] of Object.entries(inflight)) {
    if (!queueIds.has(id)) {
      delete inflight[id]
      changed = true
      continue
    }
    if (now - (meta?.sentAt ?? 0) < INFLIGHT_STALE_MS) continue
    const attempts = (meta?.attempts ?? 0) + 1
    if (attempts > MAX_DELIVERY_ATTEMPTS) {
      await moveCaptureToDlq(id, '投递超时且多次重试仍未 ACK')
    } else {
      delete inflight[id]
      changed = true
    }
  }
  if (changed) await setInflightMap(inflight)
}

async function nudgeFinanceOsTab(tab) {
  if (tab?.id == null) return
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'FOS_FORCE_DELIVER' })
  } catch {
    try {
      await safeTabsReload(tab.id)
    } catch (err) {
      if (!isTabEditBlockedError(err)) throw err
      console.warn(
        '[FOS] Finance OS reload skipped (user may be dragging a tab)',
      )
    }
  }
}

async function buildStatusPayload() {
  await sweepStaleInflight()
  const obj = await chrome.storage.local.get([
    QUEUE_KEY,
    HISTORY_KEY,
    SNAPSHOT_KEY,
    DLQ_KEY,
    SYNC_STATE_KEY,
    RH_ENRICH_STATE_KEY,
    self.FOS_RH.RH_DETAILS_KEY,
    'fos_txn_watermark',
  ])
  const inflight = await getInflightMap()
  const rhDetails = obj[self.FOS_RH.RH_DETAILS_KEY] ?? {}
  return {
    ok: true,
    queue: obj[QUEUE_KEY] ?? [],
    history: obj[HISTORY_KEY] ?? [],
    snapshot: obj[SNAPSHOT_KEY] ?? null,
    txnWatermark: obj.fos_txn_watermark ?? null,
    dlq: obj[DLQ_KEY] ?? [],
    rhEnrich: obj[RH_ENRICH_STATE_KEY] ?? null,
    rhDetailsCount: Object.keys(rhDetails).length,
    inFlight: Object.entries(inflight).map(([id, meta]) => ({
      id,
      sentAt: meta.sentAt,
      attempts: meta.attempts,
    })),
    lastSync: obj[SYNC_STATE_KEY] ?? null,
  }
}

async function saveLastRhHoldings(holdings) {
  if (!holdings?.positions?.length) return
  await chrome.storage.local.set({
    [RH_LAST_HOLDINGS_KEY]: {
      ...holdings,
      savedAt: new Date().toISOString(),
    },
  })
}

async function resolveRhHoldingsPayload() {
  const queue = await getQueue()
  const fromQueue = [...queue]
    .reverse()
    .find((c) => c.source === 'robinhood' && c.kind === 'holdings')
  if (fromQueue?.data?.positions?.length) {
    return {
      institution: fromQueue.data.institution,
      accountLabel: fromQueue.data.accountLabel,
      totalValue: fromQueue.data.totalValue,
      positions: fromQueue.data.positions,
      source: 'queue',
    }
  }
  const obj = await chrome.storage.local.get(RH_LAST_HOLDINGS_KEY)
  const stored = obj[RH_LAST_HOLDINGS_KEY]
  if (stored?.positions?.length) {
    return {
      institution: stored.institution,
      accountLabel: stored.accountLabel,
      totalValue: stored.totalValue,
      positions: stored.positions,
      source: 'storage',
    }
  }
  return null
}

async function enrichFromLatestQueueHoldings() {
  const holdings = await resolveRhHoldingsPayload()
  if (!holdings) {
    return { ok: false, error: 'no_robinhood_holdings' }
  }
  const tickers = holdings.positions.map((p) => p.ticker).filter(Boolean)
  void scheduleRhDetailEnrichment(tickers, {
    institution: holdings.institution,
    accountLabel: holdings.accountLabel,
    totalValue: holdings.totalValue,
    positions: holdings.positions,
  })
  return { ok: true, tickers: tickers.length, source: holdings.source }
}

const RH_LIST_URL = 'https://robinhood.com/'

function isRobinhoodListUrl(url) {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname !== 'robinhood.com' && hostname !== 'www.robinhood.com') {
      return false
    }
    const p = pathname.replace(/\/$/, '') || '/'
    return p === '/' || p === '/account'
  } catch {
    return false
  }
}

async function sendTabMessageWithRetry(
  tabId,
  message,
  { attempts = 12, baseDelayMs = 500 } = {},
) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message)
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)))
    }
  }
  throw lastErr
}

async function focusRobinhoodTab(tab) {
  if (tab?.id == null) return tab
  await tryFocusTab(tab)
  return tab
}

async function openRobinhoodListTab() {
  const tabs = await chrome.tabs.query({ url: 'https://robinhood.com/*' })
  const listTab = tabs.find((t) => isRobinhoodListUrl(t.url ?? ''))
  const tab = listTab ?? tabs[0]
  if (tab?.id != null) {
    let navigated = false
    if (!isRobinhoodListUrl(tab.url ?? '')) {
      navigated = true
      await safeTabsUpdate(tab.id, { url: RH_LIST_URL, active: true })
    } else {
      await focusRobinhoodTab(tab)
    }
    if (tab.windowId != null) {
      try {
        await safeWindowsUpdate(tab.windowId, { focused: true })
      } catch (err) {
        if (!isTabEditBlockedError(err)) throw err
      }
    }
    return { tab: await chrome.tabs.get(tab.id), navigated }
  }
  const created = await safeTabsCreate({ url: RH_LIST_URL, active: true })
  return { tab: created, navigated: true }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      switch (msg?.type) {
        case 'FOS_ENQUEUE': {
          const capture = msg.capture
          if (!capture?.id) {
            sendResponse({ ok: false, error: 'missing capture' })
            break
          }
          const newKey = captureQueueKey(capture)
          const queued = await mutateQueue((queue) => {
            const filtered = queue.filter((c) => captureQueueKey(c) !== newKey)
            filtered.push(capture)
            return filtered
          })
          if (capture.source === 'robinhood' && capture.kind === 'holdings') {
            await saveLastRhHoldings(capture.data)
          }
          sendResponse({ ok: true, queued: queued.length })
          break
        }
        case 'FOS_RH_START_ENRICH': {
          const tickers = Array.isArray(msg.tickers) ? msg.tickers : []
          const holdings = msg.holdings ?? null
          if (holdings) await saveLastRhHoldings(holdings)
          void scheduleRhDetailEnrichment(tickers, holdings)
          sendResponse({ ok: true, scheduled: tickers.length })
          break
        }
        case 'FOS_RH_ENRICH_MANUAL': {
          sendResponse(await enrichFromLatestQueueHoldings())
          break
        }
        case 'FOS_CAPTURE_ROBINHOOD': {
          const { tab, navigated } = await openRobinhoodListTab()
          if (tab?.id == null) {
            sendResponse({ ok: false, error: 'no_tab' })
            break
          }
          if (navigated) {
            await new Promise((r) => setTimeout(r, 1200))
          }
          try {
            const res = await sendTabMessageWithRetry(tab.id, {
              type: 'FOS_RH_FORCE_LIST_CAPTURE',
              waitForReady: true,
            })
            await chrome.storage.local.remove('fos_pending_crawl')
            sendResponse({
              ok: true,
              tabId: tab.id,
              positions: res?.positions ?? 0,
              isListPage: res?.isListPage ?? false,
            })
          } catch {
            const { fos_pending_crawl } =
              await chrome.storage.local.get('fos_pending_crawl')
            if (fos_pending_crawl !== 'robinhood') {
              await chrome.storage.local.set({ fos_pending_crawl: 'robinhood' })
              try {
                await safeTabsReload(tab.id)
              } catch (err) {
                if (!isTabEditBlockedError(err)) throw err
              }
              sendResponse({ ok: true, tabId: tab.id, pendingReload: true })
            } else {
              sendResponse({
                ok: false,
                error: 'content_script_unreachable',
                tabId: tab.id,
              })
            }
          }
          break
        }
        case 'FOS_PULL': {
          sendResponse({ ok: true, captures: await getQueue() })
          break
        }
        case 'FOS_MARK_INFLIGHT': {
          sendResponse(await markInflight(msg.ids))
          break
        }
        case 'FOS_GET_INFLIGHT': {
          const inflight = await getInflightMap()
          sendResponse({ ok: true, ids: Object.keys(inflight) })
          break
        }
        case 'FOS_ACK': {
          const queue = await getQueue()
          const done = queue.find((c) => c.id === msg.id)
          await setQueue(queue.filter((c) => c.id !== msg.id))
          const inflight = await getInflightMap()
          delete inflight[msg.id]
          await setInflightMap(inflight)
          if (done) {
            await appendHistory({
              id: done.id,
              source: done.source,
              kind: done.kind,
              capturedAt: done.capturedAt,
              syncedAt: new Date().toISOString(),
            })
            if (done.kind === 'transactions' && done.data?.complete === true) {
              const dates = (done.data?.rows ?? [])
                .filter((r) => !r.pending)
                .map((r) => r.date)
                .sort()
              const max = dates[dates.length - 1]
              if (max) {
                const { fos_txn_watermark: cur } =
                  await chrome.storage.local.get('fos_txn_watermark')
                if (!cur || max > cur) {
                  await chrome.storage.local.set({ fos_txn_watermark: max })
                }
              }
            }
          }
          sendResponse({ ok: true })
          break
        }
        case 'FOS_SYNC_RESULT': {
          const result = msg.result
          if (result && typeof result === 'object') {
            await chrome.storage.local.set({
              [SYNC_STATE_KEY]: {
                ...result,
                at: result.at ?? new Date().toISOString(),
              },
            })
            if (result.failed > 0) {
              if (Array.isArray(result.failedEnvelopeIds)) {
                await releaseInflightIds(result.failedEnvelopeIds)
              } else {
                await releaseInflightForQueue()
              }
              const tab = await focusFinanceOsTab()
              await nudgeFinanceOsTab(tab)
            }
          }
          sendResponse({ ok: true })
          break
        }
        case 'FOS_RETRY_DLQ': {
          const dlq = await getDlq()
          if (dlq.length === 0) {
            sendResponse({ ok: true, retried: 0 })
            break
          }
          const queue = await getQueue()
          const existingKeys = new Set(queue.map(captureQueueKey))
          const toRequeue = dlq
            .map((d) => d.capture)
            .filter((c) => c?.id && !existingKeys.has(captureQueueKey(c)))
          await setDlq([])
          if (toRequeue.length > 0) {
            await mutateQueue((q) => [...q, ...toRequeue])
          }
          const inflight = await getInflightMap()
          for (const c of toRequeue) delete inflight[c.id]
          await setInflightMap(inflight)
          sendResponse({ ok: true, retried: toRequeue.length })
          break
        }
        case 'FOS_CLEAR_DLQ': {
          await setDlq([])
          sendResponse({ ok: true })
          break
        }
        case 'FOS_CRAWL_ROCKETMONEY': {
          const tabs = await chrome.tabs.query({
            url: 'https://app.rocketmoney.com/*',
          })
          if (tabs.length > 0) {
            const tab = tabs[0]
            await tryFocusTab(tab)
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'FOS_START_CRAWL' })
            } catch {
              await chrome.storage.local.set({
                fos_pending_crawl: 'rocketmoney',
              })
              try {
                await safeTabsReload(tab.id)
              } catch (err) {
                if (!isTabEditBlockedError(err)) throw err
              }
            }
          } else {
            await chrome.storage.local.set({ fos_pending_crawl: 'rocketmoney' })
            await safeTabsCreate({
              url: 'https://app.rocketmoney.com/dashboard',
            })
          }
          sendResponse({ ok: true })
          break
        }
        case 'FOS_STORE_SNAPSHOT': {
          const snap = msg.snapshot
          if (
            snap?.v === 1 &&
            typeof snap.exportedAt === 'string' &&
            Array.isArray(snap.accounts) &&
            Array.isArray(snap.txnKeys)
          ) {
            await chrome.storage.local.set({ [SNAPSHOT_KEY]: snap })
          }
          sendResponse({ ok: true })
          break
        }
        case 'FOS_OPEN_APP': {
          await clearAllInflight()
          const tab = await focusFinanceOsTab()
          await nudgeFinanceOsTab(tab)
          sendResponse({ ok: true, releasedInflight: true })
          break
        }
        case 'FOS_RELEASE_INFLIGHT': {
          await clearAllInflight()
          const tab = await focusFinanceOsTab()
          await nudgeFinanceOsTab(tab)
          sendResponse({ ok: true })
          break
        }
        case 'FOS_REQUEST_SNAPSHOT': {
          const tab = await focusFinanceOsTab()
          await nudgeFinanceOsTab(tab)
          sendResponse({ ok: true })
          break
        }
        case 'FOS_STATUS': {
          sendResponse(await buildStatusPayload())
          break
        }
        default:
          sendResponse({ ok: false, error: 'unknown message' })
      }
    } catch (err) {
      console.warn('[FOS] background handler error:', msg?.type, err)
      try {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      } catch {
        // response channel may already be closed
      }
    }
  })().catch((err) => {
    console.warn('[FOS] background unhandled:', err)
  })
  return true
})
