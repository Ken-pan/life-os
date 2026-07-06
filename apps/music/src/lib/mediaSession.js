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
  const icon = `${origin}/icon.svg`;
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
  if (!audio || !('setPositionState' in navigator.mediaSession)) return;
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
 *   seekBy?: (delta: number) => void
 * }} handlers
 */
export function bindMediaSessionHandlers(handlers) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', handlers.play);
  navigator.mediaSession.setActionHandler('pause', handlers.pause);
  navigator.mediaSession.setActionHandler('nexttrack', handlers.next);
  navigator.mediaSession.setActionHandler('previoustrack', handlers.prev);

  const seekBy = handlers.seekBy;
  if (seekBy) {
    try {
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        seekBy(-(details?.seekOffset ?? 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        seekBy(details?.seekOffset ?? 10);
      });
    } catch {
      /* optional on older iOS */
    }
  }
}
