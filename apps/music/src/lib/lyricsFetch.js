import { lyricsCacheKey } from './trackNormalizer.js';

const API_URL = '/api/lyrics/fetch';
const MISS_STORAGE_KEY = 'musicos_lyrics_miss_v1';
const MISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_CACHE = new Map();
const INFLIGHT = new Map();

/** @typedef {{ syncedLyrics?: string | null, plainLyrics?: string | null, instrumental?: boolean, source?: string, text?: string }} LyricsResult */

/** @param {LyricsResult | null | undefined} result */
export function lyricsText(result) {
  if (!result || result.instrumental) return '';
  if (result.text?.trim()) return result.text.trim();
  if (result.syncedLyrics?.trim()) return result.syncedLyrics.trim();
  if (result.plainLyrics?.trim()) return result.plainLyrics.trim();
  return '';
}

function readMissCache() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(MISS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, number>} cache */
function writeMissCache(cache) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MISS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage may be unavailable in private mode */
  }
}

/** @param {string} cacheKey */
export function lyricsMissFresh(cacheKey) {
  const ts = Number(readMissCache()[cacheKey]) || 0;
  return ts > 0 && Date.now() - ts < MISS_COOLDOWN_MS;
}

/** @param {string} cacheKey */
function rememberMiss(cacheKey) {
  const cache = readMissCache();
  cache[cacheKey] = Date.now();
  writeMissCache(cache);
}

/** @param {string} cacheKey */
function clearMiss(cacheKey) {
  const cache = readMissCache();
  if (!(cacheKey in cache)) return;
  delete cache[cacheKey];
  writeMissCache(cache);
}

/**
 * Fetch lyrics via server proxy (Netlify Function / Vite dev middleware).
 * @param {string} trackName
 * @param {string} artistName
 * @param {number} [duration]
 * @param {{ force?: boolean, onFirstResult?: (result: LyricsResult & { source: string, text: string }) => void }} [opts]
 * @returns {Promise<(LyricsResult & { source: string, text: string }) | null>}
 */
export async function fetchRemoteLyrics(trackName, artistName, duration, opts = {}) {
  const cacheKey = lyricsCacheKey(trackName, artistName);
  if (!opts.force && lyricsMissFresh(cacheKey)) return null;
  if (FETCH_CACHE.has(cacheKey)) return FETCH_CACHE.get(cacheKey) ?? null;
  if (INFLIGHT.has(cacheKey)) return INFLIGHT.get(cacheKey);

  const job = (async () => {
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
        rememberMiss(cacheKey);
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

      clearMiss(cacheKey);
      if (opts.onFirstResult) opts.onFirstResult(entry);
      FETCH_CACHE.set(cacheKey, entry);
      return entry;
    } catch {
      FETCH_CACHE.set(cacheKey, null);
      return null;
    } finally {
      clearTimeout(timer);
      INFLIGHT.delete(cacheKey);
    }
  })();

  INFLIGHT.set(cacheKey, job);
  return job;
}

/** @param {Pick<import('./types.js').Track, 'title' | 'artist' | 'duration'>} track @param {{ force?: boolean, onFirstResult?: (result: LyricsResult & { source: string, text: string }) => void }} [opts] */
export function fetchLyricsForTrack(track, opts) {
  return fetchRemoteLyrics(track.title, track.artist, track.duration, opts);
}
