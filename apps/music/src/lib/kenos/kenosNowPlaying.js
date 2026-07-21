/**
 * Kenos Continuity WKWebView → native Now Playing (MPNowPlayingInfoCenter).
 * Uses window.kenosNative.nowPlaying (injected by KenosNativeCapabilityBridge).
 */

/** @typedef {{ id: string, title?: string, artist?: string, album?: string, duration?: number, artBlob?: Blob, artUrl?: string }} NowPlayingTrack */

const state = { trackId: /** @type {string | null} */ (null), playing: false }
/** @type {{ id: string | null, dataUrl: string | null }} */
let artworkCache = { id: null, dataUrl: null }
let lastSent = { at: 0, position: 0, rate: 1 }
/** @type {string} */
let lastMetaKey = ''
/** @type {AbortController | null} */
let artworkAbort = null
/** @type {Map<string, Promise<string | null>>} */
const artworkInflight = new Map()

const ARTWORK_MAX_EDGE = 320
const ARTWORK_JPEG_QUALITY = 0.72
/** WKScriptMessage / Continuity bridge — never post multi‑MB album art. */
const ARTWORK_MAX_DATA_URL_CHARS = 180_000
const ARTWORK_MAX_SOURCE_BYTES = 4_000_000

function bridgeApi() {
  if (typeof window === 'undefined') return null
  return window.kenosNative?.nowPlaying ?? null
}

/** @param {string | null | undefined} dataUrl */
function withinBridgeArtworkBudget(dataUrl) {
  return Boolean(dataUrl && dataUrl.length > 0 && dataUrl.length <= ARTWORK_MAX_DATA_URL_CHARS)
}

function hasBridge() {
  return Boolean(
    bridgeApi() || typeof window?.__KENOS_NATIVE_BRIDGE__?.call === 'function',
  )
}

function bridgeCall(method, params = {}) {
  if (typeof window === 'undefined') return Promise.resolve()
  const np = bridgeApi()
  if (np && typeof np[method] === 'function') {
    return Promise.resolve(np[method](params)).catch(() => {})
  }
  const call = window.__KENOS_NATIVE_BRIDGE__?.call
  if (typeof call !== 'function') return Promise.resolve()
  const rpc =
    method === 'update'
      ? 'nowPlayingUpdate'
      : method === 'updatePosition'
        ? 'nowPlayingUpdatePosition'
        : method === 'clear'
          ? 'nowPlayingClear'
          : null
  if (!rpc) return Promise.resolve()
  return Promise.resolve(call(rpc, params)).catch(() => {})
}

/** @param {Blob} blob @returns {Promise<string | null>} */
async function compressArtwork(blob) {
  if (!blob?.size || blob.size > ARTWORK_MAX_SOURCE_BYTES) return null
  try {
    // No createImageBitmap → skip artwork (never send raw full-res data URLs).
    if (typeof createImageBitmap !== 'function') return null
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(
      1,
      ARTWORK_MAX_EDGE / Math.max(bitmap.width, bitmap.height, 1),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return null
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    for (const quality of [ARTWORK_JPEG_QUALITY, 0.55, 0.4, 0.28]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (withinBridgeArtworkBudget(dataUrl)) return dataUrl
    }
    return null
  } catch {
    return null
  }
}

/** @param {Blob} blob @returns {Promise<string>} */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(/** @type {string} */ (reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** @param {NowPlayingTrack} track @returns {Promise<string | null>} */
async function artworkDataUrl(track) {
  if (artworkCache.id === track.id) return artworkCache.dataUrl
  const inflight = artworkInflight.get(track.id)
  if (inflight) return inflight

  artworkAbort?.abort()
  artworkAbort = new AbortController()
  const { signal } = artworkAbort

  const job = (async () => {
    try {
      let blob = track.artBlob ?? null
      if (!blob && track.artUrl) {
        const res = await fetch(track.artUrl, { signal })
        if (!res.ok) return null
        blob = await res.blob()
      }
      if (!blob || signal.aborted) return null
      const dataUrl = await compressArtwork(blob)
      if (!dataUrl || signal.aborted || state.trackId !== track.id) return null
      artworkCache = { id: track.id, dataUrl }
      return dataUrl
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'AbortError'
      ) {
        return null
      }
      return null
    } finally {
      artworkInflight.delete(track.id)
    }
  })()

  artworkInflight.set(track.id, job)
  return job
}

/** @param {NowPlayingTrack | null | undefined} track @param {boolean} playing */
export function kenosUpdateMediaSession(track, playing) {
  if (!hasBridge()) return
  if (!track) {
    state.trackId = null
    state.playing = false
    lastMetaKey = ''
    artworkAbort?.abort()
    artworkAbort = null
    artworkInflight.clear()
    artworkCache = { id: null, dataUrl: null }
    lastSent = { at: 0, position: 0, rate: 1 }
    void bridgeCall('clear')
    return
  }
  const metaKey = [
    track.id,
    track.title || '',
    track.artist || '',
    track.album || '',
    playing ? '1' : '0',
    track.duration || 0,
  ].join('\u001f')
  state.trackId = track.id
  state.playing = playing
  const payload = {
    trackId: track.id,
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    playing,
    duration: track.duration || 0,
  }
  if (metaKey !== lastMetaKey) {
    lastMetaKey = metaKey
    void bridgeCall('update', payload)
  }
  void artworkDataUrl(track).then((artwork) => {
    if (!artwork || state.trackId !== track.id) return
    void bridgeCall('update', { ...payload, playing: state.playing, artwork })
  })
}

/** @param {HTMLAudioElement | null | undefined} audio */
export function kenosUpdatePosition(audio) {
  if (!audio || !hasBridge()) return
  const duration = audio.duration
  const position = audio.currentTime
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(position)
  ) {
    return
  }
  const rate = audio.paused ? 0 : audio.playbackRate || 1
  const now = Date.now()
  const extrapolated =
    lastSent.position + (lastSent.rate * (now - lastSent.at)) / 1000
  const drifted = Math.abs(position - extrapolated) > 2
  if (now - lastSent.at < 4000 && !drifted && rate === lastSent.rate) return
  lastSent = { at: now, position, rate }
  void bridgeCall('updatePosition', { position, duration, rate })
}

/**
 * @param {{
 *   play: () => void,
 *   pause: () => void,
 *   next: () => void,
 *   prev: () => void,
 *   seekTo?: (time: number) => void
 * }} handlers
 */
export function bindKenosMediaHandlers(handlers) {
  if (typeof window === 'undefined') return
  let wasPlayingBeforeInterruption = false
  window.__KENOS_NOW_PLAYING_HANDLERS__ = {
    /** @param {{ name?: string, position?: number }} event */
    handle(event) {
      switch (event?.name) {
        case 'play':
          handlers.play()
          break
        case 'pause':
          handlers.pause()
          break
        case 'toggle':
          state.playing ? handlers.pause() : handlers.play()
          break
        case 'next':
          handlers.next()
          break
        case 'previous':
          handlers.prev()
          break
        case 'seekTo': {
          const position = Number(event?.position)
          if (Number.isFinite(position)) handlers.seekTo?.(position)
          break
        }
        case 'interruptBegan':
          wasPlayingBeforeInterruption = state.playing
          if (state.playing) handlers.pause()
          break
        case 'interruptEndedResume':
          if (wasPlayingBeforeInterruption) handlers.play()
          wasPlayingBeforeInterruption = false
          break
        case 'interruptEnded':
          wasPlayingBeforeInterruption = false
          break
        case 'routeDeviceUnavailable':
          if (state.playing) handlers.pause()
          break
      }
    },
  }
}
