import { dev } from '$app/environment';
import { registerServiceWorker as registerServiceWorkerShared } from '@life-os/platform-web/sw-lifecycle';
import { timer } from '$lib/timer.svelte.js';

/** @returns {() => void} */
export function registerServiceWorker() {
  return registerServiceWorkerShared({
    enabled: !dev,
    // Never swap versions (and reload the page) while a rest/exercise timer is
    // running — the update applies on the next visibility/focus once idle.
    shouldDeferUpdate: () => timer.visible,
  });
}
