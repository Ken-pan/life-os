import { lyricsCacheKey } from './trackNormalizer.js';

const API_URL = '/api/lyrics/fetch';
const FETCH_CACHE = new Map();

/** @typedef {{ syncedLyrics?: string | null, plainLyrics?: string | null, instrumental?: boolean, source?: string, text?: string }} LyricsResult */

/** @param {LyricsResult | null | undefined} result */
export function lyricsText(result) {
  if (!result || result.instrumental) return '';
  if (result.text?.trim()) return result.text.trim();
  if (result.syncedLyrics?.trim()) return result.syncedLyrics.trim();
  if (result.plainLyrics?.trim()) return result.plainLyrics.trim();
  return '';
}

/**
 * Fetch lyrics via server proxy (Netlify Function / Vite dev middleware).
 * @param {string} trackName
 * @param {string} artistName
 * @param {number} [duration]
 * @param {{ onFirstResult?: (result: LyricsResult & { source: string, text: string }) => void }} [opts]
 * @returns {Promise<(LyricsResult & { source: string, text: string }) | null>}
 */
export async function fetchRemoteLyrics(trackName, artistName, duration, opts = {}) {
  const cacheKey = lyricsCacheKey(trackName, artistName);
  if (FETCH_CACHE.has(cacheKey)) return FETCH_CACHE.get(cacheKey) ?? null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trackName, artist: artistName, duration })
    });

    if (!res.ok) {
      FETCH_CACHE.set(cacheKey, null);
      return null;
    }

    const data = await res.json();
    if (!data?.text) {
      FETCH_CACHE.set(cacheKey, null);
      return null;
    }

    const entry = /** @type {LyricsResult & { source: string, text: string }} */ ({
      text: data.text,
      source: data.source || 'unknown',
      syncedLyrics: data.syncedLyrics ?? null,
      plainLyrics: data.plainLyrics ?? null,
      instrumental: Boolean(data.instrumental)
    });

    if (opts.onFirstResult) opts.onFirstResult(entry);
    FETCH_CACHE.set(cacheKey, entry);
    return entry;
  } catch {
    FETCH_CACHE.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {Pick<import('./types.js').Track, 'title' | 'artist' | 'duration'>} track @param {{ onFirstResult?: (result: LyricsResult & { source: string, text: string }) => void }} [opts] */
export function fetchLyricsForTrack(track, opts) {
  return fetchRemoteLyrics(track.title, track.artist, track.duration, opts);
}
