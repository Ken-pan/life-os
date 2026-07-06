import { db, hydrateTrack } from './db.js';
import { fetchWithRetry } from './fetchUtils.js';
import { lookupRemoteArtUrl, artBlobFromBuffer, artBlobFromCloudTrack, trackNeedsArt } from './albumArt.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const REPAIR_CONCURRENCY = 4;
const ITUNES_LOOKUP_GAP_MS = 120;

/** @type {Map<string, string>} */
const objectUrlByKey = new Map();

/** @type {Map<string, Promise<string | null>>} */
const albumResolveInflight = new Map();

/** @type {Set<string>} */
const materializeInflight = new Set();

/** @param {string} url */
export async function artBlobFromRemoteUrl(url) {
  const res = await fetchWithRetry(url, { timeoutMs: 15_000 });
  const blob = await res.blob();
  if (!blob.size) return null;
  return blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/jpeg' });
}

/** @param {string} key @param {Blob} blob */
export function objectUrlForBlob(key, blob) {
  const cached = objectUrlByKey.get(key);
  if (cached) return cached;
  const url = URL.createObjectURL(blob);
  objectUrlByKey.set(key, url);
  return url;
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<void>} worker
 */
export async function runPool(items, concurrency, worker) {
  if (!items.length) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index;
      index += 1;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Download HTTPS cover into IndexedDB blob (offline-safe, deduped per album).
 * @param {string} trackId
 */
export function scheduleArtMaterialize(trackId) {
  if (materializeInflight.has(trackId)) return;
  materializeInflight.add(trackId);

  void (async () => {
    try {
      const track = await db.tracks.get(trackId);
      if (!track || track.artBlob instanceof Blob) return;
      if (typeof track.artRemoteUrl !== 'string' || !track.artRemoteUrl.startsWith('https://')) return;

      const blob = await artBlobFromRemoteUrl(track.artRemoteUrl);
      if (!blob) return;

      const { artUrl: _a, objectUrl: _o, artRemoteUrl: _r, ...rest } = track;
      await db.tracks.put({ ...rest, artBlob: blob });

      const siblings = await db.tracks.where('albumKey').equals(track.albumKey).toArray();
      await runPool(
        siblings.filter((t) => !(t.artBlob instanceof Blob)),
        REPAIR_CONCURRENCY,
        async (row) => {
          const { artUrl: _a2, objectUrl: _o2, artRemoteUrl: _r2, ...sRest } = row;
          await db.tracks.put({ ...sRest, artBlob: blob });
        }
      );

      const { bumpLibraryEpoch } = await import('./state.svelte.js');
      bumpLibraryEpoch();
    } catch {
      /* best-effort background materialize */
    } finally {
      materializeInflight.delete(trackId);
    }
  })();
}

/**
 * Resolve missing cover for one album (viewport / on-demand).
 * @param {{ albumKey: string, artist: string, album: string, title?: string }} meta
 */
export async function requestArtForAlbum(meta) {
  const key = meta.albumKey;
  const inflight = albumResolveInflight.get(key);
  if (inflight) return inflight;

  const job = (async () => {
    const remote = await lookupRemoteArtUrl(meta.artist, meta.album, meta.title || '');
    if (!remote) return null;

    let blob = null;
    try {
      blob = await artBlobFromRemoteUrl(remote);
    } catch {
      blob = null;
    }

    const siblings = await db.tracks.where('albumKey').equals(key).toArray();
    await runPool(siblings, REPAIR_CONCURRENCY, async (row) => {
      if (row.artBlob instanceof Blob) return;
      const patch = blob ? { artBlob: blob } : { artRemoteUrl: remote };
      const { artUrl: _a, objectUrl: _o, artRemoteUrl: _r, ...rest } = row;
      await db.tracks.put({ ...rest, ...patch });
    });

    const { bumpLibraryEpoch } = await import('./state.svelte.js');
    bumpLibraryEpoch();
    return blob ? objectUrlForBlob(`album:${key}`, blob) : remote;
  })().finally(() => {
    albumResolveInflight.delete(key);
  });

  albumResolveInflight.set(key, job);
  return job;
}

/**
 * @param {import('./types.js').Track} track
 * @returns {Promise<import('./types.js').Track | null>}
 */
export async function resolveTrackArtSources(track) {
  if (!trackNeedsArt(track)) {
    if (track.artRemoteUrl && !(track.artBlob instanceof Blob)) scheduleArtMaterialize(track.id);
    return track;
  }

  if (track.audioBlob instanceof Blob) {
    try {
      const artBlob = artBlobFromBuffer(await track.audioBlob.arrayBuffer());
      if (artBlob) {
        const { artUrl: _a, objectUrl: _o, ...rest } = track;
        await db.tracks.put({ ...rest, artBlob });
        return hydrateTrack({ ...track, artBlob });
      }
    } catch {
      /* skip */
    }
  }

  if (track.storagePath) {
    try {
      const artBlob = await artBlobFromCloudTrack(track);
      if (artBlob) {
        const { artUrl: _a, objectUrl: _o, ...rest } = track;
        await db.tracks.put({ ...rest, artBlob });
        return hydrateTrack({ ...track, artBlob });
      }
    } catch {
      /* skip */
    }
  }

  await requestArtForAlbum({
    albumKey: track.albumKey,
    artist: track.artist,
    album: track.album,
    title: track.title
  });
  const updated = await db.tracks.get(track.id);
  return updated ? hydrateTrack(updated) : null;
}

/** @param {import('./types.js').Track[]} tracks @returns {Promise<number>} */
export async function repairMissingArtModern(tracks) {
  let repaired = 0;

  await runPool(
    tracks.filter((t) => trackNeedsArt(t)),
    REPAIR_CONCURRENCY,
    async (track) => {
      if (track.audioBlob instanceof Blob) {
        try {
          const artBlob = artBlobFromBuffer(await track.audioBlob.arrayBuffer());
          if (artBlob) {
            const { artUrl: _a, objectUrl: _o, ...rest } = track;
            await db.tracks.put({ ...rest, artBlob });
            repaired += 1;
            return;
          }
        } catch {
          /* skip */
        }
      }

      if (track.storagePath) {
        try {
          const artBlob = await artBlobFromCloudTrack(track);
          if (artBlob) {
            const { artUrl: _a, objectUrl: _o, ...rest } = track;
            await db.tracks.put({ ...rest, artBlob });
            repaired += 1;
          }
        } catch {
          /* skip */
        }
      }
    }
  );

  const remaining = await db.tracks.toArray();
  /** @type {Map<string, import('./types.js').Track[]>} */
  const byAlbum = new Map();
  for (const track of remaining) {
    if (!trackNeedsArt(track)) continue;
    const list = byAlbum.get(track.albumKey) || [];
    list.push(track);
    byAlbum.set(track.albumKey, list);
  }

  /** @type {string[]} */
  const albumKeys = [...byAlbum.keys()];
  for (const albumKey of albumKeys) {
    const group = byAlbum.get(albumKey) || [];
    const sample = group[0];
    if (!sample) continue;

    const remote = await lookupRemoteArtUrl(sample.artist, sample.album, sample.title);
    await new Promise((r) => setTimeout(r, ITUNES_LOOKUP_GAP_MS));

    if (!remote) continue;

    let albumRepaired = 0;
    let blob = null;
    try {
      blob = await artBlobFromRemoteUrl(remote);
    } catch {
      blob = null;
    }

    await runPool(group, REPAIR_CONCURRENCY, async (row) => {
      const patch = blob ? { artBlob: blob } : { artRemoteUrl: remote };
      const { artUrl: _a, objectUrl: _o, artRemoteUrl: _r, ...rest } = row;
      await db.tracks.put({ ...rest, ...patch });
      albumRepaired += 1;
    });

    repaired += albumRepaired;
    if (albumRepaired > 0) {
      const { bumpLibraryEpoch } = await import('./state.svelte.js');
      bumpLibraryEpoch();
    }
  }

  return repaired;
}
