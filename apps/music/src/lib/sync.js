import { browser } from '$app/environment'
import { createDebouncedTask } from '@life-os/sync'
import { supabase } from './supabase.js'
import { MUSIC_TABLES as T } from './supabaseTables.js'
import { prefetchSignedUrls } from './cloudAudio.js'
import {
  db,
  slugKey,
  trackWords,
  getAllTracks,
  getPlaylists,
  getPlaylistTracks,
} from './db.js'
import { peekAlbumArt, setAlbumArtRemoteUrl } from './albumArtStore.js'
import { S, applyCloudSettingsMerge } from './state.svelte.js'
import { pickCloudSettings } from './settingsPersistence.js'
import { mergeTrackMetaForPush } from './trackMetaMerge.js'
import { t } from './i18n/index.js'
import { notifySyncError, withSyncNotify } from './syncNotify.js'

const APP_ID = 'music'
const SCHEMA_VERSION = 4

async function requireUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error(t('sync.notSignedIn'))
  return data.user
}

export { syncErrorMessage } from './syncNotify.js'

async function fetchCloudSnapshot(userId) {
  const [stateRes, tracksRes, playlistsRes, ptRes] = await Promise.all([
    supabase.from(T.userState).select('*').eq('user_id', userId).maybeSingle(),
    supabase.from(T.trackMeta).select('*').eq('user_id', userId),
    supabase.from(T.playlists).select('*').eq('user_id', userId),
    supabase.from(T.playlistTracks).select('*').eq('user_id', userId),
  ])
  for (const res of [stateRes, tracksRes, playlistsRes, ptRes]) {
    if (res.error) throw res.error
  }
  return {
    state: stateRes.data,
    tracks: tracksRes.data ?? [],
    playlists: playlistsRes.data ?? [],
    playlistTracks: ptRes.data ?? [],
  }
}

async function pushLocal(userId) {
  const tracks = await getAllTracks()
  const playlists = await getPlaylists()
  const snap = await fetchCloudSnapshot(userId)

  await supabase.from(T.userState).upsert({
    user_id: userId,
    settings: pickCloudSettings(S.settings),
    schema_version: SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
  })

  if (tracks.length) {
    /** @type {Map<string, Record<string, unknown>>} */
    const cloudById = new Map(
      (snap.tracks ?? []).map((row) => [row.track_id, row]),
    )
    const rows = tracks.map((tr) => {
      const cloud = cloudById.get(tr.id)
      const { merged, cloudArt } = mergeTrackMetaForPush(tr, cloud, {
        slugKey,
        trackWords,
      })
      const localArt = peekAlbumArt(merged.albumKey)?.artRemoteUrl || ''
      const artRemote =
        localArt ||
        (cloudArt.startsWith('https://') ? cloudArt : '') ||
        ''
      return {
        user_id: userId,
        track_id: merged.id,
        title: merged.title,
        artist: merged.artist,
        album: merged.album,
        album_key: merged.albumKey,
        artist_key: merged.artistKey,
        duration: (() => {
          const local = Number(merged.duration) || 0
          const cloudDur = Number(cloud?.duration) || 0
          return local > 0 ? local : cloudDur
        })(),
        liked: merged.liked,
        play_count: merged.playCount,
        added_at: merged.addedAt,
        lyrics: merged.lyrics || '',
        storage_path: merged.storagePath || '',
        mime_type: merged.mime || '',
        size_bytes: merged.size || 0,
        art_remote_url: artRemote,
      }
    })
    let { error } = await supabase.from(T.trackMeta).upsert(rows)
    // Remote may lag behind local migrations — drop new columns and retry.
    if (
      error &&
      /lyrics|storage_path|mime_type|size_bytes|art_remote_url|column/i.test(
        error.message || '',
      )
    ) {
      const slim = rows.map(
        ({
          lyrics: _l,
          storage_path: _s,
          mime_type: _m,
          size_bytes: _b,
          art_remote_url: _a,
          ...rest
        }) => rest,
      )
      ;({ error } = await supabase.from(T.trackMeta).upsert(slim))
    }
    if (error) throw error
  }

  const plRows = playlists
    .filter((p) => p.kind === 'user')
    .map((p) => ({
      user_id: userId,
      id: p.id,
      name: p.name,
      kind: p.kind,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }))
  if (plRows.length) {
    const { error } = await supabase.from(T.playlists).upsert(plRows)
    if (error) throw error
  }

  /** @type {{ user_id: string, playlist_id: string, track_id: string, position: number }[]} */
  const ptRows = []
  for (const pl of playlists.filter((p) => p.kind === 'user')) {
    const pts = await getPlaylistTracks(pl.id)
    pts.forEach((tr, i) => {
      ptRows.push({
        user_id: userId,
        playlist_id: pl.id,
        track_id: tr.id,
        position: i,
      })
    })
  }
  if (ptRows.length) {
    const { error } = await supabase.from(T.playlistTracks).upsert(ptRows)
    if (error) throw error
  }
}

async function pullCloud(userId) {
  const snap = await fetchCloudSnapshot(userId)
  if (snap.state?.settings) {
    applyCloudSettingsMerge(snap.state.settings)
    applyThemeFromCloud()
  }

  for (const row of snap.playlists) {
    await db.playlists.put({
      id: row.id,
      name: row.name,
      kind: row.kind,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    })
  }

  for (const row of snap.tracks) {
    const existing = await db.tracks.get(row.track_id)
    /** @type {Partial<import('./types.js').Track>} */
    const patch = {
      title: row.title,
      artist: row.artist,
      album: row.album,
      albumKey: row.album_key,
      artistKey: row.artist_key,
      duration: Math.max(
        Number(existing?.duration) || 0,
        Number(row.duration) || 0,
      ),
      liked: /** @type {0|1} */ (row.liked ? 1 : 0),
      playCount: row.play_count,
      addedAt: Number(row.added_at),
    }
    if (typeof row.lyrics === 'string' && row.lyrics) patch.lyrics = row.lyrics
    if (typeof row.storage_path === 'string' && row.storage_path)
      patch.storagePath = row.storage_path
    if (typeof row.mime_type === 'string' && row.mime_type)
      patch.mime = row.mime_type
    if (row.size_bytes) patch.size = Number(row.size_bytes)
    if (
      typeof row.art_remote_url === 'string' &&
      row.art_remote_url.startsWith('https://')
    ) {
      await setAlbumArtRemoteUrl(
        row.album_key || patch.albumKey || '',
        row.artist || '',
        row.album || '',
        row.art_remote_url,
      )
    }

    if (existing) {
      await db.tracks.update(row.track_id, patch)
    } else if (row.storage_path) {
      // Cloud-only track (no local blob yet) — playable via signed URL.
      await db.tracks.put({
        id: row.track_id,
        title: row.title || '',
        artist: row.artist || '',
        album: row.album || '',
        albumKey: row.album_key || '',
        artistKey: row.artist_key || '',
        duration: Number(row.duration) || 0,
        mime: row.mime_type || 'audio/mpeg',
        size: Number(row.size_bytes) || 0,
        addedAt: Number(row.added_at) || Date.now(),
        playCount: row.play_count || 0,
        liked: /** @type {0|1} */ (row.liked ? 1 : 0),
        lyrics: typeof row.lyrics === 'string' ? row.lyrics : '',
        storagePath: row.storage_path,
        words: trackWords({
          title: row.title || '',
          artist: row.artist || '',
          album: row.album || '',
        }),
      })
    }
  }

  for (const row of snap.playlistTracks) {
    const exists = await db.playlistTracks
      .where('playlistId')
      .equals(row.playlist_id)
      .filter((r) => r.trackId === row.track_id)
      .first()
    if (!exists) {
      await db.playlistTracks.add({
        playlistId: row.playlist_id,
        trackId: row.track_id,
        position: row.position,
      })
    }
  }

  if (snap.tracks.length) {
    import('./import.js')
      .then(
        ({
          repairFilenameMetadata,
          repairGarbledMetadata,
          ensureArtRepaired,
        }) => {
          void repairFilenameMetadata()
          void repairGarbledMetadata()
          void ensureArtRepaired()
        },
      )
      .catch(() => {})
    const cloudPaths = snap.tracks
      .map((row) =>
        typeof row.storage_path === 'string' ? row.storage_path : '',
      )
      .filter(Boolean)
    void prefetchSignedUrls(cloudPaths, 32)
  }
}

function applyThemeFromCloud() {
  import('./state.svelte.js').then(({ applyTheme }) => applyTheme())
}

/** @param {{ silent?: boolean, force?: boolean }} [opts] */
async function syncBidirectionalInternal(opts = {}) {
  if (!browser) return
  const user = await requireUser()
  await pushLocal(user.id)
  await pullCloud(user.id)
  if (!opts.silent) {
    import('./ui.svelte.js').then(({ toast }) =>
      toast(t('sync.ok'), 'success', { key: 'sync-ok' }),
    )
  }
}

/** @param {{ silent?: boolean, force?: boolean }} [opts] */
export async function syncBidirectional(opts = {}) {
  return syncBidirectionalInternal(opts)
}

let lastSync = 0
export function resetSyncCooldown() {
  lastSync = 0
}

const debouncedSync = createDebouncedTask(async () => {
  try {
    await syncBidirectionalInternal({ silent: true })
  } catch (err) {
    notifySyncError(err)
  }
}, 4000)

export function scheduleAutoCloudPush() {
  debouncedSync.schedule()
}

export async function syncBidirectionalSafe(opts = {}) {
  return withSyncNotify(() => syncBidirectionalInternal(opts))
}

void APP_ID
