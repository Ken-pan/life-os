// financeOS 页面上的桥接 content script。
// 把 background 队列中的 captures 投递给 app（ExtensionSyncBridge），并转发 ACK。
// 扩展不持有 Supabase 凭证；同步目标为 Life OS 项目中的 Finance 数据（public schema）。
// in-flight 状态持久化在 chrome.storage.session（经 background），扩展 reload 可恢复。

(() => {
  const MSG = {
    hello: "FOS_BRIDGE_HELLO",
    requestSnapshot: "FOS_BRIDGE_REQUEST_SNAPSHOT",
    snapshot: "FOS_BRIDGE_SNAPSHOT",
    captures: "FOS_BRIDGE_CAPTURES",
    ack: "FOS_BRIDGE_ACK",
    ready: "FOS_BRIDGE_READY",
    syncResult: "FOS_BRIDGE_SYNC_RESULT",
  };
  const EVT = {
    hello: "FOS_BRIDGE_HELLO",
    requestSnapshot: "FOS_BRIDGE_REQUEST_SNAPSHOT",
    snapshot: "FOS_BRIDGE_SNAPSHOT",
    captures: "FOS_BRIDGE_CAPTURES",
    ack: "FOS_BRIDGE_ACK",
    ready: "FOS_BRIDGE_READY",
    syncResult: "FOS_BRIDGE_SYNC_RESULT",
  };

  let delivering = false;
  let retryTimer = null;
  let appReady = false;

  // 扩展重载后，残留在页面里的旧 content script 会失去 chrome.runtime（孤儿脚本）。
  // 所有与 background 的通信都必须先检查，否则页面消息一到就抛 TypeError。
  function extAlive() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  async function sendToBackground(message) {
    if (!extAlive()) {
      stopRetry();
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
      console.debug("[FOS bridge] sendMessage 失败 — 扩展可能已重载，请刷新本页", e);
      return null;
    }
  }

  async function inFlightIds() {
    const res = await sendToBackground({ type: "FOS_GET_INFLIGHT" });
    return new Set(res?.ids ?? []);
  }

  async function queueLen() {
    const res = await sendToBackground({ type: "FOS_PULL" });
    return res?.ok ? res.captures?.length ?? 0 : 0;
  }

  function stopRetry() {
    if (retryTimer != null) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry() {
    if (retryTimer != null) return;
    retryTimer = setInterval(() => {
      if (!extAlive()) {
        stopRetry();
        return;
      }
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const inflight = await inFlightIds();
        const n = await queueLen();
        if (n > 0 || inflight.size > 0) {
          void deliver();
          return;
        }
        stopRetry();
      })();
    }, 2500);
  }

  async function deliver() {
    // bridge 注入所有 localhost/netlify 页面；在应用确认在场（握手或快照响应）前
    // 绝不拉队列——否则会在非 Finance OS 页面烧掉投递次数，把 capture 打进 DLQ。
    if (!appReady) return;
    if (delivering) return;
    delivering = true;
    try {
      const res = await sendToBackground({ type: "FOS_PULL" });
      if (!res?.ok || !res.captures?.length) return;
      const inflight = await inFlightIds();
      const toDeliver = res.captures.filter((c) => !inflight.has(c.id));
      if (toDeliver.length === 0) {
        scheduleRetry();
        return;
      }
      const marked = await sendToBackground({
        type: "FOS_MARK_INFLIGHT",
        ids: toDeliver.map((c) => c.id),
      });
      if (!marked?.ok) return;
      const payload = { type: MSG.captures, captures: toDeliver };
      window.postMessage(payload, window.location.origin);
      document.dispatchEvent(new CustomEvent(EVT.captures, { detail: payload }));
      scheduleRetry();
    } finally {
      delivering = false;
    }
  }

  let snapshotDebounce = null;

  function requestSnapshot() {
    clearTimeout(snapshotDebounce);
    snapshotDebounce = setTimeout(() => {
      const payload = { type: MSG.requestSnapshot };
      window.postMessage(payload, window.location.origin);
      document.dispatchEvent(new CustomEvent(EVT.requestSnapshot, { detail: payload }));
    }, 250);
  }

  function requestSnapshotNow() {
    clearTimeout(snapshotDebounce);
    const payload = { type: MSG.requestSnapshot };
    window.postMessage(payload, window.location.origin);
    document.dispatchEvent(new CustomEvent(EVT.requestSnapshot, { detail: payload }));
  }

  function markAppReady() {
    appReady = true;
  }

  function onSnapshot(snapshot) {
    if (!snapshot || snapshot.v !== 1 || !Array.isArray(snapshot.accounts)) return;
    // 能响应快照请求的只有 Finance OS 应用本身。
    markAppReady();
    void sendToBackground({ type: "FOS_STORE_SNAPSHOT", snapshot });
    void deliver();
  }

  function onHello() {
    markAppReady();
    requestSnapshotNow();
    void deliver();
  }

  function onReady() {
    markAppReady();
    requestSnapshotNow();
    void deliver();
  }

  function onAck(id) {
    if (typeof id !== "string") return;
    void sendToBackground({ type: "FOS_ACK", id });
    void (async () => {
      const inflight = await inFlightIds();
      if (inflight.size === 0) stopRetry();
    })();
  }

  function onSyncResult(result) {
    if (!result || typeof result !== "object") return;
    void sendToBackground({ type: "FOS_SYNC_RESULT", result });
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const msg = e.data;
    if (msg?.type === MSG.hello) onHello();
    else if (msg?.type === MSG.ready) onReady();
    else if (msg?.type === MSG.ack) onAck(msg.id);
    else if (msg?.type === MSG.snapshot) onSnapshot(msg.snapshot);
    else if (msg?.type === MSG.syncResult) onSyncResult(msg.result);
  });

  document.addEventListener(EVT.hello, onHello);
  document.addEventListener(EVT.ready, onReady);
  document.addEventListener(EVT.ack, (e) => onAck(e.detail?.id));
  document.addEventListener(EVT.snapshot, (e) => onSnapshot(e.detail?.snapshot));
  document.addEventListener(EVT.syncResult, (e) => onSyncResult(e.detail?.result));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "FOS_PING") {
      // background 用它区分本页是 Finance OS 还是其它 localhost/netlify 应用。
      sendResponse({ ok: true, appReady });
      return;
    }
    if (msg?.type === "FOS_FORCE_DELIVER") {
      requestSnapshotNow();
      void deliver();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.fos_capture_queue) void deliver();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestSnapshot();
      void deliver();
    }
  });

  requestSnapshotNow();
  void deliver();
})();
