import { dev } from '$app/environment';
import { registerServiceWorker as registerServiceWorkerShared } from '@life-os/platform-web/sw-lifecycle';

/** @typedef {{ shouldDeferUpdate?: () => boolean }} ServiceWorkerOptions */

/** @param {ServiceWorkerOptions} [options] @returns {() => void} */
export function registerServiceWorker(options = {}) {
  return registerServiceWorkerShared({
    enabled: !dev,
    shouldDeferUpdate: options.shouldDeferUpdate,
    deferEvents: ['musicos:playback-state'],
  });
}
