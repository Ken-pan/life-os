import { db, slugKey, trackWords, ensureBuiltinPlaylists } from './db.js';
import { parseId3, parseFilename } from './id3.js';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;

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
      addedAt: Date.now(),
      playCount: existing?.playCount || 0,
      liked: existing?.liked || 0,
      artUrl,
      lyrics: tags.lyrics || existing?.lyrics,
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
    tracks: tracks.map(({ objectUrl, artUrl, ...rest }) => rest),
    playlists,
    playlistTracks
  };
}
