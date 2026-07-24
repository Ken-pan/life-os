/**
 * Kenos iOS native capability bridge (WKWebView Continuity).
 *
 * Native injects `window.kenosNative` + `window.__KENOS_NATIVE_BRIDGE__` at
 * document start (see KenosNativeCapabilityBridge.bootstrapScript). This module
 * is the typed/web-friendly API for domain apps — safe no-ops outside the shell.
 */

import { isIosNativeShell } from './iosNativeShell.js'

/**
 * @typedef {{
 *   domainId?: string,
 *   path?: string,
 *   title?: string,
 *   activeTab?: string,
 *   canGoBack?: boolean,
 *   currentEntity?: string,
 *   liveState?: string,
 *   unsavedDraft?: boolean,
 *   summary?: string,
 * }} KenosNavManifest
 */

/**
 * @returns {boolean}
 */
export function isNativeBridgeAvailable() {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(
      window.kenosNative &&
      window.webkit?.messageHandlers?.kenosNative &&
      (isIosNativeShell() || window.__KENOS_NATIVE_BRIDGE_BOOT__),
    )
  } catch {
    return false
  }
}

/**
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 */
async function call(method, params = {}) {
  if (!isNativeBridgeAvailable()) {
    return { ok: false, skipped: true, code: 'native_bridge_unavailable' }
  }
  try {
    if (typeof window.__KENOS_NATIVE_BRIDGE__?.call === 'function') {
      return await window.__KENOS_NATIVE_BRIDGE__.call(method, params)
    }
    const fn = window.kenosNative?.[method]
    if (typeof fn === 'function') {
      return await fn.call(window.kenosNative, params)
    }
    return { ok: false, skipped: true, code: 'native_bridge_unavailable' }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String(/** @type {{ code?: string }} */ (err).code)
        : 'native_bridge_error'
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: string }} */ (err).message)
        : String(err)
    return { ok: false, code, message }
  }
}

/**
 * @returns {Promise<{
 *   ok?: boolean,
 *   capabilities?: Record<string, boolean>,
 *   status?: Record<string, string>,
 *   skipped?: boolean,
 * }>}
 */
export function getNativeCapabilities() {
  return call('getCapabilities')
}

/**
 * @param {'light'|'medium'|'heavy'|'soft'|'rigid'|'selection'|'success'|'warning'|'error'|'pulse'} [style]
 */
export function nativeHaptic(style = 'light') {
  if (!isNativeBridgeAvailable()) {
    return Promise.resolve({ ok: false, skipped: true })
  }
  try {
    return window.kenosNative.haptic(style)
  } catch {
    return Promise.resolve({ ok: false, skipped: true })
  }
}

/**
 * @param {{ title?: string, text?: string, url?: string }} [payload]
 */
export function nativeShare(payload = {}) {
  return call('share', payload)
}

/**
 * Face ID / Touch ID / device passcode.
 * @param {{
 *   reason?: string,
 *   cancelTitle?: string,
 *   reuseDuration?: number,
 *   storageKey?: string,
 *   force?: boolean,
 *   grantTTL?: number,
 *   prompt?: boolean,
 * }} [opts]
 */
export function nativeAuthenticate(opts = {}) {
  return call('authenticate', opts)
}

/**
 * Invalidate an in-flight Face ID sheet (retry / leave / dispose).
 * Native calls LAContext.invalidate() so the system UI dismisses.
 */
export function nativeCancelAuthenticate() {
  return call('cancelAuthenticate', {})
}

/**
 * Clear process-scoped native unlock grant (survives WK remount; not disk).
 * @param {string} [storageKey]
 */
export function nativeClearUnlockGrant(storageKey = '') {
  return call('clearUnlockGrant', { storageKey: String(storageKey || '') })
}

/** @deprecated Prefer nativeCancelAuthenticate */
export const cancelNativeAuthenticate = nativeCancelAuthenticate

/**
 * Session-scoped unlock for sensitive Continuity domains (Money / Work).
 * Caches success in sessionStorage + native process grant so Space switches
 * and WK remounts (LAN blips) do not re-prompt every time.
 * Outside the native shell this is a no-op success.
 *
 * Root-cause rules (Apple LA + WK bridge):
 * - Remount must NOT cancel in-flight Face ID (dispose is generation-only)
 * - onMount uses prompt:false (restore grant only) — never auto-loop LA UI
 * - User Unlock / Try again uses prompt:true (or force)
 * - Same storageKey joins one in-flight Face ID (native coalesce)
 *
 * @param {{
 *   reason?: string,
 *   storageKey?: string,
 *   force?: boolean,
 *   prompt?: boolean,
 *   cancelTitle?: string,
 *   reuseDuration?: number,
 *   grantTTL?: number,
 * }} [opts]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, cached?: boolean, cancelled?: boolean, code?: string, message?: string }>}
 */
export async function ensureNativeUnlock(opts = {}) {
  const storageKey = String(opts.storageKey || 'kenos.nativeUnlock')
  // force always presents LA; remount restore passes prompt:false.
  const allowPrompt = opts.force ? true : opts.prompt !== false
  if (!isNativeBridgeAvailable()) {
    return { ok: true, skipped: true }
  }
  if (!opts.force) {
    try {
      if (sessionStorage.getItem(storageKey) === '1') {
        return { ok: true, cached: true }
      }
    } catch {
      /* private mode */
    }
  } else {
    // Drop a stuck system Face ID sheet + native grant before re-prompting.
    await nativeCancelAuthenticate()
    try {
      await nativeClearUnlockGrant(storageKey)
    } catch {
      /* older shells */
    }
  }
  let result
  try {
    result = await nativeAuthenticate({
      reason: opts.reason || 'Unlock this Korben surface',
      cancelTitle: opts.cancelTitle || 'Cancel',
      reuseDuration: opts.reuseDuration ?? 10,
      storageKey,
      force: Boolean(opts.force),
      grantTTL: opts.grantTTL ?? 900,
      prompt: allowPrompt,
    })
  } catch (err) {
    const code = err?.code || 'auth_failed'
    const cancelled = code === 'auth_cancelled' || code === 'auth_superseded'
    return {
      ok: false,
      cancelled,
      code,
      message: err?.message || 'Authentication failed',
    }
  }
  if (result?.ok) {
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    return { ok: true, cached: Boolean(result.cached) }
  }
  const code = result?.code || 'auth_failed'
  const cancelled = code === 'auth_cancelled' || code === 'auth_superseded'
  return {
    ok: false,
    cancelled,
    code,
    message: result?.message || 'Authentication failed',
  }
}

/** Clear a previous ensureNativeUnlock cache (e.g. Settings → lock now). */
export function clearNativeUnlock(storageKey = 'kenos.nativeUnlock') {
  const key = String(storageKey)
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  if (isNativeBridgeAvailable()) {
    void nativeClearUnlockGrant(key)
  }
}

/**
 * Generation-guarded unlock controller for Continuity Money / Work gates.
 * Prevents remount/retry races from flipping unlockState after a newer request.
 *
 * @param {{
 *   storageKey: string,
 *   reason: string,
 *   cancelTitle?: string,
 *   reuseDuration?: number,
 * }} opts
 */
export function createNativeUnlockController(opts) {
  let generation = 0
  const storageKey = String(opts.storageKey || 'kenos.nativeUnlock')
  const reason = opts.reason || 'Unlock this Korben surface'

  return {
    /**
     * @param {{ force?: boolean, prompt?: boolean }} [request]
     * @returns {Promise<'open'|'locked'>}
     */
    async unlock(request = {}) {
      const gen = ++generation
      const force = Boolean(request.force)
      const result = await ensureNativeUnlock({
        storageKey,
        reason,
        force,
        // Remount restore: prompt:false. Explicit Unlock / Try again: prompt true.
        prompt: force ? true : request.prompt !== false,
        cancelTitle: opts.cancelTitle || 'Cancel',
        reuseDuration: opts.reuseDuration ?? 10,
      })
      if (gen !== generation) return 'locked'
      return result.ok || result.skipped ? 'open' : 'locked'
    },

    /** Cancel system Face ID and mark this controller generation stale. */
    async cancel() {
      generation += 1
      await nativeCancelAuthenticate()
    },

    /**
     * Remount cleanup — bump generation only.
     * Must NOT cancelAuthenticate: WK reload storms would kill Face ID and
     * the next mount would re-prompt forever.
     */
    dispose() {
      generation += 1
    },
  }
}

/**
 * Update system Now Playing (lock screen / Control Center).
 * @param {{
 *   trackId?: string,
 *   title?: string,
 *   artist?: string,
 *   album?: string,
 *   playing?: boolean,
 *   duration?: number,
 *   artwork?: string,
 *   position?: number,
 * }} [payload]
 */
export function nativeNowPlayingUpdate(payload = {}) {
  return call('nowPlayingUpdate', payload)
}

/** @param {{ position?: number, playing?: boolean }} [payload] */
export function nativeNowPlayingUpdatePosition(payload = {}) {
  return call('nowPlayingUpdatePosition', payload)
}

export function nativeNowPlayingClear() {
  return call('nowPlayingClear')
}

/**
 * 构造持久化表面(灵动岛 / widget / 通知)的**具体会话**跳转目标。
 *
 * 为什么必须带它:这些表面点击若落到静态 kind 通用链(如 `kenos://training`),
 * 会经域内 resume 解析到「上一个挂起的会话」——可能是**错误的实例**(用户报
 * 「点灵动岛去到错误的训练 day」的整类根因)。带上具体 path,点击就直达它
 * 视觉上代表的那个会话,确定性、不经 resume 猜测。
 *
 * @param {{ domain: string, path?: string }} opts
 * @returns {string} `kenos://<domain>?path=<path>` 或 `kenos://<domain>`(空 domain→'')
 */
export function liveActivityDeepLink({ domain, path } = {}) {
  const d = String(domain || '').trim()
  if (!d) return ''
  const p = String(path || '').trim()
  if (!p) return `kenos://${d}`
  const norm = p.startsWith('/') ? p : `/${p}`
  return `kenos://${d}?path=${encodeURIComponent(norm)}`
}

/**
 * Upsert a Live Activity snapshot.
 * Always safe to call. Refreshes in-shell Live Accessory; when the user has
 * Live Activities enabled, also drives Lock Screen / Dynamic Island via ActivityKit.
 * Returns `{ ok, gated, enabled, status }` — `gated: true` means shell-only.
 *
 * `deepLink`:本次会话的具体跳转目标(见 `liveActivityDeepLink`)。**强烈建议**
 * 所有发布者带上 —— 缺省时原生回退到静态 kind 落地页(可能经 resume 落到错误
 * 实例)。此前本函数漏转发 deepLink,是灵动岛点击落错会话的直接原因之一。
 *
 * @param {{
 *   kind: 'training'|'focus'|'tidy',
 *   title?: string,
 *   subtitle?: string,
 *   progress?: number,
 *   endsAt?: string,
 *   endsAtMs?: number,
 *   deepLink?: string,
 * }} payload
 */
export function nativeLiveActivityUpsert(payload = {}) {
  const deepLink = String(payload.deepLink || '').trim()
  return call('liveActivityUpsert', {
    kind: String(payload.kind || ''),
    title: String(payload.title || ''),
    subtitle: String(payload.subtitle || ''),
    progress:
      payload.progress == null || Number.isNaN(Number(payload.progress))
        ? undefined
        : Math.min(1, Math.max(0, Number(payload.progress))),
    endsAt: payload.endsAt ? String(payload.endsAt) : undefined,
    endsAtMs:
      payload.endsAtMs == null || Number.isNaN(Number(payload.endsAtMs))
        ? undefined
        : Number(payload.endsAtMs),
    // 只转发 kenos:// scheme,防注入任意 URL 到点击目标。
    deepLink: deepLink.startsWith('kenos://') ? deepLink : undefined,
  })
}

/**
 * End a Live Activity by kind.
 * @param {'training'|'focus'|'tidy'|{ kind: string }} kindOrPayload
 */
export function nativeLiveActivityEnd(kindOrPayload) {
  const kind =
    typeof kindOrPayload === 'string'
      ? kindOrPayload
      : String(kindOrPayload?.kind || '')
  return call('liveActivityEnd', { kind })
}

/**
 * Open Domain Continuity in the native shell (skips DomainLaunch intermediate page).
 * Prefer `url` when known. If `url` is empty, native resolves `domainId` + `path`
 * via KenosDomainRegistry.continuityURL.
 * @param {{ url?: string, domainId?: string, path?: string }} payload
 */
export function nativeOpenContinuity(payload = {}) {
  return call('openContinuity', {
    url: String(payload?.url || ''),
    domainId: String(payload?.domainId || ''),
    path: String(payload?.path || ''),
  })
}

/**
 * Whether Continuity exposes local UN scheduling (not remote APNs).
 * @param {{ capabilities?: Record<string, boolean> } | null | undefined} [capsResult]
 */
export function hasNativeLocalNotifications(capsResult) {
  return Boolean(capsResult?.capabilities?.localNotifications)
}

/** Request local notification permission via native shell. */
export function nativeNotificationsRequestPermission() {
  return call('notificationsRequestPermission')
}

export function nativeNotificationsGetStatus() {
  return call('notificationsGetStatus')
}

export function nativeNotificationsGetPreferences() {
  return call('notificationsGetPreferences')
}

/** @param {Record<string, unknown>} [prefs] */
export function nativeNotificationsSetPreferences(prefs = {}) {
  return call('notificationsSetPreferences', prefs)
}

/** Continuity-wide theme / locale SSOT (native UserDefaults). */
export function nativeShellSettingsGet() {
  return call('shellSettingsGet')
}

/** @param {{ theme?: string, locale?: string }} [prefs] */
export function nativeShellSettingsSet(prefs = {}) {
  return call('shellSettingsSet', prefs)
}

/**
 * Schedule one local notification.
 * @param {{
 *   type?: string,
 *   safeTitle?: string,
 *   title?: string,
 *   safeBody?: string,
 *   body?: string,
 *   deepLink: string,
 *   deduplicationKey: string,
 *   fireAt?: string|number,
 *   risk?: string,
 *   classification?: string,
 * }} payload
 */
export function nativeNotificationsSchedule(payload = {}) {
  return call('notificationsSchedule', payload)
}

/**
 * @param {{ deduplicationKey?: string, id?: string, type?: string }} [payload]
 */
export function nativeNotificationsCancel(payload = {}) {
  return call('notificationsCancel', payload)
}

/**
 * Bulk-replace Planner reminder jobs on-device.
 * @param {{ jobs?: Array<{ id?: string, taskId?: string, title?: string, fireAt?: number, fireAtMs?: number }> }} payload
 */
export function nativeNotificationsSyncReminders(payload = {}) {
  return call('notificationsSyncReminders', {
    jobs: Array.isArray(payload?.jobs) ? payload.jobs : [],
  })
}

export function nativeNotificationsListPending() {
  return call('notificationsListPending')
}

/**
 * Sync native status-bar / chrome polarity with the resolved page theme.
 * @param {'light'|'dark'} colorScheme
 */
export function publishChromeAppearance(colorScheme) {
  const scheme = String(colorScheme || '').toLowerCase()
  if (scheme !== 'light' && scheme !== 'dark') {
    return Promise.resolve({ ok: false, skipped: true, code: 'invalid_color_scheme' })
  }
  if (!isNativeBridgeAvailable()) {
    return Promise.resolve({ ok: false, skipped: true, colorScheme: scheme })
  }
  try {
    if (typeof window.kenosNative?.publishChromeAppearance === 'function') {
      return window.kenosNative.publishChromeAppearance({ colorScheme: scheme })
    }
    return call('publishChromeAppearance', { colorScheme: scheme })
  } catch {
    return Promise.resolve({ ok: false, skipped: true, colorScheme: scheme })
  }
}

/**
 * Publish Domain Navigation Manifest for native Shelf / leave-guard / chrome.
 * @param {KenosNavManifest} manifest
 */
export function publishNavManifest(manifest) {
  const payload = {
    domainId: String(manifest?.domainId || ''),
    path: String(
      manifest?.path ||
        (typeof location !== 'undefined' ? location.pathname : ''),
    ),
    title: String(manifest?.title || ''),
    activeTab: String(manifest?.activeTab || ''),
    canGoBack: Boolean(manifest?.canGoBack),
    currentEntity: String(manifest?.currentEntity || ''),
    liveState: String(manifest?.liveState || ''),
    unsavedDraft: Boolean(manifest?.unsavedDraft),
    summary: String(manifest?.summary || ''),
  }
  try {
    if (typeof window !== 'undefined') {
      window.__KENOS_NAV_MANIFEST__ = payload
    }
  } catch {
    /* ignore */
  }
  if (!isNativeBridgeAvailable()) {
    return Promise.resolve({ ok: false, skipped: true, manifest: payload })
  }
  try {
    return window.kenosNative.publishNavManifest(payload)
  } catch {
    return Promise.resolve({ ok: false, skipped: true, manifest: payload })
  }
}

/**
 * Keep `__KENOS_NAV_MANIFEST__` fresh. Returns a dispose function.
 * @param {() => KenosNavManifest} getManifest
 * @param {{ intervalMs?: number }} [opts]
 */
export function installNavManifestPublisher(getManifest, opts = {}) {
  if (typeof window === 'undefined' || typeof getManifest !== 'function') {
    return () => {}
  }
  const intervalMs = Math.max(250, Number(opts.intervalMs) || 800)
  let lastKey = ''

  const tick = () => {
    try {
      const m = getManifest() || {}
      const key = JSON.stringify([
        m.domainId,
        m.path,
        m.title,
        m.activeTab,
        m.canGoBack,
        m.currentEntity,
        m.liveState,
        m.unsavedDraft,
        m.summary,
      ])
      if (key === lastKey) return
      lastKey = key
      void publishNavManifest(m)
    } catch {
      /* ignore */
    }
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  const onVis = () => {
    if (document.visibilityState === 'visible') tick()
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('popstate', tick)

  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('popstate', tick)
  }
}
