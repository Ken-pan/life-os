import { supabase } from './supabase.js'
import { MUSIC_TABLES as T } from './supabaseTables.js'
import {
  inferTags,
  qualityFromProbe,
  audioFromVibes,
  taggingStatusFromTags,
  versionFlagsFromTags,
} from './tagHeuristics.js'

/**
 * @param {string} userId
 * @param {import('./types.js').Track} track
 */
async function persistTrackEnrichment(userId, track) {
  const durationSec = Number(track.duration) || 0
  const sizeBytes = Number(track.size) || 0
  const tags = inferTags(track)
  const { bitrate_kbps, sourceQuality, qualityTag } = qualityFromProbe(
    null,
    sizeBytes,
    durationSec,
    track,
  )

  tags.push({ slug: qualityTag, confidence: 0.85, source: 'heuristic' })
  if (qualityTag !== 'bad-metadata') {
    tags.push({ slug: 'original', confidence: 0.7, source: 'heuristic' })
  }

  const { taggingStatus, tagConfidenceAvg } = taggingStatusFromTags(tags)
  const versionFlags = versionFlagsFromTags(tags)
  const codec = (track.mime || '').includes('flac')
    ? 'flac'
    : (track.mime || '').includes('m4a') || (track.mime || '').includes('mp4')
      ? 'm4a'
      : 'mp3'

  const enrichment = {
    user_id: userId,
    track_id: track.id,
    file_hash: track.id,
    codec,
    bitrate_kbps,
    sample_rate: null,
    source_quality: sourceQuality,
    ...versionFlags,
    tagging_status: taggingStatus,
    tag_confidence_avg: tagConfidenceAvg,
    analyzed_at: new Date().toISOString(),
  }

  const audio = audioFromVibes(tags, { duration_sec: durationSec })

  const { error: enrichErr } = await supabase
    .from(T.trackEnrichment)
    .upsert(enrichment)
  if (enrichErr) throw enrichErr

  await supabase
    .from(T.trackTags)
    .delete()
    .eq('user_id', userId)
    .eq('track_id', track.id)
    .in('source', ['heuristic', 'filename'])

  if (tags.length) {
    const { error: tagErr } = await supabase.from(T.trackTags).upsert(
      tags.map((t) => ({
        user_id: userId,
        track_id: track.id,
        tag_slug: t.slug,
        confidence: t.confidence,
        source: t.source,
        locked: false,
      })),
    )
    if (tagErr) throw tagErr
  }

  const { error: audioErr } = await supabase.from(T.trackAudioFeatures).upsert({
    user_id: userId,
    track_id: track.id,
    ...audio,
  })
  if (audioErr) throw audioErr

  if (taggingStatus === 'needs_review') {
    const { data: existing } = await supabase
      .from(T.tagReviewQueue)
      .select('id')
      .eq('user_id', userId)
      .eq('track_id', track.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (!existing) {
      await supabase.from(T.tagReviewQueue).insert({
        user_id: userId,
        track_id: track.id,
        reason: 'low_confidence_or_unknown',
        confidence: tagConfidenceAvg,
        proposed_tags: tags,
        status: 'pending',
      })
    }
  }

  return { taggingStatus, tagCount: tags.length }
}

/**
 * Heuristic enrich for tracks already in music_track_meta (post-upload).
 * @param {string} userId
 * @param {import('./types.js').Track[]} tracks
 * @param {(info: { done: number, total: number, title: string }) => void} [onProgress]
 */
export async function enrichTracksHeuristic(userId, tracks, onProgress) {
  let tagged = 0
  let failed = 0

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    onProgress?.({ done: i, total: tracks.length, title: track.title })
    try {
      await persistTrackEnrichment(userId, track)
      tagged += 1
    } catch {
      failed += 1
    }
  }

  onProgress?.({ done: tracks.length, total: tracks.length, title: '' })
  return { tagged, failed }
}
