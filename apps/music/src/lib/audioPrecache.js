import { browser } from '$app/environment'

/** Ask the service worker to fetch & cache the next track (cloud signed URLs). */
/** @param {string | undefined | null} url @param {string | undefined | null} trackId */
export function precacheAudioInServiceWorker(url, trackId) {
  if (!browser || !url || !trackId) return
  if (url.startsWith('blob:')) return
  const controller = navigator.serviceWorker?.controller
  if (!controller) return
  try {
    controller.postMessage({ type: 'PRECACHE_AUDIO', url, trackId })
  } catch {
    /* ignore */
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
