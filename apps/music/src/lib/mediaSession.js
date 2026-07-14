import { browser } from '$app/environment';

/** Tell iOS/Safari this page is a media player (enables lock-screen + background routing). */
export function declarePlaybackSession() {
  if (!browser || !('audioSession' in navigator)) return;
  try {
    /** @type {AudioSession} */ (navigator.audioSession).type = 'playback';
  } catch {
    /* unsupported or blocked */
  }
}

/** @param {import('./types.js').Track | null | undefined} track */
function artworkForTrack(track) {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const icon = `${origin}/notify-192.png`;
  /** @type {MediaImage[]} */
  const artwork = [];
  if (track?.artUrl) {
    artwork.push({ src: track.artUrl, sizes: '512x512', type: 'image/jpeg' });
    artwork.push({ src: track.artUrl, sizes: '96x96', type: 'image/jpeg' });
  }
  artwork.push({ src: icon, sizes: '512x512', type: 'image/svg+xml' });
  artwork.push({ src: icon, sizes: '96x96', type: 'image/svg+xml' });
  return artwork;
}

/** @param {import('./types.js').Track | null | undefined} track @param {boolean} playing */
export function updateMediaSession(track, playing) {
  if (!('mediaSession' in navigator)) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: artworkForTrack(track)
  });
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

/** @param {HTMLAudioElement | null | undefined} audio */
export function updatePositionState(audio) {
  if (!audio || !('mediaSession' in navigator)) return;
  if (!('setPositionState' in navigator.mediaSession)) return;
  const duration = audio.duration;
  const position = audio.currentTime;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(Math.max(0, position), duration)
    });
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
  if (!('mediaSession' in navigator)) return;

  const bind = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* optional on older Safari/iOS */
    }
  };

  bind('play', handlers.play);
  bind('pause', handlers.pause);
  bind('nexttrack', handlers.next);
  bind('previoustrack', handlers.prev);

  if (handlers.seekTo) {
    bind('seekto', (details) => {
      const seekTime = Number(details?.seekTime);
      if (Number.isFinite(seekTime)) handlers.seekTo(seekTime);
    });
  }

  const seekBy = handlers.seekBy;
  if (seekBy) {
    bind('seekbackward', (details) => {
      seekBy(-(details?.seekOffset ?? 10));
    });
    bind('seekforward', (details) => {
      seekBy(details?.seekOffset ?? 10);
    });
  }
}
