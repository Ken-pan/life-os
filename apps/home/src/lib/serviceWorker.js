import { dev } from '$app/environment'
import { registerServiceWorker as registerServiceWorkerShared } from '@life-os/platform-web/sw-lifecycle'

/** @returns {() => void} */
export function registerServiceWorker() {
  return registerServiceWorkerShared({ enabled: !dev })
}
