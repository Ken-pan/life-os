import { auth } from './auth.svelte.js'
import {
  importMediaFiles,
  ensureArtRepaired,
  repairFilenameMetadata,
  ensureLyricsRepaired,
} from './import.js'
import { db } from './db.js'
import { uploadTracksByIds } from './cloudAudio.js'
import { enrichTracksHeuristic } from './trackEnrichmentClient.js'
import { syncBidirectional } from './sync.js'
import { bumpLibraryEpoch } from './state.svelte.js'

/** @typedef {'import' | 'art' | 'metadata' | 'upload' | 'tags' | 'sync'} ImportPhase */

/**
 * @typedef {Object} ImportProgress
 * @property {ImportPhase} phase
 * @property {number} done
 * @property {number} total
 * @property {string} [title]
 */

/**
 * Full import pipeline: local IndexedDB → cover repair → cloud upload → heuristic tags → sync.
 * @param {FileList | File[]} files
 * @param {(progress: ImportProgress) => void} [onProgress]
 */
export async function runImportPipeline(files, onProgress) {
  /** @param {ImportPhase} phase @param {number} done @param {number} total @param {string} [title] */
  const emit = (phase, done, total, title) => {
    onProgress?.({ phase, done, total, title })
  }

  const list = [...files]
  emit('import', 0, list.length || 1)

  const { audioCount, lrcCount, total, trackIds } = await importMediaFiles(
    files,
    (done, tot) => emit('import', done, tot),
  )

  if (audioCount === 0) {
    return {
      audioCount,
      lrcCount,
      total,
      trackIds,
      uploaded: 0,
      uploadFailed: 0,
      tagged: 0,
      tagFailed: 0,
      cloud: false,
    }
  }

  emit('art', 0, 1)
  await ensureArtRepaired()
  emit('art', 1, 1)

  emit('metadata', 0, 1)
  await repairFilenameMetadata()
  emit('metadata', 1, 1)

  const user = auth.user
  let uploaded = 0
  let uploadFailed = 0
  let tagged = 0
  let tagFailed = 0

  if (user) {
    const freshTracks = await loadTracksByIds(trackIds)
    const pending = freshTracks.filter((t) => t.audioBlob && !t.storagePath)

    if (pending.length) {
      const uploadResult = await uploadTracksByIds(
        pending.map((t) => t.id),
        ({ done, total: tot, title }) =>
          emit('upload', done, tot, title),
      )
      uploaded = uploadResult.uploaded
      uploadFailed = uploadResult.failed
    }

    const forTags = await loadTracksByIds(trackIds)
    const tagTargets = forTags.filter((t) => t.storagePath)
    if (tagTargets.length) {
      const tagResult = await enrichTracksHeuristic(user.id, tagTargets, ({ done, total: tot, title }) =>
        emit('tags', done, tot, title),
      )
      tagged = tagResult.tagged
      tagFailed = tagResult.failed
    }

    emit('sync', 0, 1)
    try {
      await syncBidirectional({ silent: true })
    } catch {
      /* metadata already upserted during upload; sync is best-effort */
    }
    emit('sync', 1, 1)
  }

  bumpLibraryEpoch()
  void ensureLyricsRepaired()

  return {
    audioCount,
    lrcCount,
    total,
    trackIds,
    uploaded,
    uploadFailed,
    tagged,
    tagFailed,
    cloud: Boolean(user),
  }
}

/** @param {string[]} trackIds */
async function loadTracksByIds(trackIds) {
  if (!trackIds.length) return []
  const rows = await db.tracks.bulkGet(trackIds)
  return rows.filter(Boolean)
}
