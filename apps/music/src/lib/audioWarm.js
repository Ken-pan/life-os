import { browser } from '$app/environment'
import { resolvePlayUrl, resolvePlayUrlSync } from './cloudAudio.js'
import { precacheAudioInServiceWorker } from './audioPrecache.js'

/**
 * Resolve a playable URL (if needed) and ask the service worker to cache
 * audio bytes so the next play hits CDN/SW instead of a cold origin fetch.
 * @param {import('./types.js').Track | null | undefined} track
 */
export async function warmTrackAudio(track) {
  if (!browser || !track) return
  if (track.audioBlob instanceof Blob) return
  if (!track.storagePath) return

  let url = resolvePlayUrlSync(track)
  if (!url) {
    try {
      url = await resolvePlayUrl(track)
    } catch {
      return
    }
  }
  if (url) precacheAudioInServiceWorker(url, track.id)
}

/**
 * Fire-and-forget warm for pointerdown / background prefetch.
 * @param {import('./types.js').Track | null | undefined} track
 */
export function warmTrackAudioFireAndForget(track) {
  void warmTrackAudio(track).catch(() => {})
}
