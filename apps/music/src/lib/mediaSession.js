import { browser } from '$app/environment'
import {
  isNativeShell,
  nativeUpdateMediaSession,
  nativeUpdatePosition,
  bindNativeMediaHandlers,
} from '@life-os/capacitor-nowplaying'
import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'
import {
  kenosUpdateMediaSession,
  kenosUpdatePosition,
  bindKenosMediaHandlers,
} from '$lib/kenos/kenosNowPlaying.js'
import { noteMusicPlayback } from '$lib/kenos/musicSpaceAdapter.js'

/** Tell iOS/Safari this page is a media player (enables lock-screen + background routing). */
export function declarePlaybackSession() {
  if (!browser || !('audioSession' in navigator)) return
  try {
    /** @type {AudioSession} */ navigator.audioSession.type = 'playback'
  } catch {
    /* unsupported or blocked */
  }
}

/** @param {import('./types.js').Track | null | undefined} track */
function artworkForTrack(track) {
  const origin = typeof location !== 'undefined' ? location.origin : ''
  const icon = `${origin}/notify-192.png`
  /** @type {MediaImage[]} */
  const artwork = []
  if (track?.artUrl) {
    artwork.push({ src: track.artUrl, sizes: '512x512', type: 'image/jpeg' })
    artwork.push({ src: track.artUrl, sizes: '96x96', type: 'image/jpeg' })
  }
  artwork.push({ src: icon, sizes: '512x512', type: 'image/svg+xml' })
  artwork.push({ src: icon, sizes: '96x96', type: 'image/svg+xml' })
  return artwork
}

function useKenosNowPlaying() {
  return isIosNativeShell() && !isNativeShell()
}

/** @param {import('./types.js').Track | null | undefined} track @param {boolean} playing */
export function updateMediaSession(track, playing) {
  // Continuity Shelf snapshot — nav RPC is owned by installNavManifestPublisher (700ms).
  if (!track) {
    noteMusicPlayback({})
  } else {
    noteMusicPlayback({
      trackId: track.id,
      trackTitle: track.title || '',
      playing,
    })
  }

  if (isNativeShell()) {
    nativeUpdateMediaSession(track, playing)
    return
  }
  if (useKenosNowPlaying()) {
    kenosUpdateMediaSession(track, playing)
    return
  }
  if (!('mediaSession' in navigator)) return
  if (!track) {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
    return
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: artworkForTrack(track),
  })
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
}

/** @param {HTMLAudioElement | null | undefined} audio */
export function updatePositionState(audio) {
  if (!audio) return
  if (isNativeShell()) {
    nativeUpdatePosition(audio)
    return
  }
  if (useKenosNowPlaying()) {
    kenosUpdatePosition(audio)
    return
  }
  if (!('mediaSession' in navigator)) return
  if (!('setPositionState' in navigator.mediaSession)) return
  const duration = audio.duration
  const position = audio.currentTime
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position))
    return
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(Math.max(0, position), duration),
    })
  } catch {
    /* Safari may reject while metadata is loading */
  }
}

/**
 * @param {{
 *   play: () => void,
 *   pause: () => void,
 *   next: () => void,
 *   prev: () => void,
 *   seekTo?: (time: number) => void,
 *   seekBy?: (delta: number) => void
 * }} handlers
 */
export function bindMediaSessionHandlers(handlers) {
  if (isNativeShell()) {
    // 只走原生命令通道，避免 WebKit 将来支持 mediaSession 后出现双重触发
    bindNativeMediaHandlers(handlers)
    return
  }
  if (useKenosNowPlaying()) {
    bindKenosMediaHandlers(handlers)
    return
  }
  if (!('mediaSession' in navigator)) return

  const bind = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      /* optional on older Safari/iOS */
    }
  }

  bind('play', handlers.play)
  bind('pause', handlers.pause)
  bind('nexttrack', handlers.next)
  bind('previoustrack', handlers.prev)

  if (handlers.seekTo) {
    bind('seekto', (details) => {
      const seekTime = Number(details?.seekTime)
      if (Number.isFinite(seekTime)) handlers.seekTo(seekTime)
    })
  }

  const seekBy = handlers.seekBy
  if (seekBy) {
    bind('seekbackward', (details) => {
      seekBy(-(details?.seekOffset ?? 10))
    })
    bind('seekforward', (details) => {
      seekBy(details?.seekOffset ?? 10)
    })
  }
}
