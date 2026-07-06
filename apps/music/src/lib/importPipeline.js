import { auth } from './auth.svelte.js'
import {
  importMediaFiles,
  ensureArtRepaired,
  repairFilenameMetadata,
  repairMissingLyrics,
} from './import.js'
import { enrichImportedTracksFromItunes } from './externalMetadata.js'
import { db } from './db.js'
import { uploadTracksByIds } from './cloudAudio.js'
import { enrichTracksHeuristic } from './trackEnrichmentClient.js'
import { postImportServerEnrich } from './postImportEnrich.js'
import { syncBidirectional } from './sync.js'
import { bumpLibraryEpoch } from './state.svelte.js'

/** @typedef {'import' | 'art' | 'metadata' | 'upload' | 'tags' | 'enrich' | 'sync' | 'lyrics'} ImportPhase */

/**
 * @typedef {Object} ImportProgress
 * @property {ImportPhase} phase
 * @property {number} done
 * @property {number} total
 * @property {string} [title]
 */

/**
 * @typedef {Object} ImportPipelineResult
 * @property {number} audioCount
 * @property {number} lrcCount
 * @property {number} total
 * @property {string[]} trackIds
 * @property {number} uploaded
 * @property {number} uploadFailed
 * @property {number} tagged
 * @property {number} tagFailed
 * @property {boolean} cloud
 * @property {boolean} syncFailed
 * @property {boolean} enrichFailed
 * @property {number} enriched
 */

/**
 * Full import pipeline: local IndexedDB → metadata → cloud upload → tags → sync → server enrich → lyrics → sync.
 * @param {FileList | File[]} files
 * @param {(progress: ImportProgress) => void} [onProgress]
 * @returns {Promise<ImportPipelineResult>}
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
    { autoMaintain: false },
  )

  if (audioCount === 0) {
    return emptyResult(audioCount, lrcCount, total, trackIds)
  }

  emit('metadata', 0, trackIds.length || 1)
  await repairFilenameMetadata(trackIds)
  await enrichImportedTracksFromItunes(trackIds)
  emit('metadata', trackIds.length || 1, trackIds.length || 1)

  emit('art', 0, 1)
  await ensureArtRepaired()
  emit('art', 1, 1)

  const user = auth.user
  let uploaded = 0
  let uploadFailed = 0
  let tagged = 0
  let tagFailed = 0
  let syncFailed = false
  let enrichFailed = false
  let enriched = 0

  if (user) {
    const freshTracks = await loadTracksByIds(trackIds)
    const pending = freshTracks.filter((t) => t.audioBlob && !t.storagePath)

    if (pending.length) {
      const uploadResult = await uploadTracksByIds(
        pending.map((t) => t.id),
        ({ done, total: tot, title }) => emit('upload', done, tot, title),
      )
      uploaded = uploadResult.uploaded
      uploadFailed = uploadResult.failed
    }

    const forTags = await loadTracksByIds(trackIds)
    const tagTargets = forTags.filter((t) => t.storagePath)
    if (tagTargets.length) {
      const tagResult = await enrichTracksHeuristic(
        user.id,
        tagTargets,
        ({ done, total: tot, title }) => emit('tags', done, tot, title),
      )
      tagged = tagResult.tagged
      tagFailed = tagResult.failed
    }

    emit('sync', 0, 1)
    try {
      await syncBidirectional({ silent: true, force: true })
    } catch {
      syncFailed = true
    }
    emit('sync', 1, 1)

    emit('enrich', 0, 1)
    const enrichRes = await postImportServerEnrich(trackIds)
    if (enrichRes?.ok) {
      enriched = enrichRes.processed ?? trackIds.length
    } else if (enrichRes && !enrichRes.ok) {
      enrichFailed = true
    }
    emit('enrich', 1, 1)

    emit('lyrics', 0, trackIds.length)
    const lyricsResult = await repairMissingLyrics(
      (done, total) => emit('lyrics', done, total),
      trackIds,
    )
    if (lyricsResult.repaired > 0) {
      try {
        await syncBidirectional({ silent: true, force: true })
      } catch {
        syncFailed = true
      }
    }
  }

  bumpLibraryEpoch()

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
    syncFailed,
    enrichFailed,
    enriched,
  }
}

/** @param {number} audioCount @param {number} lrcCount @param {number} total @param {string[]} trackIds */
function emptyResult(audioCount, lrcCount, total, trackIds) {
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
    syncFailed: false,
    enrichFailed: false,
    enriched: 0,
  }
}

/** @param {string[]} trackIds */
async function loadTracksByIds(trackIds) {
  if (!trackIds.length) return []
  const rows = await db.tracks.bulkGet(trackIds)
  return rows.filter(Boolean)
}
