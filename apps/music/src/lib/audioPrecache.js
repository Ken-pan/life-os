import { browser } from '$app/environment'
import {
  beginBackgroundJob,
  bindBackgroundJobAck,
  trackBackgroundJob,
} from './backgroundActivity.svelte.js'

/** Ask the service worker to fetch & cache the next track (cloud signed URLs). */
/** @param {string | undefined | null} url @param {string | undefined | null} trackId @param {{ mode?: 'range' | 'full' }} [opts] */
export function precacheAudioInServiceWorker(url, trackId, opts = {}) {
  if (!browser || !url || !trackId) return
  if (url.startsWith('blob:')) return
  const controller = navigator.serviceWorker?.controller
  if (!controller) return
  try {
    trackBackgroundJob(1)
    controller.postMessage({
      type: 'PRECACHE_AUDIO',
      url,
      trackId,
      mode: opts.mode || 'full',
    })
  } catch {
    trackBackgroundJob(-1)
  }
}

/** Drop cached audio except optional keep ids (queue churn). */
/** @param {string[]} [keepTrackIds] */
export function purgeAudioCacheInServiceWorker(keepTrackIds = []) {
  if (!browser) return
  const controller = navigator.serviceWorker?.controller
  if (!controller) return
  try {
    controller.postMessage({ type: 'PURGE_AUDIO_CACHE', keepTrackIds })
  } catch {
    /* ignore */
  }
}

/** Wire SW precache completion messages to decrement the badge counter. */
export function bindPrecacheActivityAck() {
  return bindBackgroundJobAck(() => trackBackgroundJob(-1))
}

export { beginBackgroundJob }
