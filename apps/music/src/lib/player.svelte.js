import { browser } from '$app/environment'
import { db, hydrateTrack, recordPlay } from './db.js'
import {
  recordMusicInteraction,
  SKIP_THRESHOLD_MS,
} from './musicInteractions.js'
import {
  resolvePlayUrl,
  resolvePlayUrlSync,
  hasPlayableSource,
} from './cloudAudio.js'
import { registerAudioElement, resumeAudioContext } from './audioAnalyser.js'
import {
  bindMediaSessionHandlers,
  declarePlaybackSession,
  updateMediaSession,
  updatePositionState,
} from './mediaSession.js'
import { syncErrorMessage, scheduleAutoCloudPush } from './sync.js'
import { t } from './i18n/index.js'
import { S, save } from './state.svelte.js'
import { supabase } from './supabase.js'

/** @type {HTMLAudioElement | null} */
let audio = null
let loadToken = 0
const SESSION_KEY = 'musicos_player_session'
let sessionTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

/** @type {{ source: import('./musicInteractions.js').PlaySource, passive: boolean, entityType: import('./musicInteractions.js').EntityType, entityId: string | null }} */
let launchContext = {
  source: 'unknown',
  passive: true,
  entityType: 'track',
  entityId: null,
}

/** @type {{ trackId: string | null, passive: boolean }} */
let playSession = { trackId: null, passive: true }

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
  /** Inline hint on now-playing (non-blocking; avoids toast over lyrics). */
  statusHint: '',
})

/** Restore volume from settings on first audio init. */
function applyVolumeSettings() {
  if (!audio) return
  player.volume = S.settings.volume ?? 1
  player.muted = S.settings.muted ?? false
  audio.volume = player.muted ? 0 : player.volume
  audio.muted = player.muted
}

/** @param {number} v */
export function setVolume(v) {
  const next = Math.max(0, Math.min(1, v))
  player.volume = next
  if (audio) {
    audio.volume = player.muted ? 0 : next
  }
  S.settings.volume = next
  if (next > 0) {
    player.muted = false
    S.settings.muted = false
    if (audio) audio.muted = false
  }
  save()
}

export function toggleMute() {
  player.muted = !player.muted
  if (audio) {
    audio.muted = player.muted
    audio.volume = player.muted ? 0 : player.volume
  }
  S.settings.muted = player.muted
  save()
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

/** @returns {Promise<{ tracks: import('./types.js').Track[]; index: number; currentTime: number; playing: boolean } | null>} */
export async function restoreLastSession() {
  if (!browser) return null
  try {
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
  return audio
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
  const index = Math.max(0, Math.min(startIndex, tracks.length - 1))
  launchContext = {
    source,
    passive: Boolean(meta.passive),
    entityType: meta.entityType ?? 'track',
    entityId: meta.entityId ?? tracks[index]?.id ?? null,
  }
  primeAudioPlayback()
  player.queue = tracks
  player.index = index
  void loadAndPlay()
}

/** @param {import('./types.js').Track} track @param {import('./musicInteractions.js').PlaySource} [source] */
export function playTrack(track, source = 'unknown') {
  playTracks([track], 0, source, { entityType: 'track', entityId: track.id })
}

/** @param {import('./types.js').Track[]} tracks */
export function appendToQueue(tracks) {
  player.queue = [...player.queue, ...tracks]
  if (!getCurrentTrack()) {
    player.index = 0
    void loadAndPlay()
  }
}

export function togglePlay() {
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

export function nextTrack({ fromEnded = false } = {}) {
  if (!player.queue.length) return
  finalizePlaySession({ reason: fromEnded ? 'natural_end' : 'explicit_skip' })
  markPassiveAdvance()
  if (player.shuffle) {
    player.index = Math.floor(Math.random() * player.queue.length)
  } else if (player.index < player.queue.length - 1) {
    player.index += 1
  } else if (player.repeat === 'all') {
    player.index = 0
  } else {
    void tryAutoContinueAtQueueEnd()
    return
  }
  void loadAndPlay()
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
      void loadAndPlay()
    } else if (added > 0) {
      player.statusHint = t('nowPlaying.continueSimilarAdded', { count: added })
    }
  } catch {
    /* silent */
  }
}

export function prevTrack() {
  if (!player.queue.length) return
  if (player.currentTime > 3) {
    seek(0)
    return
  }
  finalizePlaySession({ reason: 'explicit_skip' })
  markPassiveAdvance()
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
}

export function cycleRepeat() {
  player.repeat =
    player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off'
}

/** @param {number} t */
export function seek(t) {
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
 * @param {{ fromToggle?: boolean }} [opts]
 */
async function startPlayback(src, token, track, opts = {}) {
  if (!audio || token !== loadToken || getCurrentTrack()?.id !== track.id)
    return false
  if (!src) {
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

  try {
    await audio.play()
    return true
  } catch {
    try {
      await waitCanPlay(audio)
      await audio.play()
      return true
    } catch {
      if (opts.fromToggle) {
        await playbackToast(t('player.playFailed'), { error: true })
      } else {
        player.statusHint = t('player.playFailed')
      }
      return false
    }
  }
}

async function loadAndPlay(opts = {}) {
  const track = getCurrentTrack()
  if (!track || !browser) return
  ensureAudio()
  if (!audio) return
  const token = ++loadToken
  hydrateTrack(track)
  player.statusHint = ''

  let src = resolvePlayUrlSync(track)
  if (!src) {
    try {
      src = await resolvePlayUrl(track)
    } catch (err) {
      if (opts.fromToggle) {
        await playbackToast(syncErrorMessage(err), { error: true })
      } else {
        player.statusHint = syncErrorMessage(err)
      }
      return
    }
  }

  if (token !== loadToken || getCurrentTrack()?.id !== track.id) return
  player.duration = track.duration || 0
  updateMediaSession(track, false)

  if (typeof opts.seekTo === 'number' && opts.seekTo > 0) {
    const seekTarget = opts.seekTo
    const once = () => {
      seek(seekTarget)
      audio?.removeEventListener('loadedmetadata', once)
    }
    audio?.addEventListener('loadedmetadata', once, { once: true })
  }

  if (opts.autoplay === false) {
    if (audio.src !== src) {
      audio.src = src
      audio.load()
    }
    scheduleSaveSession()
    return
  }

  const ok = await startPlayback(src, token, track, opts)
  if (!ok || token !== loadToken) return

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
}

function ensureAudio() {
  if (audio || !browser) return
  audio = document.createElement('audio')
  audio.id = 'music-os-player'
  audio.preload = 'auto'
  audio.playsInline = true
  audio.crossOrigin = 'anonymous'
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', 'true')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.cssText =
    'position:fixed;width:0;height:0;opacity:0;pointer-events:none'
  document.body.appendChild(audio)
  registerAudioElement(audio)

  audio.addEventListener('loadedmetadata', () => {
    const d = audio?.duration
    if (!d || !Number.isFinite(d) || d <= 0) return
    player.duration = d
    const track = getCurrentTrack()
    if (!track || (track.duration && track.duration > 0)) return
    void db.tracks.update(track.id, { duration: d }).then(() => {
      track.duration = d
      scheduleAutoCloudPush()
    })
  })

  audio.addEventListener('timeupdate', () => {
    player.currentTime = audio?.currentTime || 0
    player.duration = audio?.duration || player.duration
    updatePositionState(audio)
    scheduleSaveSession()
  })
  audio.addEventListener('play', () => {
    player.playing = true
    updateMediaSession(getCurrentTrack(), true)
  })
  audio.addEventListener('pause', () => {
    player.playing = false
    updateMediaSession(getCurrentTrack(), false)
  })
  audio.addEventListener('ended', () => {
    if (player.repeat === 'one') {
      seek(0)
      void audio?.play()
      return
    }
    nextTrack({ fromEnded: true })
  })
  bindMediaSessionHandlers({
    play: () => {
      primeAudioPlayback()
      void audio?.play()
    },
    pause: () => audio?.pause(),
    next: nextTrack,
    prev: prevTrack,
    seekBy: (delta) => {
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
  const rem = Math.max(0, (duration || 0) - (current || 0))
  return `-${formatTime(rem)}`
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
        title: row.title,
        artist: row.artist,
        album: row.album,
        albumKey: row.albumKey,
        artistKey: row.artistKey,
        lyrics: row.lyrics,
        artRemoteUrl: row.artRemoteUrl || track.artRemoteUrl,
        artUrl: row.artUrl || track.artUrl,
        fileName: row.fileName,
        storagePath: row.storagePath || track.storagePath,
        liked: row.liked,
        playCount: row.playCount,
      })
    }),
  )
  player.queue = next
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
}

/** @param {number} index @param {-1 | 1} delta */
export function moveQueueItem(index, delta) {
  reorderQueue(index, index + delta)
}

function stopAudio() {
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
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
    void loadAndPlay()
  } else if (index < player.index) {
    player.index -= 1
  }
}

export function clearQueue() {
  player.queue = []
  player.index = 0
  stopAudio()
}
