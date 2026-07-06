import { parseId3 } from './id3.js';
import { getSignedAudioUrl } from './cloudAudio.js';
import { fetchWithRetry } from './fetchUtils.js';

const CLOUD_SNIFF_BYTES = 512 * 1024;
const LOOKUP_CACHE = new Map();
const LOOKUP_TIMEOUT_MS = 10_000;

/** @param {ArrayBuffer} buffer */
export function artBlobFromBuffer(buffer) {
  const tags = parseId3(buffer) || {};
  if (!tags.picture?.data?.length) return null;
  return new Blob([tags.picture.data], { type: tags.picture.mime || 'image/jpeg' });
}

/**
 * Read ID3/APIC from the start of a cloud object via HTTP Range.
 * @param {Pick<import('./types.js').Track, 'storagePath'>} track
 */
export async function artBlobFromCloudTrack(track) {
  if (!track.storagePath) return null;
  try {
    const url = await getSignedAudioUrl(track.storagePath);
    const res = await fetch(url, { headers: { Range: `bytes=0-${CLOUD_SNIFF_BYTES - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    return artBlobFromBuffer(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * iTunes Search API — no key required; returns a persistent HTTPS artwork URL.
 * @param {string} artist
 * @param {string} album
 * @param {string} [title]
 */
export async function lookupRemoteArtUrl(artist, album, title = '') {
  const cacheKey = `${artist}::${album}::${title}`.toLowerCase();
  if (LOOKUP_CACHE.has(cacheKey)) return LOOKUP_CACHE.get(cacheKey);

  const queries = [
    [artist, album].filter(Boolean).join(' '),
    [artist, title].filter(Boolean).join(' '),
    title || album
  ].filter(Boolean);

  /** @type {string | null} */
  let found = null;
  for (const term of queries) {
    const url = `https://itunes.apple.com/search?${new URLSearchParams({
      term,
      entity: 'song',
      limit: '5',
      country: 'CN'
    })}`;
    try {
      const res = await fetchWithRetry(url, { timeoutMs: LOOKUP_TIMEOUT_MS, retries: 1 });
      if (!res.ok) continue;
      const data = await res.json();
      const results = /** @type {{ artistName?: string, collectionName?: string, trackName?: string, artworkUrl100?: string }[]} */ (
        data.results || []
      );
      const match =
        results.find(
          (r) =>
            r.artworkUrl100 &&
            (!artist || r.artistName?.toLowerCase().includes(artist.toLowerCase())) &&
            (!album || album === '未知专辑' || r.collectionName?.toLowerCase().includes(album.toLowerCase()))
        ) || results.find((r) => r.artworkUrl100);
      if (match?.artworkUrl100) {
        found = match.artworkUrl100.replace(/100x100bb\.(jpg|png)/i, '600x600bb.$1');
        break;
      }
    } catch {
      /* network / CORS — skip */
    }
  }

  LOOKUP_CACHE.set(cacheKey, found);
  return found;
}

/**
 * iTunes Search API — resolve album/collection name when ID3 is missing or garbled.
 * @param {string} artist
 * @param {string} title
 */
export async function lookupRemoteAlbumName(artist, title) {
  const cacheKey = `album::${artist}::${title}`.toLowerCase();
  if (LOOKUP_CACHE.has(cacheKey)) return LOOKUP_CACHE.get(cacheKey);

  const term = [artist, title].filter(Boolean).join(' ');
  /** @type {string | null} */
  let found = null;
  if (term) {
    const url = `https://itunes.apple.com/search?${new URLSearchParams({
      term,
      entity: 'song',
      limit: '5',
      country: 'CN'
    })}`;
    try {
      const res = await fetchWithRetry(url, { timeoutMs: LOOKUP_TIMEOUT_MS, retries: 1 });
      if (res.ok) {
        const data = await res.json();
        const results = /** @type {{ artistName?: string, trackName?: string, collectionName?: string }[]} */ (
          data.results || []
        );
        const match =
          results.find(
            (r) =>
              r.collectionName &&
              (!artist || r.artistName?.toLowerCase().includes(artist.toLowerCase())) &&
              (!title || r.trackName?.toLowerCase().includes(title.toLowerCase()))
          ) || results.find((r) => r.collectionName);
        found = match?.collectionName?.trim() || null;
      }
    } catch {
      /* network / CORS — skip */
    }
  }

  LOOKUP_CACHE.set(cacheKey, found);
  return found;
}

/** @param {import('./types.js').Track} track */
export function trackNeedsArt(track) {
  if (track.artBlob instanceof Blob) return false;
  if (typeof track.artRemoteUrl === 'string' && track.artRemoteUrl.startsWith('https://')) return false;
  return true;
}
