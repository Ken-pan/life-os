/** @param {import('./types.js').Track | null | undefined} track */
export function updateMediaSession(track, playing) {
  if (!('mediaSession' in navigator)) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }
  /** @type {MediaImage[]} */
  const artwork = [];
  if (track.artUrl) artwork.push({ src: track.artUrl, sizes: '512x512', type: 'image/jpeg' });
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork
  });
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

/** @param {{ play: () => void, pause: () => void, next: () => void, prev: () => void }} handlers */
export function bindMediaSessionHandlers(handlers) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', handlers.play);
  navigator.mediaSession.setActionHandler('pause', handlers.pause);
  navigator.mediaSession.setActionHandler('nexttrack', handlers.next);
  navigator.mediaSession.setActionHandler('previoustrack', handlers.prev);
}
