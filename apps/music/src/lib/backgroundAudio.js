import { browser } from '$app/environment';
import { getAudioElement, primeAudioPlayback, player } from './player.svelte.js';
import { declarePlaybackSession } from './mediaSession.js';

let bound = false;

/** Re-activate routing when returning from lock screen / app switcher (iOS PWA). */
export function bindBackgroundPlayback() {
  if (!browser || bound) return () => {};
  bound = true;

  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    const el = getAudioElement();
    if (!el || !player.playing) return;
    declarePlaybackSession();
    primeAudioPlayback();
    void el.play().catch(() => {});
  };

  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    bound = false;
  };
}
