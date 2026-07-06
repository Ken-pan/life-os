import { browser } from '$app/environment';
import { createDebouncedTask } from '@life-os/sync';
import { supabase } from './supabase.js';
import { MUSIC_TABLES as T } from './supabaseTables.js';
import { db, getAllTracks, getPlaylists, getPlaylistTracks } from './db.js';
import { S, save } from './state.svelte.js';
import { t } from './i18n/index.js';

const APP_ID = 'music';
const SCHEMA_VERSION = 2;

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(t('sync.notSignedIn'));
  return data.user;
}

export function syncErrorMessage(err) {
  const msg = err?.message || '';
  if (/rate limit|too many requests/i.test(msg)) return t('auth.errRateLimit');
  if (/network|fetch/i.test(msg)) return t('auth.errNetwork');
  return msg || t('sync.failed');
}

async function fetchCloudSnapshot(userId) {
  const [stateRes, tracksRes, playlistsRes, ptRes] = await Promise.all([
    supabase.from(T.userState).select('*').eq('user_id', userId).maybeSingle(),
    supabase.from(T.trackMeta).select('*').eq('user_id', userId),
    supabase.from(T.playlists).select('*').eq('user_id', userId),
    supabase.from(T.playlistTracks).select('*').eq('user_id', userId)
  ]);
  for (const res of [stateRes, tracksRes, playlistsRes, ptRes]) {
    if (res.error) throw res.error;
  }
  return {
    state: stateRes.data,
    tracks: tracksRes.data ?? [],
    playlists: playlistsRes.data ?? [],
    playlistTracks: ptRes.data ?? []
  };
}

async function pushLocal(userId) {
  const tracks = await getAllTracks();
  const playlists = await getPlaylists();

  await supabase.from(T.userState).upsert({
    user_id: userId,
    settings: S.settings,
    schema_version: SCHEMA_VERSION,
    updated_at: new Date().toISOString()
  });

  if (tracks.length) {
    const rows = tracks.map((tr) => ({
      user_id: userId,
      track_id: tr.id,
      title: tr.title,
      artist: tr.artist,
      album: tr.album,
      album_key: tr.albumKey,
      artist_key: tr.artistKey,
      duration: tr.duration,
      liked: tr.liked,
      play_count: tr.playCount,
      added_at: tr.addedAt,
      lyrics: tr.lyrics || ''
    }));
    let { error } = await supabase.from(T.trackMeta).upsert(rows);
    // Remote may not have lyrics column yet — fall back to metadata-only upsert.
    if (error && /lyrics|column/i.test(error.message || '')) {
      const slim = rows.map(({ lyrics: _lyrics, ...rest }) => rest);
      ({ error } = await supabase.from(T.trackMeta).upsert(slim));
    }
    if (error) throw error;
  }

  const plRows = playlists
    .filter((p) => p.kind === 'user')
    .map((p) => ({
      user_id: userId,
      id: p.id,
      name: p.name,
      kind: p.kind,
      created_at: p.createdAt,
      updated_at: p.updatedAt
    }));
  if (plRows.length) {
    const { error } = await supabase.from(T.playlists).upsert(plRows);
    if (error) throw error;
  }

  /** @type {{ user_id: string, playlist_id: string, track_id: string, position: number }[]} */
  const ptRows = [];
  for (const pl of playlists.filter((p) => p.kind === 'user')) {
    const pts = await getPlaylistTracks(pl.id);
    pts.forEach((tr, i) => {
      ptRows.push({ user_id: userId, playlist_id: pl.id, track_id: tr.id, position: i });
    });
  }
  if (ptRows.length) {
    const { error } = await supabase.from(T.playlistTracks).upsert(ptRows);
    if (error) throw error;
  }
}

async function pullCloud(userId) {
  const snap = await fetchCloudSnapshot(userId);
  if (snap.state?.settings) {
    S.settings = { ...S.settings, ...snap.state.settings };
    save();
    applyThemeFromCloud();
  }

  for (const row of snap.playlists) {
    await db.playlists.put({
      id: row.id,
      name: row.name,
      kind: row.kind,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    });
  }

  for (const row of snap.tracks) {
    const existing = await db.tracks.get(row.track_id);
    if (existing) {
      /** @type {Partial<import('./types.js').Track>} */
      const patch = {
        title: row.title,
        artist: row.artist,
        album: row.album,
        albumKey: row.album_key,
        artistKey: row.artist_key,
        duration: Number(row.duration),
        liked: /** @type {0|1} */ (row.liked ? 1 : 0),
        playCount: row.play_count,
        addedAt: Number(row.added_at)
      };
      if (typeof row.lyrics === 'string' && row.lyrics) patch.lyrics = row.lyrics;
      await db.tracks.update(row.track_id, patch);
    }
  }

  for (const row of snap.playlistTracks) {
    const exists = await db.playlistTracks
      .where('playlistId')
      .equals(row.playlist_id)
      .filter((r) => r.trackId === row.track_id)
      .first();
    if (!exists) {
      await db.playlistTracks.add({
        playlistId: row.playlist_id,
        trackId: row.track_id,
        position: row.position
      });
    }
  }
}

function applyThemeFromCloud() {
  import('./state.svelte.js').then(({ applyTheme }) => applyTheme());
}

/** @param {{ silent?: boolean, force?: boolean }} [opts] */
export async function syncBidirectional(opts = {}) {
  if (!browser) return;
  const user = await requireUser();
  await pushLocal(user.id);
  await pullCloud(user.id);
  if (!opts.silent) {
    import('./ui.svelte.js').then(({ toast }) => toast(t('sync.ok')));
  }
}

let lastSync = 0;
export function resetSyncCooldown() {
  lastSync = 0;
}

const debouncedSync = createDebouncedTask(() => syncBidirectional({ silent: true }), 4000);

export function scheduleAutoCloudPush() {
  debouncedSync.schedule();
}

export async function syncBidirectionalSafe(opts = {}) {
  try {
    await syncBidirectional(opts);
  } catch (err) {
    if (!opts.silent) {
      import('./ui.svelte.js').then(({ toast }) => toast(syncErrorMessage(err)));
    }
    throw err;
  }
}

void APP_ID;
