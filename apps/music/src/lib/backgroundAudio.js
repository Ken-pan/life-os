import { browser } from '$app/environment';
import {
  getAudioElement,
  persistPlayerSessionNow,
  primeAudioPlayback,
  player,
} from './player.svelte.js';
import {
  declarePlaybackSession,
  updateMediaSession,
  updatePositionState,
} from './mediaSession.js';

let bound = false;

/** Re-activate routing when returning from lock screen / app switcher (iOS PWA). */
export function bindBackgroundPlayback() {
  if (!browser || bound) return () => {};
  bound = true;

  const persistPlaybackState = () => {
    const el = getAudioElement();
    if (el) updatePositionState(el);
    updateMediaSession(player.queue[player.index] ?? null, player.playing);
    persistPlayerSessionNow();
  };

  const onVisibility = () => {
    if (document.visibilityState !== 'visible') {
      if (player.playing) declarePlaybackSession();
      persistPlaybackState();
      return;
    }
    const el = getAudioElement();
    if (!el || !player.playing) return;
    declarePlaybackSession();
    primeAudioPlayback();
    void el.play().catch(() => {});
  };
  const onPageHide = () => persistPlaybackState();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('freeze', onPageHide);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('freeze', onPageHide);
    bound = false;
  };
}
