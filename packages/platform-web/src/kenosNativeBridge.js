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
 * @param {{ reason?: string }} [opts]
 */
export function nativeAuthenticate(opts = {}) {
  return call('authenticate', opts)
}

/**
 * Session-scoped unlock for sensitive Continuity domains (Money / Work).
 * Caches success in sessionStorage so Space switches do not re-prompt every time.
 * Outside the native shell this is a no-op success.
 *
 * @param {{
 *   reason?: string,
 *   storageKey?: string,
 *   force?: boolean,
 * }} [opts]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, cached?: boolean, code?: string, message?: string }>}
 */
export async function ensureNativeUnlock(opts = {}) {
  const storageKey = String(opts.storageKey || 'kenos.nativeUnlock')
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
  }
  const result = await nativeAuthenticate({
    reason: opts.reason || 'Unlock this Kenos surface',
  })
  if (result?.ok) {
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    return { ok: true, cached: false }
  }
  return {
    ok: false,
    code: result?.code || 'auth_failed',
    message: result?.message || 'Authentication failed',
  }
}

/** Clear a previous ensureNativeUnlock cache (e.g. Settings → lock now). */
export function clearNativeUnlock(storageKey = 'kenos.nativeUnlock') {
  try {
    sessionStorage.removeItem(String(storageKey))
  } catch {
    /* ignore */
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
 * Upsert a Live Activity snapshot.
 * Always safe to call. Refreshes in-shell Live Accessory; when the user has
 * Live Activities enabled, also drives Lock Screen / Dynamic Island via ActivityKit.
 * Returns `{ ok, gated, enabled, status }` — `gated: true` means shell-only.
 *
 * @param {{
 *   kind: 'training'|'focus'|'tidy',
 *   title?: string,
 *   subtitle?: string,
 *   progress?: number,
 *   endsAt?: string,
 *   endsAtMs?: number,
 * }} payload
 */
export function nativeLiveActivityUpsert(payload = {}) {
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
