// Finance OS Sync — background service worker。
// 扩展不直连 Supabase；经 bridge.js 与 Finance OS 页面通信，由页面写入 Life OS（public schema）。
// 职责：维护 capture 队列（chrome.storage.local）、in-flight（session）、
// DLQ、同步状态；Robinhood 持仓详情后台批量补齐。

importScripts("rhDetailsShared.js");

if (!self.FOS_RH) {
  console.error("[FOS] rhDetailsShared.js 未加载，Robinhood 详情补齐不可用");
}

const QUEUE_KEY = "fos_capture_queue";
const HISTORY_KEY = "fos_capture_history";
const SNAPSHOT_KEY = "fos_app_snapshot";
const DLQ_KEY = "fos_capture_dlq";
const INFLIGHT_KEY = "fos_inflight";
const SYNC_STATE_KEY = "fos_last_sync_state";
const RH_ENRICH_STATE_KEY = "fos_rh_enrich_state";
const QUEUE_MAX = 50;
const HISTORY_MAX = 30;
const DLQ_MAX = 20;
const MAX_DELIVERY_ATTEMPTS = 8;
const INFLIGHT_STALE_MS = 45000;
const RH_DETAIL_TAB_TIMEOUT_MS = 20_000;
const RH_MAX_ENRICH_TICKERS = 30;
const RH_ENRICH_TAB_GAP_MS = 400;

/** @type {Promise<void> | null} */
let rhEnrichChain = null;

// match pattern 无法限定端口，localhost/netlify 通配会命中其它本地应用，
// 因此逐个验证：标题匹配，或页面里的 bridge 确认收到过 Finance OS 的握手。
async function isFinanceOsTab(tab) {
  if (tab.id == null) return false;
  if (typeof tab.title === "string" && tab.title.includes("Finance OS")) {
    return true;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "FOS_PING" });
    return res?.ok === true && res.appReady === true;
  } catch {
    return false;
  }
}

async function focusFinanceOsTab() {
  const tabs = await chrome.tabs.query({
    url: ["http://localhost/*", "http://127.0.0.1/*", "https://*.netlify.app/*"],
  });
  for (const tab of tabs) {
    if (!(await isFinanceOsTab(tab))) continue;
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return tab;
  }
  return chrome.tabs.create({ url: "http://localhost:5173/" });
}

async function getQueue() {
  const obj = await chrome.storage.local.get(QUEUE_KEY);
  return obj[QUEUE_KEY] ?? [];
}

async function setQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-QUEUE_MAX) });
}

async function mutateQueue(mutator) {
  const queue = await getQueue();
  const next = mutator([...queue]);
  await setQueue(Array.isArray(next) ? next : queue);
  return Array.isArray(next) ? next : queue;
}

async function getDlq() {
  const obj = await chrome.storage.local.get(DLQ_KEY);
  return obj[DLQ_KEY] ?? [];
}

async function setDlq(items) {
  await chrome.storage.local.set({ [DLQ_KEY]: items.slice(-DLQ_MAX) });
}

async function getInflightMap() {
  const obj = await chrome.storage.session.get(INFLIGHT_KEY);
  const raw = obj[INFLIGHT_KEY];
  return raw && typeof raw === "object" ? raw : {};
}

async function setInflightMap(map) {
  await chrome.storage.session.set({ [INFLIGHT_KEY]: map });
}

async function appendHistory(entry) {
  const obj = await chrome.storage.local.get(HISTORY_KEY);
  const history = obj[HISTORY_KEY] ?? [];
  history.push(entry);
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(-HISTORY_MAX) });
}

function capturePathname(c) {
  try {
    return new URL(c.pageUrl ?? "").pathname;
  } catch {
    return "";
  }
}

function captureQueueKey(c) {
  return `${c.source}|${c.kind}|${capturePathname(c)}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function localTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function contentHash(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function buildRobinhoodHoldingsCapture(holdings) {
  const asOfDate = todayISO();
  const positions = holdings.positions ?? [];
  const fingerprint = contentHash(
    JSON.stringify({
      source: "robinhood",
      kind: "holdings",
      asOfDate,
      positions: positions.map((p) => [
        p.ticker,
        p.shares,
        p.price,
        p.averageCostPerShare,
        p.todayReturnAmount,
        p.totalReturnAmount,
      ]),
    })
  );
  return {
    v: 1,
    id: `robinhood_holdings_${fingerprint}`,
    source: "robinhood",
    kind: "holdings",
    capturedAt: new Date().toISOString(),
    asOfDate,
    asOfTimeLocal: localTime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pageUrl: "https://robinhood.com/",
    data: {
      institution: holdings.institution ?? "Robinhood",
      accountLabel: holdings.accountLabel ?? "Robinhood individual",
      totalValue: holdings.totalValue,
      positions,
    },
  };
}

async function loadRhDetailsCache() {
  const obj = await chrome.storage.local.get(self.FOS_RH.RH_DETAILS_KEY);
  return obj[self.FOS_RH.RH_DETAILS_KEY] ?? {};
}

async function setRhEnrichState(patch) {
  const obj = await chrome.storage.local.get(RH_ENRICH_STATE_KEY);
  const prev = obj[RH_ENRICH_STATE_KEY] ?? {};
  await chrome.storage.local.set({
    [RH_ENRICH_STATE_KEY]: { ...prev, ...patch, updatedAt: Date.now() },
  });
}

async function enqueueRobinhoodHoldings(holdings) {
  const cache = await loadRhDetailsCache();
  const positions = self.FOS_RH.mergePositionsWithCache(holdings.positions ?? [], cache);
  const capture = buildRobinhoodHoldingsCapture({ ...holdings, positions });
  const newKey = captureQueueKey(capture);
  await mutateQueue((queue) => {
    const filtered = queue.filter((c) => captureQueueKey(c) !== newKey);
    filtered.push(capture);
    return filtered;
  });
  return capture;
}

function waitForDetailSaved(ticker, tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve(result);
    };
    const onMessage = (msg, sender) => {
      if (msg?.type !== "FOS_RH_DETAIL_SAVED") return;
      if (String(msg.ticker ?? "").toUpperCase() !== String(ticker).toUpperCase()) return;
      if (sender.tab?.id !== tabId) return;
      finish({ ok: true, detail: msg.detail });
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    chrome.runtime.onMessage.addListener(onMessage);
  });
}

async function captureDetailInBackgroundTab(ticker) {
  let tab;
  let waitPromise;
  try {
    tab = await chrome.tabs.create({
      url: `https://robinhood.com/stocks/${encodeURIComponent(ticker)}`,
      active: false,
    });
    waitPromise = waitForDetailSaved(ticker, tab.id, RH_DETAIL_TAB_TIMEOUT_MS);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "FOS_RH_FORCE_DETAIL_CAPTURE" });
    } catch {
      // 页面仍在加载，依赖 captureWhenStable
    }
    let result = await waitPromise;
    if (!result.ok) {
      waitPromise = waitForDetailSaved(ticker, tab.id, 12_000);
      await chrome.tabs.reload(tab.id);
      await new Promise((r) => setTimeout(r, 2500));
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "FOS_RH_FORCE_DETAIL_CAPTURE" });
      } catch {
        // ignore
      }
      result = await waitPromise;
    }
    return result.ok;
  } catch {
    return false;
  } finally {
    if (tab?.id != null) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // ignore
      }
    }
    await new Promise((r) => setTimeout(r, RH_ENRICH_TAB_GAP_MS));
  }
}

async function runRhDetailEnrichment(tickers, holdings) {
  const cache = await loadRhDetailsCache();
  const queue = self.FOS_RH.tickersNeedingEnrich(tickers, cache, RH_MAX_ENRICH_TICKERS);
  if (queue.length === 0) {
    await setRhEnrichState({ running: false, done: 0, total: 0, current: null });
    if (holdings) await enqueueRobinhoodHoldings(holdings);
    return { enriched: 0, queued: Boolean(holdings) };
  }

  const state = {
    running: true,
    total: queue.length,
    done: 0,
    current: null,
    failures: [],
    startedAt: Date.now(),
  };
  await setRhEnrichState(state);

  for (const ticker of queue) {
    state.current = ticker;
    await setRhEnrichState({ current: ticker, done: state.done });
    const ok = await captureDetailInBackgroundTab(ticker);
    if (!ok) state.failures.push(ticker);
    state.done += 1;
    await setRhEnrichState({ done: state.done, failures: state.failures });
  }

  await setRhEnrichState({
    running: false,
    current: null,
    finishedAt: Date.now(),
    failures: state.failures,
  });

  if (holdings) {
    await enqueueRobinhoodHoldings(holdings);
    const tab = await focusFinanceOsTab();
    await nudgeFinanceOsTab(tab);
  }

  return { enriched: queue.length, failures: state.failures, queued: Boolean(holdings) };
}

function scheduleRhDetailEnrichment(tickers, holdings) {
  const task = async () => {
    await runRhDetailEnrichment(tickers, holdings);
  };
  rhEnrichChain = (rhEnrichChain ?? Promise.resolve()).then(task, task);
  return rhEnrichChain;
}

async function moveCaptureToDlq(id, reason) {
  const queue = await getQueue();
  const capture = queue.find((c) => c.id === id);
  if (!capture) return false;
  await setQueue(queue.filter((c) => c.id !== id));
  const dlq = await getDlq();
  dlq.push({
    id: capture.id,
    source: capture.source,
    kind: capture.kind,
    capturedAt: capture.capturedAt,
    summary: capture.kind,
    reason,
    dlqAt: new Date().toISOString(),
    capture,
  });
  await setDlq(dlq);
  const inflight = await getInflightMap();
  delete inflight[id];
  await setInflightMap(inflight);
  return true;
}

async function markInflight(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, inflight: {} };
  const inflight = await getInflightMap();
  const now = Date.now();
  for (const id of ids) {
    if (typeof id !== "string" || !id) continue;
    const prev = inflight[id];
    const attempts = (prev?.attempts ?? 0) + 1;
    if (attempts > MAX_DELIVERY_ATTEMPTS) {
      await moveCaptureToDlq(id, `超过 ${MAX_DELIVERY_ATTEMPTS} 次投递仍未 ACK`);
      continue;
    }
    inflight[id] = { sentAt: now, attempts };
  }
  await setInflightMap(inflight);
  return { ok: true, inflight };
}

async function sweepStaleInflight() {
  const inflight = await getInflightMap();
  const now = Date.now();
  let changed = false;
  for (const [id, meta] of Object.entries(inflight)) {
    if (now - (meta?.sentAt ?? 0) < INFLIGHT_STALE_MS) continue;
    const attempts = (meta?.attempts ?? 0) + 1;
    if (attempts > MAX_DELIVERY_ATTEMPTS) {
      await moveCaptureToDlq(id, "投递超时且多次重试仍未 ACK");
    } else {
      inflight[id] = { sentAt: now, attempts };
      changed = true;
    }
  }
  if (changed) await setInflightMap(inflight);
}

async function nudgeFinanceOsTab(tab) {
  if (tab?.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FOS_FORCE_DELIVER" });
  } catch {
    await chrome.tabs.reload(tab.id);
  }
}

async function buildStatusPayload() {
  await sweepStaleInflight();
  const obj = await chrome.storage.local.get([
    QUEUE_KEY,
    HISTORY_KEY,
    SNAPSHOT_KEY,
    DLQ_KEY,
    SYNC_STATE_KEY,
    RH_ENRICH_STATE_KEY,
    self.FOS_RH.RH_DETAILS_KEY,
    "fos_txn_watermark",
  ]);
  const inflight = await getInflightMap();
  const rhDetails = obj[self.FOS_RH.RH_DETAILS_KEY] ?? {};
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
  };
}

async function enrichFromLatestQueueHoldings() {
  const queue = await getQueue();
  const latest = [...queue]
    .reverse()
    .find((c) => c.source === "robinhood" && c.kind === "holdings");
  if (!latest?.data?.positions?.length) {
    return { ok: false, error: "no_robinhood_holdings" };
  }
  const tickers = latest.data.positions.map((p) => p.ticker).filter(Boolean);
  void scheduleRhDetailEnrichment(tickers, {
    institution: latest.data.institution,
    accountLabel: latest.data.accountLabel,
    totalValue: latest.data.totalValue,
    positions: latest.data.positions,
  });
  return { ok: true, tickers: tickers.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "FOS_ENQUEUE": {
        const capture = msg.capture;
        if (!capture?.id) {
          sendResponse({ ok: false, error: "missing capture" });
          break;
        }
        const newKey = captureQueueKey(capture);
        const queued = await mutateQueue((queue) => {
          const filtered = queue.filter((c) => captureQueueKey(c) !== newKey);
          filtered.push(capture);
          return filtered;
        });
        sendResponse({ ok: true, queued: queued.length });
        break;
      }
      case "FOS_RH_START_ENRICH": {
        const tickers = Array.isArray(msg.tickers) ? msg.tickers : [];
        const holdings = msg.holdings ?? null;
        void scheduleRhDetailEnrichment(tickers, holdings);
        sendResponse({ ok: true, scheduled: tickers.length });
        break;
      }
      case "FOS_RH_ENRICH_MANUAL": {
        sendResponse(await enrichFromLatestQueueHoldings());
        break;
      }
      case "FOS_PULL": {
        sendResponse({ ok: true, captures: await getQueue() });
        break;
      }
      case "FOS_MARK_INFLIGHT": {
        sendResponse(await markInflight(msg.ids));
        break;
      }
      case "FOS_GET_INFLIGHT": {
        const inflight = await getInflightMap();
        sendResponse({ ok: true, ids: Object.keys(inflight) });
        break;
      }
      case "FOS_ACK": {
        const queue = await getQueue();
        const done = queue.find((c) => c.id === msg.id);
        await setQueue(queue.filter((c) => c.id !== msg.id));
        const inflight = await getInflightMap();
        delete inflight[msg.id];
        await setInflightMap(inflight);
        if (done) {
          await appendHistory({
            id: done.id,
            source: done.source,
            kind: done.kind,
            capturedAt: done.capturedAt,
            syncedAt: new Date().toISOString(),
          });
          if (done.kind === "transactions" && done.data?.complete === true) {
            const dates = (done.data?.rows ?? [])
              .filter((r) => !r.pending)
              .map((r) => r.date)
              .sort();
            const max = dates[dates.length - 1];
            if (max) {
              const { fos_txn_watermark: cur } =
                await chrome.storage.local.get("fos_txn_watermark");
              if (!cur || max > cur) {
                await chrome.storage.local.set({ fos_txn_watermark: max });
              }
            }
          }
        }
        sendResponse({ ok: true });
        break;
      }
      case "FOS_SYNC_RESULT": {
        const result = msg.result;
        if (result && typeof result === "object") {
          await chrome.storage.local.set({
            [SYNC_STATE_KEY]: {
              ...result,
              at: result.at ?? new Date().toISOString(),
            },
          });
        }
        sendResponse({ ok: true });
        break;
      }
      case "FOS_RETRY_DLQ": {
        const dlq = await getDlq();
        if (dlq.length === 0) {
          sendResponse({ ok: true, retried: 0 });
          break;
        }
        const queue = await getQueue();
        const existingKeys = new Set(queue.map(captureQueueKey));
        const toRequeue = dlq
          .map((d) => d.capture)
          .filter((c) => c?.id && !existingKeys.has(captureQueueKey(c)));
        await setDlq([]);
        if (toRequeue.length > 0) {
          await mutateQueue((q) => [...q, ...toRequeue]);
        }
        const inflight = await getInflightMap();
        for (const c of toRequeue) delete inflight[c.id];
        await setInflightMap(inflight);
        sendResponse({ ok: true, retried: toRequeue.length });
        break;
      }
      case "FOS_CLEAR_DLQ": {
        await setDlq([]);
        sendResponse({ ok: true });
        break;
      }
      case "FOS_CRAWL_ROCKETMONEY": {
        const tabs = await chrome.tabs.query({ url: "https://app.rocketmoney.com/*" });
        if (tabs.length > 0) {
          const tab = tabs[0];
          await chrome.tabs.update(tab.id, { active: true });
          if (tab.windowId != null) {
            await chrome.windows.update(tab.windowId, { focused: true });
          }
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "FOS_START_CRAWL" });
          } catch {
            await chrome.storage.local.set({ fos_pending_crawl: "rocketmoney" });
            await chrome.tabs.reload(tab.id);
          }
        } else {
          await chrome.storage.local.set({ fos_pending_crawl: "rocketmoney" });
          await chrome.tabs.create({ url: "https://app.rocketmoney.com/dashboard" });
        }
        sendResponse({ ok: true });
        break;
      }
      case "FOS_STORE_SNAPSHOT": {
        const snap = msg.snapshot;
        if (
          snap?.v === 1 &&
          typeof snap.exportedAt === "string" &&
          Array.isArray(snap.accounts) &&
          Array.isArray(snap.txnKeys)
        ) {
          await chrome.storage.local.set({ [SNAPSHOT_KEY]: snap });
        }
        sendResponse({ ok: true });
        break;
      }
      case "FOS_OPEN_APP": {
        const tab = await focusFinanceOsTab();
        await nudgeFinanceOsTab(tab);
        sendResponse({ ok: true });
        break;
      }
      case "FOS_REQUEST_SNAPSHOT": {
        const tab = await focusFinanceOsTab();
        await nudgeFinanceOsTab(tab);
        sendResponse({ ok: true });
        break;
      }
      case "FOS_STATUS": {
        sendResponse(await buildStatusPayload());
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true;
});
