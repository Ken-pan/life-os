import { dev } from '$app/environment';

/** @typedef {{ shouldDeferUpdate?: () => boolean }} ServiceWorkerOptions */

/** @param {ServiceWorkerOptions} [options] @returns {() => void} */
export function registerServiceWorker(options = {}) {
  if (dev || !('serviceWorker' in navigator)) return () => {};

  let refreshing = false;
  let pendingReload = false;
  /** @type {ServiceWorkerRegistration | null} */
  let registration = null;

  function shouldDeferUpdate() {
    if (document.visibilityState !== 'visible') return true;
    try {
      return Boolean(options.shouldDeferUpdate?.());
    } catch {
      return false;
    }
  }

  /** @param {ServiceWorkerRegistration} reg */
  function activateWaitingWorker(reg) {
    if (!reg.waiting || !navigator.serviceWorker.controller) return;
    if (shouldDeferUpdate()) return;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function applyPendingUpdate() {
    if (shouldDeferUpdate()) return;
    if (registration?.waiting) activateWaitingWorker(registration);
    if (pendingReload) {
      refreshing = true;
      window.location.reload();
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    registration
      ?.update()
      .then(() => applyPendingUpdate())
      .catch(() => {});
  }

  /** @param {ServiceWorkerRegistration} reg */
  function listenForUpdates(reg) {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          activateWaitingWorker(reg);
        }
      });
    });
  }

  navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      registration = reg;
      listenForUpdates(reg);
      activateWaitingWorker(reg);
      document.addEventListener('visibilitychange', onVisibilityChange);
    })
    .catch(() => {});

  const onControllerChange = () => {
    if (!navigator.serviceWorker.controller || refreshing) return;
    if (shouldDeferUpdate()) {
      pendingReload = true;
      return;
    }
    refreshing = true;
    window.location.reload();
  };

  const onPlaybackState = () => applyPendingUpdate();
  const onFocus = () => applyPendingUpdate();

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  window.addEventListener('musicos:playback-state', onPlaybackState);
  window.addEventListener('focus', onFocus);

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    window.removeEventListener('musicos:playback-state', onPlaybackState);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
