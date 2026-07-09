import { browser } from '$app/environment'
import { resolvePlayUrl, resolvePlayUrlSync } from './cloudAudio.js'
import { precacheAudioInServiceWorker } from './audioPrecache.js'
import {
  loadCachedAudioUrl,
  peekCachedAudioUrl,
  scheduleFullAudioBlobCache,
} from './audioBlobStore.js'
import { getWarmByteMode } from './networkPolicy.js'

/**
 * Resolve a playable URL (if needed) and warm audio bytes per network policy.
 * @param {import('./types.js').Track | null | undefined} track
 * @param {string[]} [keepTrackIds]
 */
export async function warmTrackAudio(track, keepTrackIds = []) {
  if (!browser || !track) return
  if (track.audioBlob instanceof Blob) return

  const cached =
    peekCachedAudioUrl(track.id) || (await loadCachedAudioUrl(track.id))
  if (cached) return

  if (!track.storagePath) return

  let url = resolvePlayUrlSync(track)
  if (!url) {
    try {
      url = await resolvePlayUrl(track)
    } catch {
      return
    }
  }
  if (!url) return

  const mode = getWarmByteMode()
  if (mode !== 'none') {
    precacheAudioInServiceWorker(url, track.id, { mode })
  }
  if (mode === 'full') {
    scheduleFullAudioBlobCache(track, url, keepTrackIds)
  }
}

/**
 * Fire-and-forget warm for pointerdown / visible-row prefetch.
 * @param {import('./types.js').Track | null | undefined} track
 * @param {string[]} [keepTrackIds]
 */
export function warmTrackAudioFireAndForget(track, keepTrackIds = []) {
  void warmTrackAudio(track, keepTrackIds).catch(() => {})
}
