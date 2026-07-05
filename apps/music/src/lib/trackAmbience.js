import { browser } from '$app/environment';
import { trackAccent } from './trackArt.js';

let lastKey = '';

/** Sync --track-accent / --player-glow to the current track (cached by id). */
/** @param {import('./types.js').Track | null} track */
export function applyTrackAmbience(track) {
  if (!browser) return;

  const key = track?.id ?? track?.albumKey ?? '';
  if (key === lastKey) return;
  lastKey = key;

  const root = document.documentElement;
  if (!track) {
    root.style.removeProperty('--track-accent');
    root.style.removeProperty('--player-glow');
    return;
  }

  const accent = trackAccent(track.id || track.albumKey);
  root.style.setProperty('--track-accent', accent);
  root.style.setProperty('--player-glow', `color-mix(in srgb, ${accent} 42%, transparent)`);
}
