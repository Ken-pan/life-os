import { db, slugKey, trackWords, ensureBuiltinPlaylists, getAllTracks, hydrateTrack, trackNeedsLyrics } from './db.js';
import { parseId3, parseFilename, isValidMeta } from './id3.js';
import { lyricsMatchKey } from './lyrics.js';
import {
  artBlobFromBuffer,
  artBlobFromCloudTrack,
  lookupRemoteArtUrl,
  lookupRemoteAlbumName,
  trackNeedsArt
} from './albumArt.js';
import { getSignedAudioUrl } from './cloudAudio.js';
import { fetchLyricsForTrack } from './lyricsFetch.js';
import { scheduleAutoCloudPush } from './sync.js';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
const LRC_EXT = /\.lrc$/i;
const CLOUD_SNIFF_BYTES = 512 * 1024;

/** @param {FileList | File[]} files @param {(done: number, total: number) => void} [onProgress] */
export async function importMediaFiles(files, onProgress) {
  const list = [...files];
  const audio = list.filter((f) => AUDIO_EXT.test(f.name));
  const lrcs = list.filter((f) => LRC_EXT.test(f.name));
  const total = audio.length + lrcs.length;
  let done = 0;

  const audioCount = await importAudioFiles(audio, (d) => {
    done = d;
    onProgress?.(done, total || 1);
  });

  const lrcCount = await importLrcFiles(lrcs, (d) => {
    done = audio.length + d;
    onProgress?.(done, total || 1);
  });

  return { audioCount, lrcCount, total: audioCount + lrcCount };
}

/** @param {FileList | File[]} files @param {(done: number, total: number) => void} [onProgress] */
export async function importAudioFiles(files, onProgress) {
  await ensureBuiltinPlaylists();
  const list = [...files].filter((f) => AUDIO_EXT.test(f.name));
  let done = 0;

  for (const file of list) {
    const buffer = await file.arrayBuffer();
    const tags = parseId3(buffer) || {};
    const fromName = parseFilename(file.name);
    const title = tags.title || fromName.title;
    const artist = tags.artist || fromName.artist;
    const album = isValidMeta(tags.album) ? String(tags.album).trim() : '未知专辑';
    const duration = await readDuration(file);

    /** @type {Blob | undefined} */
    let artBlob;
    if (tags.picture) {
      artBlob = new Blob([tags.picture.data], { type: tags.picture.mime });
    }

    const id = await hashFile(file);
    const existing = await db.tracks.get(id);
    if (existing?.objectUrl) URL.revokeObjectURL(existing.objectUrl);
    if (existing?.artUrl) URL.revokeObjectURL(existing.artUrl);

    /** @type {import('./types.js').Track & { audioBlob: Blob }} */
    const track = {
      id,
      title,
      artist,
      album,
      albumKey: slugKey(`${artist}::${album}`),
      artistKey: slugKey(artist),
      duration,
      mime: file.type || 'audio/mpeg',
      size: file.size,
      addedAt: existing?.addedAt || Date.now(),
      playCount: existing?.playCount || 0,
      liked: existing?.liked || 0,
      artBlob: artBlob || existing?.artBlob,
      lyrics: tags.lyrics || existing?.lyrics,
      fileName: file.name,
      words: [],
      audioBlob: file
    };
    track.words = trackWords(track);
    await db.tracks.put(track);
    hydrateTrack(track);
    done += 1;
    onProgress?.(done, list.length);
  }

  return done;
}

/**
 * Attach standalone .lrc files to matching library tracks (by title / artist - title / fileName).
 * @param {FileList | File[]} files @param {(done: number, total: number) => void} [onProgress]
 */
export async function importLrcFiles(files, onProgress) {
  const list = [...files].filter((f) => LRC_EXT.test(f.name));
  if (!list.length) return 0;

  const tracks = await getAllTracks();
  let matched = 0;
  let done = 0;

  for (const file of list) {
    const text = await file.text();
    if (!text.trim()) {
      done += 1;
      onProgress?.(done, list.length);
      continue;
    }

    const key = lyricsMatchKey(file.name);
    const track = tracks.find((tr) => {
      const candidates = [
        lyricsMatchKey(tr.title),
        lyricsMatchKey(`${tr.artist} - ${tr.title}`),
        lyricsMatchKey(`${tr.artist}-${tr.title}`),
        lyricsMatchKey(tr.fileName || '')
      ];
      return candidates.includes(key);
    });

    if (track) {
      await db.tracks.update(track.id, { lyrics: text });
      track.lyrics = text;
      matched += 1;
    }

    done += 1;
    onProgress?.(done, list.length);
  }

  if (matched) scheduleAutoCloudPush();
  return matched;
}

/**
 * Re-parse ID3 tags for local blobs and cloud-backed tracks.
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function rescanTrackMetadata(onProgress) {
  const tracks = await getAllTracks();
  const scannable = tracks.filter((t) => t.audioBlob || t.storagePath);
  let updated = 0;
  let done = 0;

  for (const track of scannable) {
    try {
      const tags = await id3FromTrack(track);
      /** @type {Partial<import('./types.js').Track>} */
      const patch = metaPatchFromTags(track, tags);

      if (Object.keys(patch).length) {
        await db.tracks.update(track.id, patch);
        updated += 1;
      }
    } catch {
      /* skip corrupt / unreachable files */
    }

    done += 1;
    onProgress?.(done, scannable.length);
  }

  if (updated) scheduleAutoCloudPush();
  return { scanned: scannable.length, updated };
}

/**
 * Re-parse filenames with updated heuristics (Title-Artist vs Artist-Title).
 * @returns {Promise<number>}
 */
export async function repairFilenameMetadata() {
  const tracks = await getAllTracks();
  let repaired = 0;

  for (const track of tracks) {
    if (!track.fileName) continue;
    const parsed = parseFilename(track.fileName);
    if (!isValidMeta(parsed.title) || !isValidMeta(parsed.artist)) continue;

    const symmetricSwap =
      track.title === parsed.artist &&
      track.artist === parsed.title &&
      parsed.title !== parsed.artist;
    const needsFix =
      symmetricSwap ||
      ((!isValidMeta(track.title) || track.title === '未命名') &&
        parsed.title !== track.title) ||
      ((!isValidMeta(track.artist) || track.artist === '未知艺术家') &&
        parsed.artist !== track.artist);

    if (!needsFix) continue;

    /** @type {Partial<import('./types.js').Track>} */
    const patch = {
      title: parsed.title,
      artist: parsed.artist,
      artistKey: slugKey(parsed.artist),
      words: trackWords({ ...track, title: parsed.title, artist: parsed.artist })
    };
    if (track.album && track.album !== '未知专辑') {
      patch.albumKey = slugKey(`${parsed.artist}::${track.album}`);
    }
    await db.tracks.update(track.id, patch);
    repaired += 1;
  }

  if (repaired) scheduleAutoCloudPush();
  return repaired;
}

/** @param {import('./types.js').Track} track */
function isGarbledAlbum(album) {
  return Boolean(album && album !== '未知专辑' && !isValidMeta(album));
}

/**
 * Fix garbled album names from ID3 or iTunes lookup (local + cloud-only tracks).
 * @returns {Promise<number>} count of tracks repaired
 */
export async function repairGarbledMetadata() {
  const tracks = await getAllTracks();
  const targets = tracks.filter((t) => isGarbledAlbum(t.album));
  let repaired = 0;

  for (const track of targets) {
    try {
      const tags = await id3FromTrack(track);
      let album = isValidMeta(tags.album) ? String(tags.album).trim() : '';
      if (!album) {
        album = (await lookupRemoteAlbumName(track.artist, track.title)) || '未知专辑';
      }
      if (!isValidMeta(album) || album === track.album) continue;

      const artist = isValidMeta(tags.artist) ? String(tags.artist).trim() : track.artist;
      /** @type {Partial<import('./types.js').Track>} */
      const patch = {
        album,
        albumKey: slugKey(`${artist}::${album}`),
        words: trackWords({ ...track, album, artist })
      };
      if (isValidMeta(tags.artist) && tags.artist !== track.artist) {
        patch.artist = artist;
        patch.artistKey = slugKey(artist);
      }
      await db.tracks.update(track.id, patch);
      repaired += 1;
    } catch {
      /* skip */
    }
  }

  if (repaired) scheduleAutoCloudPush();
  return repaired;
}

/** @type {Promise<number> | null} */
let metaRepairPromise = null;

/** Idempotent; repairs garbled album names after sync / on library load. */
export function ensureMetadataRepaired() {
  if (!metaRepairPromise) {
    metaRepairPromise = repairFilenameMetadata()
      .then(() => repairGarbledMetadata())
      .then(async (repaired) => {
        if (repaired > 0) {
          const { bumpLibraryEpoch } = await import('./state.svelte.js');
          bumpLibraryEpoch();
        }
        return repaired;
      });
  }
  return metaRepairPromise;
}

/** @param {import('./types.js').Track} track */
async function id3FromTrack(track) {
  if (track.audioBlob instanceof Blob) {
    return parseId3(await track.audioBlob.arrayBuffer()) || {};
  }
  if (track.storagePath) {
    const url = await getSignedAudioUrl(track.storagePath);
    const res = await fetch(url, { headers: { Range: `bytes=0-${CLOUD_SNIFF_BYTES - 1}` } });
    if (res.ok || res.status === 206) {
      return parseId3(await res.arrayBuffer()) || {};
    }
  }
  return {};
}

/**
 * @param {import('./types.js').Track} track
 * @param {{ title?: string, artist?: string, album?: string, lyrics?: string, lyricsSynced?: boolean, picture?: { mime: string, data: Uint8Array } }} tags
 */
function metaPatchFromTags(track, tags) {
  /** @type {Partial<import('./types.js').Track>} */
  const patch = {};

  if (tags.lyrics && tags.lyrics !== track.lyrics) patch.lyrics = tags.lyrics;
  if (tags.title && isValidMeta(tags.title) && tags.title !== track.title) patch.title = tags.title;
  if (tags.artist && isValidMeta(tags.artist) && tags.artist !== track.artist) {
    patch.artist = tags.artist;
    patch.artistKey = slugKey(tags.artist);
  }
  if (tags.album && isValidMeta(tags.album) && tags.album !== track.album) {
    patch.album = tags.album;
    patch.albumKey = slugKey(`${patch.artist || track.artist}::${tags.album}`);
  }
  if (tags.picture && !(track.artBlob instanceof Blob)) {
    patch.artBlob = new Blob([tags.picture.data], { type: tags.picture.mime });
  }

  if (patch.title || patch.artist || patch.album) {
    patch.words = trackWords({ ...track, ...patch });
  }
  return patch;
}

/**
 * Persist cover art and strip ephemeral runtime fields.
 * @param {import('./types.js').Track & { audioBlob?: Blob, objectUrl?: string, artUrl?: string }} track
 * @param {{ artBlob?: Blob, artRemoteUrl?: string }} patch
 */
async function persistTrackArt(track, patch) {
  const { artUrl: _a, objectUrl: _o, ...rest } = track;
  await db.tracks.put({ ...rest, ...patch });
}

/**
 * Backfill missing covers: local ID3 → cloud ID3 sniff → iTunes lookup.
 * @returns {Promise<number>} count of tracks repaired
 */
export async function repairMissingArt() {
  const tracks = await db.tracks.toArray();
  let repaired = 0;

  for (const track of tracks) {
    if (!trackNeedsArt(track)) continue;

    if (track.audioBlob instanceof Blob) {
      try {
        const artBlob = artBlobFromBuffer(await track.audioBlob.arrayBuffer());
        if (artBlob) {
          await persistTrackArt(track, { artBlob });
          repaired += 1;
          continue;
        }
      } catch {
        /* skip */
      }
    }

    if (track.storagePath) {
      try {
        const artBlob = await artBlobFromCloudTrack(track);
        if (artBlob) {
          await persistTrackArt(track, { artBlob });
          repaired += 1;
          continue;
        }
      } catch {
        /* skip */
      }
    }
  }

  /** @type {Map<string, string | null>} */
  const albumRemoteCache = new Map();
  const remaining = await db.tracks.toArray();

  for (const track of remaining) {
    if (!trackNeedsArt(track)) continue;

    if (!albumRemoteCache.has(track.albumKey)) {
      const remote = await lookupRemoteArtUrl(track.artist, track.album, track.title);
      albumRemoteCache.set(track.albumKey, remote);
      await new Promise((r) => setTimeout(r, 150));
    }

    const artRemoteUrl = albumRemoteCache.get(track.albumKey);
    if (artRemoteUrl) {
      await persistTrackArt(track, { artRemoteUrl });
      repaired += 1;
    }
  }

  if (repaired) scheduleAutoCloudPush();
  return repaired;
}

/**
 * Backfill missing lyrics via remote APIs (lrclib / QQ / NetEase / lyrics.ovh).
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ total: number, repaired: number }>}
 */
export async function repairMissingLyrics(onProgress) {
  const tracks = await db.tracks.toArray();
  const targets = tracks.filter((t) => trackNeedsLyrics(t));
  let repaired = 0;
  let done = 0;

  for (const track of targets) {
    try {
      const fetched = await fetchLyricsForTrack(track);
      if (fetched?.text) {
        await db.tracks.update(track.id, { lyrics: fetched.text });
        repaired += 1;
      }
    } catch {
      /* skip */
    }

    done += 1;
    onProgress?.(done, targets.length);
    await new Promise((r) => setTimeout(r, 200));
  }

  if (repaired) scheduleAutoCloudPush();
  return { total: targets.length, repaired };
}

/** @type {Promise<number> | null} */
let lyricsRepairPromise = null;

/** Idempotent; fetches remote lyrics and syncs to Supabase when logged in. */
export function ensureLyricsRepaired() {
  if (!lyricsRepairPromise) {
    lyricsRepairPromise = repairMissingLyrics().then(async ({ repaired }) => {
      if (repaired > 0) {
        const { bumpLibraryEpoch } = await import('./state.svelte.js');
        const { refreshQueueMetadata } = await import('./player.svelte.js');
        bumpLibraryEpoch();
        await refreshQueueMetadata();
      }
      return repaired;
    });
  }
  return lyricsRepairPromise;
}

/** @type {Promise<number> | null} */
let artRepairPromise = null;

/** Idempotent; safe to call from layout and list pages. */
export function ensureArtRepaired() {
  if (!artRepairPromise) {
    artRepairPromise = repairMissingArt().then(async (repaired) => {
      if (repaired > 0) {
        const { bumpLibraryEpoch } = await import('./state.svelte.js');
        bumpLibraryEpoch();
      }
      return repaired;
    });
  }
  return artRepairPromise;
}

/** @param {File} file */
async function readDuration(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    audio.src = url;
  });
}

/** @param {File} file */
async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @returns {Promise<{ tracks: import('./types.js').Track[], playlists: import('./types.js').Playlist[], playlistTracks: import('./types.js').PlaylistTrackRow[] }>} */
export async function exportLibraryJson() {
  const tracks = await db.tracks.toArray();
  const playlists = await db.playlists.toArray();
  const playlistTracks = await db.playlistTracks.toArray();
  return {
    tracks: tracks.map(({ objectUrl, artUrl, audioBlob, artBlob, ...rest }) => rest),
    playlists,
    playlistTracks
  };
}
