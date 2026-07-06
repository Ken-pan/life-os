/**
 * Backfill music.music_track_meta.art_remote_url from cloud audio ID3/APIC covers.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-cloud-cover-art.mjs [userId]
 *
 * Options:
 *   DRY_RUN=1          inspect without writing Storage/Table changes
 *   FORCE=1            replace existing art_remote_url values
 *   COVER_LIMIT=100    cap processed rows
 *   COVER_CONCURRENCY=4
 */
import { createClient } from '@supabase/supabase-js';
import { parseId3 } from '../src/lib/id3.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iueozzuctstwvzbcxcyh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.argv[2] || '';
const AUDIO_BUCKET = 'music';
const COVER_BUCKET = 'music-covers';
const RANGE_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = Number(process.env.COVER_FETCH_TIMEOUT_MS || 15000);
const RETRY_DELAYS_MS = [500, 1500, 3500];
const DRY_RUN = process.env.DRY_RUN === '1';
const FORCE = process.env.FORCE === '1';
const COVER_LIMIT = Number(process.env.COVER_LIMIT || 0);
const CONCURRENCY = Number(process.env.COVER_CONCURRENCY || 4);
/** @type {Map<string, string | null>} */
const albumUrlCache = new Map();
/** @type {Map<string, Promise<string | null>>} */
const albumUrlInflight = new Map();

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const storage = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'music' },
  auth: { persistSession: false, autoRefreshToken: false }
});

/** @param {string} mime */
function extForMime(mime) {
  const type = (mime || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

/** @param {string} value */
function hashPathPart(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {unknown} err */
function isRetryableError(err) {
  const status = Number(
    err && typeof err === 'object' && 'statusCode' in err
      ? /** @type {{ statusCode?: number }} */ (err).statusCode
      : err && typeof err === 'object' && 'status' in err
        ? /** @type {{ status?: number }} */ (err).status
        : 0
  );
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || '')
        : '';
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    /abort|timeout|network|fetch|rate|temporar/i.test(message)
  );
}

/**
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withRetry(work) {
  /** @type {unknown} */
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

/** @param {string} path */
async function signedAudioUrl(path) {
  return withRetry(async () => {
    const { data, error } = await storage.storage.from(AUDIO_BUCKET).createSignedUrl(path, 120);
    if (error || !data?.signedUrl) throw error || new Error('signed URL failed');
    return data.signedUrl;
  });
}

/** @param {{ storage_path: string }} row */
async function readEmbeddedPicture(row) {
  const url = await signedAudioUrl(row.storage_path);
  const res = await withRetry(async () => {
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${RANGE_BYTES - 1}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok && response.status !== 206) {
      const err = Object.assign(new Error(`audio fetch HTTP ${response.status}`), {
        status: response.status
      });
      throw err;
    }
    return response;
  });
  if (!res.ok && res.status !== 206) throw new Error(`audio fetch HTTP ${res.status}`);
  const tags = parseId3(await res.arrayBuffer()) || {};
  return tags.picture || null;
}

/** @param {any} row @param {{ mime: string, data: Uint8Array }} picture */
async function uploadCover(row, picture) {
  const contentType = picture.mime || 'image/jpeg';
  const albumHash = hashPathPart(row.album_key || `${row.artist || ''}::${row.album || ''}` || row.track_id);
  const path = `${row.user_id}/albums/${albumHash}-${row.track_id}.${extForMime(contentType)}`;
  if (DRY_RUN) {
    return `${SUPABASE_URL}/storage/v1/object/public/${COVER_BUCKET}/${path}`;
  }

  await withRetry(async () => {
    const { error } = await storage.storage.from(COVER_BUCKET).upload(path, Buffer.from(picture.data), {
      contentType,
      upsert: true,
      cacheControl: '31536000'
    });
    if (error) throw error;
  });

  const { data } = storage.storage.from(COVER_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** @param {any} row */
async function resolveCoverUrlForRow(row) {
  const albumKey = row.album_key || `${row.artist || ''}::${row.album || ''}`;
  if (albumUrlCache.has(albumKey)) return albumUrlCache.get(albumKey);
  if (albumUrlInflight.has(albumKey)) return albumUrlInflight.get(albumKey);

  const job = (async () => {
    const picture = await readEmbeddedPicture(row);
    const url = picture?.data?.length ? await uploadCover(row, picture) : null;
    albumUrlCache.set(albumKey, url);
    return url;
  })().finally(() => {
    albumUrlInflight.delete(albumKey);
  });
  albumUrlInflight.set(albumKey, job);
  return job;
}

async function loadRows() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = db
      .from('music_track_meta')
      .select('user_id, track_id, title, artist, album, album_key, storage_path, art_remote_url')
      .not('storage_path', 'eq', '')
      .range(from, from + 999)
      .order('updated_at', { ascending: false });
    if (USER_ID) query = query.eq('user_id', USER_ID);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const filtered = rows.filter((row) => FORCE || !row.art_remote_url?.startsWith('https://'));
  return COVER_LIMIT > 0 ? filtered.slice(0, COVER_LIMIT) : filtered;
}

async function runPool(items, worker) {
  let index = 0;
  const stats = { ok: 0, skipped: 0, failed: 0 };
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const row = items[index++];
      try {
        await worker(row, stats);
      } catch (err) {
        stats.failed += 1;
        console.error(`FAIL ${row.title || row.track_id}: ${err.message || err}`);
      }
    }
  });
  await Promise.all(runners);
  return stats;
}

const rows = await loadRows();
console.log(`Backfilling ${rows.length} cloud tracks${USER_ID ? ` for ${USER_ID}` : ''}${DRY_RUN ? ' (dry run)' : ''}...`);

const stats = await runPool(rows, async (row, s) => {
  const publicUrl = await resolveCoverUrlForRow(row);
  if (!publicUrl) {
    s.skipped += 1;
    console.log(`SKIP no embedded cover: ${row.title || row.track_id}`);
    return;
  }

  if (!DRY_RUN) {
    await withRetry(async () => {
      const { error } = await db
        .from('music_track_meta')
        .update({ art_remote_url: publicUrl })
        .eq('user_id', row.user_id)
        .eq('track_id', row.track_id);
      if (error) throw error;
    });
  }

  s.ok += 1;
  console.log(`OK ${row.title || row.track_id} -> ${publicUrl}`);
});

console.log(`Done: ok=${stats.ok} skipped=${stats.skipped} failed=${stats.failed}`);
if (stats.failed) process.exit(1);
