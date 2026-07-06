import { browser } from '$app/environment';
import { resolveTheme } from '@life-os/theme';
import { extractArtPalette, paletteFromHash } from './artPalette.js';
import { S } from './state.svelte.js';

let lastKey = '';
let extractSeq = 0;

/** @param {HTMLElement} root */
function clearAmbience(root) {
  root.style.removeProperty('--track-accent');
  root.style.removeProperty('--track-accent-muted');
  root.style.removeProperty('--player-glow');
  root.dataset.trackAmbience = 'off';
}

/** @param {HTMLElement} root @param {{ accent: string, accentMuted: string, glow: string }} palette @param {'art' | 'hash'} kind */
function applyPalette(root, palette, kind) {
  root.style.setProperty('--track-accent', palette.accent);
  root.style.setProperty('--track-accent-muted', palette.accentMuted);
  root.style.setProperty('--player-glow', palette.glow);
  root.dataset.trackAmbience = kind;
}

/**
 * Sync --track-accent / --player-glow to the current track.
 * Uses album pixel colors when enabled; falls back to deterministic hash.
 * @param {import('./types.js').Track | null} track
 */
export function applyTrackAmbience(track) {
  if (!browser) return;

  const root = document.documentElement;
  const key = track?.id ?? track?.albumKey ?? '';
  const albumAmbience = S.settings.albumAmbience !== false;
  const theme = resolveTheme(S.settings.theme, 'auto');
  const stateKey = `${key}:${albumAmbience ? 'on' : 'off'}:${theme}`;

  if (!track || !albumAmbience) {
    if (stateKey === lastKey) return;
    lastKey = stateKey;
    extractSeq += 1;
    clearAmbience(root);
    return;
  }

  if (stateKey === lastKey) return;
  lastKey = stateKey;
  const seq = ++extractSeq;

  void (async () => {
    const cacheKey = track.albumKey || track.id;
    /** @type {{ accent: string, accentMuted: string, glow: string }} */
    let palette;

    if (track.artUrl) {
      try {
        palette = await extractArtPalette(track.artUrl, cacheKey);
        if (seq !== extractSeq) return;
        applyPalette(root, palette, 'art');
        return;
      } catch {
        /* CORS / decode — fall through to hash */
      }
    }

    if (track.artBlob instanceof Blob) {
      try {
        palette = await extractArtPalette(track.artBlob, cacheKey);
        if (seq !== extractSeq) return;
        applyPalette(root, palette, 'art');
        return;
      } catch {
        /* fall through */
      }
    }

    if (seq !== extractSeq) return;
    applyPalette(root, paletteFromHash(track.id || track.albumKey), 'hash');
  })();
}

/** Re-apply after settings change (same track, force refresh). */
export function refreshTrackAmbience(/** @type {import('./types.js').Track | null} */ track) {
  lastKey = '';
  applyTrackAmbience(track);
}
