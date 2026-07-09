import { browser } from '$app/environment'
import { db, hydrateTrack, recordPlay, ensureAlbumArtCache } from './db.js'
import {
  recordMusicInteraction,
  SKIP_THRESHOLD_MS,
} from './musicInteractions.js'
import {
  resolvePlayUrl,
  resolvePlayUrlSync,
  hasPlayableSource,
  getSignedAudioUrl,
  invalidateSignedAudioUrl,
  peekSignedAudioUrl,
} from './cloudAudio.js'
import {
  registerAudioPool,
  resumeAudioContext,
  ensurePlaybackGraph,
  isPlaybackGraphReady,
  syncElementGains,
  rampCrossfade,
  setSlotGainImmediate,
} from './audioAnalyser.js'
import {
  precacheAudioInServiceWorker,
  purgeAudioCacheInServiceWorker,
} from './audioPrecache.js'
import { warmTrackAudio, warmTrackAudioFireAndForget } from './audioWarm.js'
import {
  scheduleFullAudioBlobCache,
  trimAudioBlobCache,
} from './audioBlobStore.js'
import { getWarmByteMode } from './networkPolicy.js'
import {
  markPlayRequest,
  markUrlResolved,
  markCanplay,
  markPlaying,
  markPlayFailed,
  classifyPlayUrlSource,
} from './playMetrics.js'
import {
  bindMediaSessionHandlers,
  declarePlaybackSession,
  updateMediaSession,
  updatePositionState,
} from './mediaSession.js'
import { syncErrorMessage, scheduleAutoCloudPush } from './sync.js'
import { t } from './i18n/index.js'
import { S, patchLocalSettings } from './state.svelte.js'
import { supabase } from './supabase.js'
import { shuffleCopy } from './queueDisplay.js'

/** @type {HTMLAudioElement | null} */
let audioA = null
/** @type {HTMLAudioElement | null} */
let audioB = null
/** @type {'a' | 'b'} */
let activeSlot = 'a'
let loadToken = 0
const SESSION_KEY = 'musicos_player_session'
let sessionTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

/** @type {{ trackId: string | null, token: number, ready: boolean }} */
let preloadState = { trackId: null, token: 0, ready: false }
let gaplessHandoff = false
/** @type {number | null} */
let shufflePreloadIndex = null
let crossfadeToken = 0
let crossfadeInProgress = false

/** @type {{ source: import('./musicInteractions.js').PlaySource, passive: boolean, entityType: import('./musicInteractions.js').EntityType, entityId: string | null }} */
let launchContext = {
  source: 'unknown',
  passive: true,
  entityType: 'track',
  entityId: null,
}

/** @type {{ trackId: string | null, passive: boolean }} */
let playSession = { trackId: null, passive: true }

function getActiveAudio() {
  return activeSlot === 'a' ? audioA : audioB
}

function getStandbyAudio() {
  return activeSlot === 'a' ? audioB : audioA
}

function getStandbySlot() {
  return activeSlot === 'a' ? 'b' : 'a'
}

function swapActiveSlot() {
  activeSlot = getStandbySlot()
  syncOutputGains()
}

/** Apply user volume to active slot (Web Audio fade or element.volume). */
function syncOutputGains() {
  if (isPlaybackGraphReady()) {
    if (audioA) audioA.volume = 1
    if (audioB) audioB.volume = 1
    syncElementGains(activeSlot, player.volume, player.muted)
    return
  }
  if (audioA) {
    audioA.volume = activeSlot === 'a' && !player.muted ? player.volume : 0
    audioA.muted = player.muted
  }
  if (audioB) {
    audioB.volume = activeSlot === 'b' && !player.muted ? player.volume : 0
    audioB.muted = player.muted
  }
}

function markPassiveAdvance() {
  launchContext = {
    ...launchContext,
    source: 'queue',
    passive: true,
  }
}

/** Records skip/complete for the outgoing track before changing queue index.
 * @param {{ reason?: 'explicit_skip' | 'natural_end' | 'advance' }} [opts]
 */
function finalizePlaySession(opts = {}) {
  const track = getCurrentTrack()
  const audio = getActiveAudio()
  if (!track || !audio || playSession.trackId !== track.id) return

  const playedMs = Math.round((audio.currentTime || 0) * 1000)
  const durationMs = Math.round((track.duration || player.duration || 0) * 1000)
  const passive = playSession.passive
  const ratio = durationMs > 0 ? playedMs / durationMs : 0
  const reason = opts.reason ?? 'advance'

  const shouldSkip =
    reason === 'explicit_skip' ||
    (!passive && playedMs > 0 && playedMs < SKIP_THRESHOLD_MS)
  const shouldComplete =
    reason === 'natural_end' || (durationMs > 0 && ratio >= 0.85)

  if (shouldSkip && !shouldComplete) {
    void recordMusicInteraction({
      entityType: 'track',
      entityId: track.id,
      trackId: track.id,
      action: 'skip',
      source: launchContext.source,
      passive: reason === 'explicit_skip' ? false : passive,
      playedMs,
      durationMs: durationMs || undefined,
    })
  } else if (shouldComplete) {
    void recordMusicInteraction({
      entityType: 'track',
      entityId: track.id,
      trackId: track.id,
      action: 'complete',
      source: launchContext.source,
      passive,
      playedMs,
      durationMs,
    })
  }

  playSession = { trackId: null, passive: true }
}

export const player = $state({
  queue: /** @type {import('./types.js').Track[]} */ ([]),
  index: 0,
  playing: false,
  shuffle: false,
  repeat: /** @type {import('./types.js').RepeatMode} */ ('off'),
  currentTime: 0,
  duration: 0,
  ready: false,
  volume: 1,
  muted: false,
  /** True while resolving/buffering a track that isn't playable yet. */
  loading: false,
  /** Inline hint on now-playing (non-blocking; avoids toast over lyrics). */
  statusHint: '',
})

/** Restore volume from settings on first audio init. */
function applyVolumeSettings() {
  player.volume = S.settings.volume ?? 1
  player.muted = S.settings.muted ?? false
  syncOutputGains()
}

function applyVolumeToElement(_el) {
  syncOutputGains()
}

function applyVolumeToAll() {
  syncOutputGains()
}

/** @param {number} v */
export function setVolume(v) {
  const next = Math.max(0, Math.min(1, v))
  player.volume = next
  applyVolumeToAll()
  if (next > 0) player.muted = false
  patchLocalSettings({
    volume: next,
    ...(next > 0 ? { muted: false } : {}),
  })
}

export function toggleMute() {
  player.muted = !player.muted
  applyVolumeToAll()
  patchLocalSettings({ muted: player.muted })
}

function scheduleSaveSession() {
  if (!browser) return
  clearTimeout(sessionTimer)
  sessionTimer = setTimeout(saveSession, 400)
}

function saveSession() {
  if (!browser || !player.queue.length) return
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      queueIds: player.queue.map((t) => t.id),
      index: player.index,
      currentTime: player.currentTime,
      playing: player.playing,
    }),
  )
}

export function persistPlayerSessionNow() {
  if (!browser) return
  clearTimeout(sessionTimer)
  saveSession()
}

function emitPlaybackState() {
  if (!browser) return
  window.dispatchEvent(
    new CustomEvent('musicos:playback-state', {
      detail: { playing: player.playing },
    }),
  )
}

/** @returns {Promise<{ tracks: import('./types.js').Track[]; index: number; currentTime: number; playing: boolean } | null>} */
export async function restoreLastSession() {
  if (!browser) return null
  try {
    await ensureAlbumArtCache()
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data.queueIds) || !data.queueIds.length) return null
    const rows = await db.tracks.bulkGet(data.queueIds)
    const tracks = data.queueIds
      .map((id) => rows.find((r) => r?.id === id))
      .filter(Boolean)
      .map(hydrateTrack)
    if (!tracks.length) return null
    const index = Math.max(0, Math.min(data.index ?? 0, tracks.length - 1))
    return {
      tracks,
      index,
      currentTime: data.currentTime ?? 0,
      playing: Boolean(data.playing),
    }
  } catch {
    return null
  }
}

/** @param {{ tracks: import('./types.js').Track[]; index: number; currentTime?: number; autoplay?: boolean }} opts */
export async function resumeSession(opts) {
  if (!opts.tracks.length) return
  player.queue = opts.tracks
  player.index = opts.index
  await loadAndPlay({
    seekTo: opts.currentTime ?? 0,
    autoplay: opts.autoplay ?? false,
  })
}

export function getCurrentTrack() {
  return player.queue[player.index] ?? null
}

/** @returns {HTMLAudioElement | null} */
export function getAudioElement() {
  return getActiveAudio()
}

/** Prime output in the same user-gesture stack before async signed URL work. */
export function primeAudioPlayback() {
  ensureAudio()
  declarePlaybackSession()
  void resumeAudioContext()
}

/** @param {import('./types.js').Track[]} tracks @param {number} [startIndex] @param {import('./musicInteractions.js').PlaySource} [source] @param {{ entityType?: import('./musicInteractions.js').EntityType, entityId?: string, passive?: boolean }} [meta] */
export function playTracks(
  tracks,
  startIndex = 0,
  source = 'unknown',
  meta = {},
) {
  if (!tracks.length) return
  let index = Math.max(0, Math.min(startIndex, tracks.length - 1))
  let queue = tracks
  if (player.shuffle && tracks.length > 1) {
    const current = tracks[index]
    const rest = tracks.filter((_, i) => i !== index)
    queue = [current, ...shuffleCopy(rest)]
    index = 0
  }
  launchContext = {
    source,
    passive: Boolean(meta.passive),
    entityType: meta.entityType ?? 'track',
    entityId: meta.entityId ?? tracks[index]?.id ?? null,
  }
  primeAudioPlayback()
  crossfadeToken++
  invalidatePreload()
  player.queue = queue
  player.index = index
  void loadAndPlay()
}

/**
 * Warm signed-URL cache + SW audio bytes before the user commits to playing
 * (e.g. on pointerdown, ~100ms ahead of click) so network work overlaps the tap.
 * @param {import('./types.js').Track | null | undefined} track
 */
export function prewarmTrack(track) {
  if (!track || !browser) return
  warmTrackAudioFireAndForget(track)
}

/** @param {import('./types.js').Track} track @param {import('./musicInteractions.js').PlaySource} [source] */
export function playTrack(track, source = 'unknown') {
  playTracks([track], 0, source, { entityType: 'track', entityId: track.id })
}

/** @param {import('./types.js').Track[]} tracks Append to queue tail (Play After). */
export function appendToQueue(tracks) {
  if (!tracks.length) return
  player.queue = [...player.queue, ...tracks]
  if (!getCurrentTrack()) {
    player.index = 0
    void loadAndPlay()
  } else {
    void preloadNextTrack()
  }
}

/**
 * Insert after the current track (Play Next). Duplicates elsewhere in the queue are moved here.
 * @param {import('./types.js').Track[]} tracks
 */
export function insertAfterCurrent(tracks) {
  if (!tracks.length) return
  const current = getCurrentTrack()
  if (!current) {
    playTracks(tracks, 0)
    return
  }
  const insertIds = new Set(tracks.map((t) => t.id))
  const withoutDupes = player.queue.filter(
    (t, i) => i === player.index || !insertIds.has(t.id),
  )
  const curIdx = withoutDupes.findIndex((t) => t.id === current.id)
  const toInsert = tracks.filter((t) => t.id !== current.id)
  if (!toInsert.length) return
  withoutDupes.splice(curIdx + 1, 0, ...toInsert)
  player.queue = withoutDupes
  player.index = curIdx
  invalidatePreload()
  void preloadNextTrack()
}

/** Shuffle upcoming tracks once (industry-standard shuffle-as-preorder). */
function reshuffleUpcomingOnly() {
  if (player.queue.length <= 1 || player.index >= player.queue.length - 1)
    return
  const head = player.queue.slice(0, player.index + 1)
  const tail = shuffleCopy(player.queue.slice(player.index + 1))
  player.queue = [...head, ...tail]
  invalidatePreload()
}

export function togglePlay() {
  const audio = getActiveAudio()
  if (!audio || !getCurrentTrack()) return
  primeAudioPlayback()
  if (player.playing) audio.pause()
  else {
    const track = getCurrentTrack()
    if (!audio.src && track && !hasPlayableSource(track)) {
      void loadAndPlay({ fromToggle: true })
      return
    }
    void startPlayback(audio.src, loadToken, track, { fromToggle: true })
  }
}

/** @returns {number | null} Queue index of the upcoming track, or null if unknown/end. */
export function getUpcomingIndex() {
  if (!player.queue.length) return null
  if (player.queue.length === 1 && player.repeat !== 'all') return null

  shufflePreloadIndex = null
  if (player.index < player.queue.length - 1) return player.index + 1
  if (player.repeat === 'all') return 0
  return null
}

/** @returns {number} Crossfade duration in ms (0 = disabled). */
function getCrossfadeMs() {
  return Math.max(0, Math.min(12_000, Number(S.settings.crossfadeMs) || 0))
}

/** Seconds before track end to begin transition (gapless handoff or crossfade). */
function getHandoffSec() {
  const duration = player.duration || 0
  const crossfadeSec = getCrossfadeMs() / 1000
  if (crossfadeSec > 0) {
    if (duration > 0) return Math.min(crossfadeSec, duration * 0.5)
    return crossfadeSec
  }
  return 0.08
}

function invalidatePreload() {
  preloadState = {
    trackId: null,
    token: preloadState.token + 1,
    ready: false,
  }
  shufflePreloadIndex = null
  const standby = getStandbyAudio()
  if (standby) {
    standby.pause()
    standby.removeAttribute('src')
    standby.load()
  }
}

/** Warm signed-URL cache + SW bytes for the next queue item (gapless or not). */
async function prefetchNextTrackUrl() {
  if (!browser) return
  const nextIndex = getUpcomingIndex()
  if (nextIndex == null) return
  const track = player.queue[nextIndex]
  if (!track) return
  const keepIds = [getCurrentTrack()?.id, track.id].filter(Boolean)
  await warmTrackAudio(track, keepIds)
}

/** @param {import('./types.js').Track} track @returns {Promise<string>} */
async function resolveTrackSrc(track) {
  let src = resolvePlayUrlSync(track)
  if (!src) src = await resolvePlayUrl(track)
  return src
}

/** Preload the next track into the standby audio element (gapless queue). */
async function preloadNextTrack() {
  if (!S.settings.gapless || !browser) return
  ensureAudio()
  const standby = getStandbyAudio()
  if (!standby) return

  const nextIndex = getUpcomingIndex()
  if (nextIndex == null) {
    invalidatePreload()
    return
  }

  const track = player.queue[nextIndex]
  if (!track) return
  if (preloadState.trackId === track.id && preloadState.ready) return

  void prefetchNextTrackUrl()

  const token = ++preloadState.token
  preloadState.ready = false
  hydrateTrack(track)

  let src = resolvePlayUrlSync(track)
  if (!src) {
    try {
      src = await resolveTrackSrc(track)
    } catch {
      return
    }
  }

  if (token !== preloadState.token) return
  preloadState.trackId = track.id
  const warmMode = getWarmByteMode()
  if (warmMode !== 'none') {
    precacheAudioInServiceWorker(src, track.id, { mode: warmMode })
  }

  const markReady = () => {
    if (token !== preloadState.token || preloadState.trackId !== track.id)
      return
    preloadState.ready = true
  }

  standby.addEventListener('canplaythrough', markReady, { once: true })
  standby.addEventListener(
    'canplay',
    () => {
      if (standby.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) markReady()
    },
    { once: true },
  )

  if (standby.src !== src) {
    standby.src = src
    standby.load()
  } else if (standby.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    markReady()
  }
}

/** @param {import('./types.js').Track} track */
function isStandbyReadyFor(track) {
  if (!S.settings.gapless) return false
  const standby = getStandbyAudio()
  if (!standby || preloadState.trackId !== track.id) return false
  if (preloadState.ready) return true
  return standby.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
}

/** @param {import('./types.js').Track} track */
function beginTrackSession(track) {
  recordPlay(track.id)
  void recordMusicInteraction({
    entityType: launchContext.entityType,
    entityId: launchContext.entityId || track.id,
    trackId: track.id,
    action: 'play',
    source: launchContext.source,
    passive: launchContext.passive,
    durationMs: track.duration ? track.duration * 1000 : undefined,
  })
  playSession = { trackId: track.id, passive: launchContext.passive }
  updateMediaSession(track, true)
  scheduleSaveSession()
  gaplessHandoff = false
  shufflePreloadIndex = null
  const keepIds = [track.id]
  const nextIdx = getUpcomingIndex()
  if (nextIdx != null && player.queue[nextIdx]?.id) {
    keepIds.push(player.queue[nextIdx].id)
  }
  purgeAudioCacheInServiceWorker(keepIds)
  void trimAudioBlobCache(keepIds)
  const src = getActiveAudio()?.src
  if (src) scheduleFullAudioBlobCache(track, src, keepIds)
  void preloadNextTrack()
}

/** @param {HTMLAudioElement} el */
function audibleVolume(_el) {
  return player.muted ? 0 : player.volume
}

/** Crossfade active → standby (Web Audio equal-power when graph ready, else element volume). */
async function crossfadeToPreloadedTrack(track) {
  const outgoing = getActiveAudio()
  const incoming = getStandbyAudio()
  if (!outgoing || !incoming || !isStandbyReadyFor(track)) return false

  const ms = getCrossfadeMs()
  if (ms <= 0) return false

  const token = ++crossfadeToken
  crossfadeInProgress = true
  const targetVol = audibleVolume(outgoing)
  const outSlot = activeSlot
  const inSlot = getStandbySlot()

  incoming.currentTime = 0
  updateMediaSession(track, false)

  await ensurePlaybackGraph()
  const useWebAudio = isPlaybackGraphReady()

  if (useWebAudio) {
    outgoing.volume = 1
    incoming.volume = 1
    setSlotGainImmediate(outSlot, targetVol)
    setSlotGainImmediate(inSlot, 0)
  } else {
    incoming.volume = 0
  }

  await resumeAudioContext()

  try {
    await incoming.play()
  } catch {
    try {
      await waitCanPlay(incoming)
      await incoming.play()
    } catch {
      crossfadeInProgress = false
      syncOutputGains()
      return false
    }
  }

  if (token !== crossfadeToken) {
    incoming.pause()
    crossfadeInProgress = false
    syncOutputGains()
    return false
  }

  if (useWebAudio) {
    const ok = await rampCrossfade({
      outSlot,
      inSlot,
      ms,
      volume: targetVol,
      token,
      getToken: () => crossfadeToken,
    })
    if (!ok || token !== crossfadeToken) {
      incoming.pause()
      crossfadeInProgress = false
      syncOutputGains()
      return false
    }
  } else {
    const started = performance.now()
    await new Promise((resolve) => {
      /** @type {number | null} */
      let frame = null
      const step = (now) => {
        if (token !== crossfadeToken) {
          if (frame != null) cancelAnimationFrame(frame)
          resolve(undefined)
          return
        }
        const t = Math.min(1, (now - started) / ms)
        const angle = t * Math.PI * 0.5
        outgoing.volume = targetVol * Math.cos(angle)
        incoming.volume = targetVol * Math.sin(angle)
        if (t < 1) frame = requestAnimationFrame(step)
        else resolve(undefined)
      }
      frame = requestAnimationFrame(step)
    })

    if (token !== crossfadeToken) {
      crossfadeInProgress = false
      syncOutputGains()
      return false
    }
  }

  outgoing.pause()
  outgoing.currentTime = 0

  swapActiveSlot()
  preloadState = { trackId: null, token: preloadState.token, ready: false }
  player.duration = track.duration || incoming.duration || 0
  player.statusHint = ''
  player.currentTime = incoming.currentTime || 0
  crossfadeInProgress = false
  syncOutputGains()
  beginTrackSession(track)
  return true
}

/** Instant swap to a preloaded standby element — no src reload gap. */
async function activatePreloadedTrack(track) {
  const standby = getStandbyAudio()
  const active = getActiveAudio()
  if (!standby || !active || !isStandbyReadyFor(track)) return false

  active.pause()
  standby.currentTime = 0
  swapActiveSlot()
  preloadState = { trackId: null, token: preloadState.token, ready: false }

  player.duration = track.duration || standby.duration || 0
  player.statusHint = ''
  player.currentTime = 0
  updateMediaSession(track, false)
  syncOutputGains()

  await ensurePlaybackGraph()
  await resumeAudioContext()

  try {
    await standby.play()
  } catch {
    try {
      await waitCanPlay(standby)
      await standby.play()
    } catch {
      swapActiveSlot()
      return false
    }
  }

  beginTrackSession(track)
  return true
}

/** Crossfade when configured, otherwise hard gapless swap. */
async function transitionToPreloadedTrack(track) {
  if (getCrossfadeMs() > 0) {
    if (await crossfadeToPreloadedTrack(track)) return true
  }
  return activatePreloadedTrack(track)
}

/** Re-run preload after playback settings change. */
export function notifyPlaybackSettingsChanged() {
  invalidatePreload()
  void preloadNextTrack()
}

/** @param {{ fromEnded?: boolean }} [opts] */
async function advanceQueueIndex(opts = {}) {
  if (!player.queue.length) return false
  finalizePlaySession({
    reason: opts.fromEnded ? 'natural_end' : 'explicit_skip',
  })
  markPassiveAdvance()

  if (player.index < player.queue.length - 1) {
    player.index += 1
    return true
  }
  if (player.repeat === 'all') {
    player.index = 0
    return true
  }

  await tryAutoContinueAtQueueEnd()
  return false
}

/** @param {{ fromEnded?: boolean }} [opts] */
async function performTrackAdvance(opts = {}) {
  const advanced = await advanceQueueIndex(opts)
  if (!advanced) return
  const track = getCurrentTrack()
  if (!track) return
  if (await transitionToPreloadedTrack(track)) return
  await loadAndPlay()
}

export function nextTrack({ fromEnded = false } = {}) {
  if (!player.queue.length) return
  if (crossfadeInProgress) crossfadeToken++
  void performTrackAdvance({ fromEnded })
}

async function tryAutoContinueAtQueueEnd() {
  if (S.settings.autoContinueSimilar === false) return
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { tryAutoContinueQueue } = await import('./recommendations.js')
    const { added, shouldAdvance } = await tryAutoContinueQueue()
    if (shouldAdvance && player.index < player.queue.length - 1) {
      player.index += 1
      const track = getCurrentTrack()
      if (track && (await transitionToPreloadedTrack(track))) return
      void loadAndPlay()
    } else if (added > 0) {
      player.statusHint = t('nowPlaying.continueSimilarAdded', { count: added })
      void preloadNextTrack()
    }
  } catch {
    /* silent */
  }
}

export function prevTrack() {
  if (!player.queue.length) return
  if (crossfadeInProgress) crossfadeToken++
  const audio = getActiveAudio()
  if (audio && player.currentTime > 3) {
    seek(0)
    return
  }
  finalizePlaySession({ reason: 'explicit_skip' })
  markPassiveAdvance()
  invalidatePreload()
  if (player.index > 0) player.index -= 1
  else if (player.repeat === 'all') player.index = player.queue.length - 1
  else {
    seek(0)
    return
  }
  void loadAndPlay()
}

export function toggleShuffle() {
  player.shuffle = !player.shuffle
  if (player.shuffle) reshuffleUpcomingOnly()
  void preloadNextTrack()
}

export function cycleRepeat() {
  player.repeat =
    player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off'
  void preloadNextTrack()
}

/** @param {number} t */
export function seek(t) {
  const audio = getActiveAudio()
  if (!audio) return
  audio.currentTime = t
  player.currentTime = t
}

/** @param {HTMLAudioElement} el @param {number} [timeoutMs] */
function waitCanPlay(el, timeoutMs = 12_000) {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA)
    return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, timeoutMs)
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(el.error || new Error('media-error'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      el.removeEventListener('canplay', onReady)
      el.removeEventListener('error', onErr)
    }
    el.addEventListener('canplay', onReady, { once: true })
    el.addEventListener('error', onErr, { once: true })
  })
}

/** @param {string} msg */
async function playbackToast(msg, opts = {}) {
  const { toast } = await import('./ui.svelte.js')
  toast(msg, opts)
}

/**
 * @param {string} src
 * @param {number} token
 * @param {import('./types.js').Track} track
 * @param {{ fromToggle?: boolean, retried?: boolean }} [opts]
 */
async function startPlayback(src, token, track, opts = {}) {
  const audio = getActiveAudio()
  if (!audio || token !== loadToken || getCurrentTrack()?.id !== track.id)
    return false
  if (!src) {
    markPlayFailed('no_source')
    if (opts.fromToggle) {
      await playbackToast(t('player.noSource'), { error: true })
    } else {
      player.statusHint = hasPlayableSource(track)
        ? ''
        : t('player.lyricsOnlyHint')
    }
    return false
  }

  player.statusHint = ''

  if (audio.src !== src) {
    audio.src = src
    audio.load()
  }

  await resumeAudioContext()
  syncOutputGains()

  const onCanPlay = () => markCanplay()
  audio.addEventListener('canplay', onCanPlay, { once: true })

  try {
    await audio.play()
    markPlaying()
    return true
  } catch {
    try {
      await waitCanPlay(audio)
      markCanplay()
      await audio.play()
      markPlaying()
      return true
    } catch (err) {
      if (
        !opts.retried &&
        track.storagePath &&
        token === loadToken &&
        getCurrentTrack()?.id === track.id
      ) {
        try {
          invalidateSignedAudioUrl(track.storagePath)
          const fresh = await getSignedAudioUrl(track.storagePath)
          if (token !== loadToken || getCurrentTrack()?.id !== track.id)
            return false
          return startPlayback(fresh, token, track, {
            ...opts,
            retried: true,
          })
        } catch {
          /* fall through to failure UI */
        }
      }
      void err
      markPlayFailed(t('player.playFailed'), { retried: Boolean(opts.retried) })
      if (opts.fromToggle) {
        await playbackToast(t('player.playFailed'), { error: true })
      } else {
        player.statusHint = t('player.playFailed')
      }
      return false
    }
  } finally {
    audio.removeEventListener('canplay', onCanPlay)
  }
}

async function loadAndPlay(opts = {}) {
  const track = getCurrentTrack()
  if (!track || !browser) return
  ensureAudio()
  const audio = getActiveAudio()
  if (!audio) return

  invalidatePreload()
  const token = ++loadToken
  hydrateTrack(track)
  player.statusHint = ''
  player.duration = track.duration || 0
  if (typeof opts.seekTo === 'number' && opts.seekTo > 0) {
    player.currentTime = opts.seekTo
  }
  if (opts.autoplay !== false) {
    player.loading = true
    markPlayRequest(track.id)
  }

  /** @type {import('./playMetrics.js').PlayUrlSource} */
  let urlSource = 'unknown'
  let src = resolvePlayUrlSync(track)
  if (src) {
    urlSource = classifyPlayUrlSource(track, src)
  } else {
    try {
      const hadSigned = Boolean(
        track.storagePath && peekSignedAudioUrl(track.storagePath),
      )
      src = await resolvePlayUrl(track)
      urlSource = classifyPlayUrlSource(track, src)
      if (urlSource === 'signed' && !hadSigned) urlSource = 'network'
    } catch (err) {
      if (token === loadToken) player.loading = false
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false
      const msg = offline ? t('player.offlineUncached') : syncErrorMessage(err)
      markPlayFailed(msg)
      if (opts.fromToggle) {
        await playbackToast(msg, { error: true })
      } else {
        player.statusHint = msg
      }
      return
    }
  }
  if (opts.autoplay !== false) markUrlResolved(urlSource)

  if (token !== loadToken || getCurrentTrack()?.id !== track.id) return
  player.duration = track.duration || 0
  updateMediaSession(track, false)

  if (typeof opts.seekTo === 'number' && opts.seekTo > 0) {
    const seekTarget = opts.seekTo
    const once = () => {
      seek(seekTarget)
      audio.removeEventListener('loadedmetadata', once)
    }
    audio.addEventListener('loadedmetadata', once, { once: true })
  }

  if (opts.autoplay === false) {
    if (audio.src !== src) {
      audio.src = src
      audio.load()
    }
    scheduleSaveSession()
    void preloadNextTrack()
    return
  }

  const ok = await startPlayback(src, token, track, opts)
  if (token === loadToken) player.loading = false
  if (!ok || token !== loadToken) return

  beginTrackSession(track)
  void prefetchNextTrackUrl()
  // Prefer IDB full cache; skip SW full when IDB will own the bytes.
  const warmMode = getWarmByteMode()
  if (warmMode === 'range') {
    precacheAudioInServiceWorker(src, track.id, { mode: 'range' })
  }
}

/** @param {'a' | 'b'} slot */
function onAudioEnded(slot) {
  if (slot !== activeSlot) return
  const audio = getActiveAudio()
  if (!audio) return

  if (player.repeat === 'one') {
    seek(0)
    void audio.play()
    return
  }

  if (gaplessHandoff) {
    gaplessHandoff = false
    return
  }

  if (crossfadeInProgress) return

  void performTrackAdvance({ fromEnded: true })
}

/** @param {'a' | 'b'} slot */
function onTimeUpdate(slot) {
  if (slot !== activeSlot) return
  const audio = getActiveAudio()
  if (!audio) return

  player.currentTime = audio.currentTime || 0
  player.duration = audio.duration || player.duration
  updatePositionState(audio)
  scheduleSaveSession()

  if (
    S.settings.gapless &&
    !gaplessHandoff &&
    !crossfadeInProgress &&
    player.repeat !== 'one' &&
    player.duration > 0
  ) {
    const remaining = player.duration - player.currentTime
    const handoffSec = getHandoffSec()
    const nextIndex = getUpcomingIndex()
    const next = nextIndex != null ? player.queue[nextIndex] : null
    if (
      remaining > 0 &&
      remaining <= handoffSec &&
      next &&
      isStandbyReadyFor(next)
    ) {
      gaplessHandoff = true
      void performTrackAdvance({ fromEnded: true })
    }
  }
}

/** @param {HTMLAudioElement} el @param {'a' | 'b'} slot */
function wireAudioElement(el, slot) {
  el.addEventListener('loadedmetadata', () => {
    if (slot !== activeSlot) return
    const d = el.duration
    if (!d || !Number.isFinite(d) || d <= 0) return
    player.duration = d
    updatePositionState(el)
    const track = getCurrentTrack()
    if (!track || (track.duration && track.duration > 0)) return
    void db.tracks.update(track.id, { duration: d }).then(() => {
      track.duration = d
      scheduleAutoCloudPush()
    })
  })

  el.addEventListener('timeupdate', () => onTimeUpdate(slot))
  el.addEventListener('play', () => {
    if (slot !== activeSlot) return
    player.playing = true
    updateMediaSession(getCurrentTrack(), true)
    updatePositionState(el)
    emitPlaybackState()
  })
  el.addEventListener('pause', () => {
    if (slot !== activeSlot) return
    player.playing = false
    updateMediaSession(getCurrentTrack(), false)
    updatePositionState(el)
    persistPlayerSessionNow()
    emitPlaybackState()
  })
  el.addEventListener('ended', () => onAudioEnded(slot))
}

/** @returns {HTMLAudioElement} */
function createHiddenAudio() {
  const el = document.createElement('audio')
  el.preload = 'auto'
  el.playsInline = true
  el.crossOrigin = 'anonymous'
  el.setAttribute('playsinline', '')
  el.setAttribute('webkit-playsinline', 'true')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;width:0;height:0;opacity:0;pointer-events:none'
  return el
}

function ensureAudio() {
  if (audioA || !browser) return

  audioA = createHiddenAudio()
  audioB = createHiddenAudio()
  audioA.id = 'music-os-player-a'
  audioB.id = 'music-os-player-b'
  document.body.appendChild(audioA)
  document.body.appendChild(audioB)

  wireAudioElement(audioA, 'a')
  wireAudioElement(audioB, 'b')
  registerAudioPool(audioA, audioB)
  syncOutputGains()

  bindMediaSessionHandlers({
    play: () => {
      primeAudioPlayback()
      const audio = getActiveAudio()
      const track = getCurrentTrack()
      if (!audio || !track) return
      if (!audio.src) {
        void loadAndPlay({ fromToggle: true })
        return
      }
      void audio.play()
    },
    pause: () => getActiveAudio()?.pause(),
    next: nextTrack,
    prev: prevTrack,
    seekTo: (time) => {
      seek(time)
      const audio = getActiveAudio()
      if (audio) updatePositionState(audio)
    },
    seekBy: (delta) => {
      const audio = getActiveAudio()
      if (!audio) return
      const next = Math.max(
        0,
        Math.min(audio.currentTime + delta, audio.duration || Infinity),
      )
      seek(next)
      updatePositionState(audio)
    },
  })
  player.ready = true
  applyVolumeSettings()
}

/** @param {number} sec */
export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** @param {number} current @param {number} duration */
export function formatTimeRemaining(current, duration) {
  if (!duration || duration <= 0) return '--:--'
  const rem = Math.max(0, (duration || 0) - (current || 0))
  return `-${formatTime(rem)}`
}

/** Max value for seek sliders; 0 when duration unknown. */
export function getSeekMax() {
  return player.duration > 0 ? player.duration : 0
}

/** Whether the current track supports scrubbing. */
export function isSeekable() {
  return player.duration > 0
}

/** Screen-reader friendly position (WAI-ARIA slider-valuetext). */
export function formatSeekAriaText(current, duration) {
  if (!duration || duration <= 0) return t('player.seekUnavailable')
  return `${formatTime(current)}，共 ${formatTime(duration)}`
}

export function getProgressPct() {
  return player.duration > 0
    ? `${(player.currentTime / player.duration) * 100}%`
    : '0%'
}

/** Refresh metadata (lyrics/tags) on queued tracks after a library rescan. */
export async function refreshQueueMetadata() {
  if (!player.queue.length) return
  const next = await Promise.all(
    player.queue.map(async (track) => {
      const row = await db.tracks.get(track.id)
      if (!row) return track
      return hydrateTrack({
        ...track,
        ...row,
        objectUrl: track.objectUrl,
        audioBlob: track.audioBlob ?? row.audioBlob,
      })
    }),
  )
  player.queue = next
  void preloadNextTrack()
}

/** @param {import('$lib/types.js').Track[]} tracks */
export function setQueueOrder(tracks) {
  if (!tracks.length) {
    clearQueue()
    return
  }
  const currentId = getCurrentTrack()?.id
  player.queue = tracks
  if (currentId) {
    const nextIndex = tracks.findIndex((t) => t.id === currentId)
    if (nextIndex >= 0) player.index = nextIndex
  }
  invalidatePreload()
  void preloadNextTrack()
}

/** @param {number} fromIndex @param {number} toIndex */
export function reorderQueue(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
  const q = [...player.queue]
  if (fromIndex >= q.length || toIndex >= q.length) return
  const currentId = getCurrentTrack()?.id
  const [item] = q.splice(fromIndex, 1)
  q.splice(toIndex, 0, item)
  player.queue = q
  if (currentId) {
    const nextIndex = q.findIndex((t) => t.id === currentId)
    if (nextIndex >= 0) player.index = nextIndex
  }
  invalidatePreload()
  void preloadNextTrack()
}

/** @param {number} index @param {-1 | 1} delta */
export function moveQueueItem(index, delta) {
  reorderQueue(index, index + delta)
}

function stopAudio() {
  if (audioA) {
    audioA.pause()
    audioA.removeAttribute('src')
    audioA.load()
  }
  if (audioB) {
    audioB.pause()
    audioB.removeAttribute('src')
    audioB.load()
  }
  invalidatePreload()
  player.playing = false
  player.currentTime = 0
  player.duration = 0
  player.statusHint = ''
  updateMediaSession(null, false)
}

/** @param {number} index */
export function removeFromQueue(index) {
  if (index < 0 || index >= player.queue.length) return
  const wasCurrent = index === player.index
  const q = player.queue.filter((_, i) => i !== index)
  player.queue = q
  if (!q.length) {
    player.index = 0
    stopAudio()
    return
  }
  if (wasCurrent) {
    player.index = Math.min(index, q.length - 1)
    invalidatePreload()
    void loadAndPlay()
  } else if (index < player.index) {
    player.index -= 1
    void preloadNextTrack()
  }
}

export function clearQueue() {
  player.queue = []
  player.index = 0
  stopAudio()
}
