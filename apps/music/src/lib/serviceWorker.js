import { dev } from '$app/environment';

/** @returns {() => void} */
export function registerServiceWorker() {
  if (dev || !('serviceWorker' in navigator)) return () => {};

  let refreshing = false;

  /** @param {ServiceWorkerRegistration} reg */
  function listenForUpdates(reg) {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }

  /** @param {ServiceWorkerRegistration} reg */
  function activateWaitingWorker(reg) {
    if (reg.waiting && navigator.serviceWorker.controller) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      listenForUpdates(reg);
      activateWaitingWorker(reg);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        reg.update().then(() => activateWaitingWorker(reg)).catch(() => {});
      });
    })
    .catch(() => {});

  const onControllerChange = () => {
    if (!navigator.serviceWorker.controller || refreshing) return;
    refreshing = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  };
}
