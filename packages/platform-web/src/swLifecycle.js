/**
 * @typedef {{
 *   url?: string;
 *   scope?: string;
 *   enabled?: boolean;
 *   shouldDeferUpdate?: () => boolean;
 *   deferEvents?: string[];
 * }} ServiceWorkerLifecycleOptions
 */

/**
 * Register a service worker and manage the "new version is waiting" lifecycle:
 * activating the waiting worker (and the resulting page reload) is deferred
 * while the tab is hidden or `shouldDeferUpdate()` returns true (e.g. audio is
 * playing, a form is dirty), and applied on the next visibility/focus/deferEvent.
 *
 * This consolidates logic that used to be hand-rolled per app (music/home/planner
 * each had a near-identical, slowly-diverging copy).
 *
 * @param {ServiceWorkerLifecycleOptions} [options]
 * @returns {() => void} cleanup — call on unmount
 */
export function registerServiceWorker(options = {}) {
  const {
    url = '/sw.js',
    scope,
    enabled = true,
    shouldDeferUpdate,
    deferEvents = [],
  } = options

  if (
    !enabled ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    typeof document === 'undefined'
  ) {
    return () => {}
  }

  let refreshing = false
  let pendingReload = false
  /** @type {ServiceWorkerRegistration | null} */
  let registration = null

  function isDeferred() {
    if (document.visibilityState !== 'visible') return true
    try {
      return Boolean(shouldDeferUpdate?.())
    } catch {
      return false
    }
  }

  /** @param {ServiceWorkerRegistration} reg */
  function activateWaiting(reg) {
    if (!reg.waiting || !navigator.serviceWorker.controller) return
    if (isDeferred()) return
    reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  function applyPendingUpdate() {
    if (isDeferred()) return
    if (registration?.waiting) activateWaiting(registration)
    if (pendingReload) {
      refreshing = true
      window.location.reload()
    }
  }

  function checkForUpdates() {
    if (document.visibilityState !== 'visible') return
    registration
      ?.update()
      .then(applyPendingUpdate)
      .catch(() => {})
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return
    checkForUpdates()
  }

  function onPageShow() {
    checkForUpdates()
  }

  /** @param {ServiceWorkerRegistration} reg */
  function listenForUpdates(reg) {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      if (!worker) return
      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          activateWaiting(reg)
        }
      })
    })
  }

  navigator.serviceWorker
    .register(
      url,
      scope ? { scope, updateViaCache: 'none' } : { updateViaCache: 'none' },
    )
    .then((reg) => {
      registration = reg
      listenForUpdates(reg)
      activateWaiting(reg)
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pageshow', onPageShow)
    })
    .catch(() => {})

  const onControllerChange = () => {
    if (!navigator.serviceWorker.controller || refreshing) return
    if (isDeferred()) {
      pendingReload = true
      return
    }
    refreshing = true
    window.location.reload()
  }

  const onDeferEvent = () => applyPendingUpdate()

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    onControllerChange,
  )
  window.addEventListener('focus', onDeferEvent)
  for (const eventName of deferEvents)
    window.addEventListener(eventName, onDeferEvent)

  return () => {
    navigator.serviceWorker.removeEventListener(
      'controllerchange',
      onControllerChange,
    )
    window.removeEventListener('focus', onDeferEvent)
    for (const eventName of deferEvents)
      window.removeEventListener(eventName, onDeferEvent)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', onPageShow)
  }
}
