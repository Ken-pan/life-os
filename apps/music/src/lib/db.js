import Dexie from 'dexie';

export const db = new Dexie('musicos_library');

db.version(1).stores({
  tracks: 'id, title, artist, album, albumKey, artistKey, duration, addedAt, playCount, liked, *words',
  playlists: 'id, name, createdAt, updatedAt, kind',
  playlistTracks: '++rowId, playlistId, trackId, position',
  recent: 'trackId, playedAt'
});

/** @param {string} s */
export function slugKey(s) {
  return (s || 'unknown').trim().toLowerCase() || 'unknown';
}

/** @param {Partial<import('./types.js').Track>} track */
export function trackWords(track) {
  return `${track.title || ''} ${track.artist || ''} ${track.album || ''}`.toLowerCase().split(/\s+/).filter(Boolean);
}

/** @param {import('./types.js').Track & { audioBlob?: Blob, artBlob?: Blob, objectUrl?: string }} track */
export function hydrateTrack(track) {
  if (!track) return track;
  if (track.audioBlob && !track.objectUrl) {
    track.objectUrl = URL.createObjectURL(track.audioBlob);
  }
  if (track.artBlob instanceof Blob) {
    if (!track.artUrl) {
      track.artUrl = URL.createObjectURL(track.artBlob);
    }
  } else if (typeof track.artRemoteUrl === 'string' && track.artRemoteUrl.startsWith('https://')) {
    track.artUrl = track.artRemoteUrl;
  } else if (track.artUrl?.startsWith('blob:')) {
    // blob: URLs are session-only; persisted values break after reload.
    delete track.artUrl;
  }
  return track;
}

/** @returns {Promise<import('./types.js').Track[]>} */
export async function getAllTracks() {
  const rows = await db.tracks.orderBy('addedAt').reverse().toArray();
  return rows.map(hydrateTrack);
}

/** @param {string} q */
export async function searchTracks(q) {
  const query = q.trim().toLowerCase();
  if (!query) return getAllTracks();
  return db.tracks.filter((t) => t.words.some((w) => w.includes(query) || query.includes(w))).toArray().then((rows) => rows.map(hydrateTrack));
}

/** @returns {Promise<{ album: string, albumKey: string, artist: string, trackCount: number, artUrl?: string }[]>} */
export async function getAlbumGroups() {
  const tracks = await getAllTracks();
  /** @type {Map<string, { album: string, albumKey: string, artist: string, trackCount: number, artUrl?: string }>} */
  const map = new Map();
  for (const t of tracks) {
    const key = t.albumKey;
    const cur = map.get(key) || {
      album: t.album,
      albumKey: key,
      artist: t.artist,
      trackCount: 0,
      artUrl: t.artUrl
    };
    cur.trackCount += 1;
    if (!cur.artUrl && t.artUrl) cur.artUrl = t.artUrl;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.album.localeCompare(b.album, 'zh'));
}

/** @returns {Promise<{ artist: string, artistKey: string, trackCount: number }[]>} */
export async function getArtistGroups() {
  const tracks = await getAllTracks();
  /** @type {Map<string, { artist: string, artistKey: string, trackCount: number }>} */
  const map = new Map();
  for (const t of tracks) {
    const key = t.artistKey;
    const cur = map.get(key) || { artist: t.artist, artistKey: key, trackCount: 0 };
    cur.trackCount += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.artist.localeCompare(b.artist, 'zh'));
}

/** @param {string} albumKey */
export async function getTracksByAlbum(albumKey) {
  const rows = await db.tracks.where('albumKey').equals(albumKey).sortBy('title');
  return rows.map(hydrateTrack);
}

/** @param {string} artistKey */
export async function getTracksByArtist(artistKey) {
  const rows = await db.tracks.where('artistKey').equals(artistKey).sortBy('album');
  return rows.map(hydrateTrack);
}

/** @returns {Promise<import('./types.js').Track[]>} */
export async function getLikedTracks() {
  const rows = await db.tracks.filter((t) => t.liked === 1).toArray();
  return rows.map(hydrateTrack).sort((a, b) => b.addedAt - a.addedAt);
}

/** @returns {Promise<import('./types.js').Track[]>} */
export async function getRecentTracks(limit = 12) {
  const rows = await db.recent.orderBy('playedAt').reverse().limit(limit).toArray();
  const ids = rows.map((r) => r.trackId);
  if (!ids.length) return [];
  const tracks = await db.tracks.bulkGet(ids);
  return tracks.filter(Boolean).map(hydrateTrack);
}

/** @param {string} trackId */
export async function toggleLike(trackId) {
  const track = await db.tracks.get(trackId);
  if (!track) return;
  await db.tracks.update(trackId, { liked: track.liked ? 0 : 1 });
}

/** @returns {Promise<import('./types.js').Playlist[]>} */
export async function getPlaylists() {
  return db.playlists.orderBy('updatedAt').reverse().toArray();
}

/** @param {string} name @param {string} [kind] */
export async function createPlaylist(name, kind = 'user') {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.playlists.add({ id, name, kind, createdAt: now, updatedAt: now });
  return id;
}

/** @param {string} playlistId */
export async function getPlaylistTracks(playlistId) {
  const rows = await db.playlistTracks.where('playlistId').equals(playlistId).sortBy('position');
  const tracks = await db.tracks.bulkGet(rows.map((r) => r.trackId));
  return tracks.filter(Boolean).map(hydrateTrack);
}

/** @param {string} playlistId @param {string} trackId */
export async function addTrackToPlaylist(playlistId, trackId) {
  const existing = await db.playlistTracks.where('playlistId').equals(playlistId).filter((r) => r.trackId === trackId).first();
  if (existing) return;
  const count = await db.playlistTracks.where('playlistId').equals(playlistId).count();
  await db.playlistTracks.add({ playlistId, trackId, position: count });
  await db.playlists.update(playlistId, { updatedAt: Date.now() });
}

/** @param {string} trackId */
export async function recordPlay(trackId) {
  const now = Date.now();
  await db.recent.put({ trackId, playedAt: now });
  const track = await db.tracks.get(trackId);
  if (track) await db.tracks.update(trackId, { playCount: (track.playCount || 0) + 1 });
}

/** @returns {Promise<number>} */
export async function trackCount() {
  return db.tracks.count();
}

/** @param {import('./types.js').Track} track */
export function trackNeedsLyrics(track) {
  if (track.lyrics?.trim()) return false;
  return Boolean(track.title?.trim() && track.artist?.trim());
}

/** Tracks missing lyrics (any library row with title + artist). */
export async function countTracksWithoutLyrics() {
  return db.tracks.filter((t) => trackNeedsLyrics(t)).count();
}

/** Ensure built-in playlists */
export async function ensureBuiltinPlaylists() {
  const liked = await db.playlists.where('kind').equals('liked').first();
  if (!liked) {
    await db.playlists.add({
      id: 'builtin-liked',
      name: '我喜欢的音乐',
      kind: 'liked',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
}
