import { browser } from '$app/environment';
import { db, hydrateTrack, recordPlay } from './db.js';
import { resolvePlayUrl, resolvePlayUrlSync } from './cloudAudio.js';
import { registerAudioElement, resumeAudioContext } from './audioAnalyser.js';
import { bindMediaSessionHandlers, updateMediaSession } from './mediaSession.js';
import { syncErrorMessage } from './sync.js';
import { t } from './i18n/index.js';

/** @type {HTMLAudioElement | null} */
let audio = null;
let loadToken = 0;

export const player = $state({
  queue: /** @type {import('./types.js').Track[]} */ ([]),
  index: 0,
  playing: false,
  shuffle: false,
  repeat: /** @type {import('./types.js').RepeatMode} */ ('off'),
  currentTime: 0,
  duration: 0,
  ready: false
});

export function getCurrentTrack() {
  return player.queue[player.index] ?? null;
}

/** @returns {HTMLAudioElement | null} */
export function getAudioElement() {
  return audio;
}

/** Prime output in the same user-gesture stack before async signed URL work. */
export function primeAudioPlayback() {
  ensureAudio();
  void resumeAudioContext();
}

/** @param {import('./types.js').Track[]} tracks @param {number} [startIndex] */
export function playTracks(tracks, startIndex = 0) {
  if (!tracks.length) return;
  primeAudioPlayback();
  player.queue = tracks;
  player.index = Math.max(0, Math.min(startIndex, tracks.length - 1));
  void loadAndPlay();
}

/** @param {import('./types.js').Track} track */
export function playTrack(track) {
  playTracks([track], 0);
}

/** @param {import('./types.js').Track[]} tracks */
export function appendToQueue(tracks) {
  player.queue = [...player.queue, ...tracks];
  if (!getCurrentTrack()) {
    player.index = 0;
    void loadAndPlay();
  }
}

export function togglePlay() {
  if (!audio || !getCurrentTrack()) return;
  primeAudioPlayback();
  if (player.playing) audio.pause();
  else void startPlayback(audio.src, loadToken, getCurrentTrack());
}

export function nextTrack() {
  if (!player.queue.length) return;
  if (player.shuffle) {
    player.index = Math.floor(Math.random() * player.queue.length);
  } else if (player.index < player.queue.length - 1) {
    player.index += 1;
  } else if (player.repeat === 'all') {
    player.index = 0;
  } else return;
  void loadAndPlay();
}

export function prevTrack() {
  if (!player.queue.length) return;
  if (player.currentTime > 3) {
    seek(0);
    return;
  }
  if (player.index > 0) player.index -= 1;
  else if (player.repeat === 'all') player.index = player.queue.length - 1;
  else {
    seek(0);
    return;
  }
  void loadAndPlay();
}

export function toggleShuffle() {
  player.shuffle = !player.shuffle;
}

export function cycleRepeat() {
  player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
}

/** @param {number} t */
export function seek(t) {
  if (!audio) return;
  audio.currentTime = t;
  player.currentTime = t;
}

/** @param {HTMLAudioElement} el @param {number} [timeoutMs] */
function waitCanPlay(el, timeoutMs = 12_000) {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(el.error || new Error('media-error'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

/** @param {string} msg */
async function playbackToast(msg) {
  const { toast } = await import('./ui.svelte.js');
  toast(msg, { error: true });
}

/**
 * @param {string} src
 * @param {number} token
 * @param {import('./types.js').Track} track
 */
async function startPlayback(src, token, track) {
  if (!audio || token !== loadToken || getCurrentTrack()?.id !== track.id) return false;
  if (!src) {
    await playbackToast(t('player.noSource'));
    return false;
  }

  if (audio.src !== src) {
    audio.src = src;
    audio.load();
  }

  await resumeAudioContext();

  try {
    await audio.play();
    return true;
  } catch {
    try {
      await waitCanPlay(audio);
      await audio.play();
      return true;
    } catch {
      await playbackToast(t('player.playFailed'));
      return false;
    }
  }
}

async function loadAndPlay() {
  const track = getCurrentTrack();
  if (!track || !browser) return;
  ensureAudio();
  if (!audio) return;
  const token = ++loadToken;
  hydrateTrack(track);

  let src = resolvePlayUrlSync(track);
  if (!src) {
    try {
      src = await resolvePlayUrl(track);
    } catch (err) {
      await playbackToast(syncErrorMessage(err));
      return;
    }
  }

  if (token !== loadToken || getCurrentTrack()?.id !== track.id) return;
  player.duration = track.duration || 0;
  updateMediaSession(track, false);

  const ok = await startPlayback(src, token, track);
  if (!ok || token !== loadToken) return;

  recordPlay(track.id);
  updateMediaSession(track, true);
}

function ensureAudio() {
  if (audio || !browser) return;
  audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.crossOrigin = 'anonymous';
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', 'true');
  registerAudioElement(audio);

  audio.addEventListener('timeupdate', () => {
    player.currentTime = audio?.currentTime || 0;
    player.duration = audio?.duration || player.duration;
  });
  audio.addEventListener('play', () => {
    player.playing = true;
    updateMediaSession(getCurrentTrack(), true);
  });
  audio.addEventListener('pause', () => {
    player.playing = false;
    updateMediaSession(getCurrentTrack(), false);
  });
  audio.addEventListener('ended', () => {
    if (player.repeat === 'one') {
      seek(0);
      void audio?.play();
      return;
    }
    nextTrack();
  });
  bindMediaSessionHandlers({
    play: () => {
      primeAudioPlayback();
      void audio?.play();
    },
    pause: () => audio?.pause(),
    next: nextTrack,
    prev: prevTrack
  });
  player.ready = true;
}

/** @param {number} sec */
export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getProgressPct() {
  return player.duration > 0 ? `${(player.currentTime / player.duration) * 100}%` : '0%';
}

/** Refresh metadata (lyrics/tags) on queued tracks after a library rescan. */
export async function refreshQueueMetadata() {
  if (!player.queue.length) return;
  const next = await Promise.all(
    player.queue.map(async (track) => {
      const row = await db.tracks.get(track.id);
      if (!row) return track;
      return hydrateTrack({
        ...track,
        title: row.title,
        artist: row.artist,
        album: row.album,
        albumKey: row.albumKey,
        artistKey: row.artistKey,
        lyrics: row.lyrics,
        artUrl: row.artUrl || track.artUrl,
        fileName: row.fileName,
        storagePath: row.storagePath || track.storagePath,
        liked: row.liked,
        playCount: row.playCount
      });
    })
  );
  player.queue = next;
}

/** @param {number} fromIndex @param {number} toIndex */
export function reorderQueue(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const q = [...player.queue];
  if (fromIndex >= q.length || toIndex >= q.length) return;
  const currentId = getCurrentTrack()?.id;
  const [item] = q.splice(fromIndex, 1);
  q.splice(toIndex, 0, item);
  player.queue = q;
  if (currentId) {
    const nextIndex = q.findIndex((t) => t.id === currentId);
    if (nextIndex >= 0) player.index = nextIndex;
  }
}

/** @param {number} index @param {-1 | 1} delta */
export function moveQueueItem(index, delta) {
  reorderQueue(index, index + delta);
}

function stopAudio() {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  player.playing = false;
  player.currentTime = 0;
  player.duration = 0;
  updateMediaSession(null, false);
}

/** @param {number} index */
export function removeFromQueue(index) {
  if (index < 0 || index >= player.queue.length) return;
  const wasCurrent = index === player.index;
  const q = player.queue.filter((_, i) => i !== index);
  player.queue = q;
  if (!q.length) {
    player.index = 0;
    stopAudio();
    return;
  }
  if (wasCurrent) {
    player.index = Math.min(index, q.length - 1);
    void loadAndPlay();
  } else if (index < player.index) {
    player.index -= 1;
  }
}

export function clearQueue() {
  player.queue = [];
  player.index = 0;
  stopAudio();
}
