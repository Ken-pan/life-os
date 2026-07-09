import { browser } from '$app/environment';
import { registerServiceWorker as registerServiceWorkerShared } from '@life-os/platform-web/sw-lifecycle';
import { syncRemindersToServiceWorker } from './services/reminders.js';

/** @returns {() => void} */
export function registerServiceWorker() {
  return registerServiceWorkerShared({ enabled: browser });
}

export { syncRemindersToServiceWorker };
