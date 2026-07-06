import { db, slugKey, trackWords, ensureBuiltinPlaylists, getAllTracks } from './db.js';
import { parseId3, parseFilename } from './id3.js';
import { lyricsMatchKey } from './lyrics.js';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
const LRC_EXT = /\.lrc$/i;

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
    const album = tags.album || '未知专辑';
    const duration = await readDuration(file);

    let artUrl;
    if (tags.picture) {
      const blob = new Blob([tags.picture.data], { type: tags.picture.mime });
      artUrl = URL.createObjectURL(blob);
    }

    const id = await hashFile(file);
    const existing = await db.tracks.get(id);
    if (existing?.objectUrl) URL.revokeObjectURL(existing.objectUrl);
    if (existing?.artUrl && existing.artUrl !== artUrl) URL.revokeObjectURL(existing.artUrl);

    const objectUrl = URL.createObjectURL(file);
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
      artUrl,
      lyrics: tags.lyrics || existing?.lyrics,
      fileName: file.name,
      words: [],
      audioBlob: file
    };
    track.words = trackWords(track);
    await db.tracks.put(track);
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

  return matched;
}

/**
 * Re-parse ID3 tags for local blobs (fills missing lyrics / tags without full re-import).
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function rescanTrackMetadata(onProgress) {
  const tracks = await getAllTracks();
  const withBlob = tracks.filter((t) => t.audioBlob);
  let updated = 0;
  let done = 0;

  for (const track of withBlob) {
    try {
      const buffer = await track.audioBlob.arrayBuffer();
      const tags = parseId3(buffer) || {};
      /** @type {Partial<import('./types.js').Track>} */
      const patch = {};

      if (tags.lyrics && tags.lyrics !== track.lyrics) patch.lyrics = tags.lyrics;
      if (tags.title && tags.title !== track.title) patch.title = tags.title;
      if (tags.artist && tags.artist !== track.artist) {
        patch.artist = tags.artist;
        patch.artistKey = slugKey(tags.artist);
        patch.albumKey = slugKey(`${tags.artist}::${tags.album || track.album}`);
      }
      if (tags.album && tags.album !== track.album) {
        patch.album = tags.album;
        patch.albumKey = slugKey(`${patch.artist || track.artist}::${tags.album}`);
      }
      if (tags.picture && !track.artUrl) {
        const blob = new Blob([tags.picture.data], { type: tags.picture.mime });
        patch.artUrl = URL.createObjectURL(blob);
      }

      if (Object.keys(patch).length) {
        if (patch.title || patch.artist || patch.album) {
          patch.words = trackWords({ ...track, ...patch });
        }
        await db.tracks.update(track.id, patch);
        updated += 1;
      }
    } catch {
      /* skip corrupt files */
    }

    done += 1;
    onProgress?.(done, withBlob.length);
  }

  return { scanned: withBlob.length, updated };
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
    tracks: tracks.map(({ objectUrl, artUrl, audioBlob, ...rest }) => rest),
    playlists,
    playlistTracks
  };
}
