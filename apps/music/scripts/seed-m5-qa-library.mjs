/**
 * MUSC.PIPE.5 QA fixture — minimal cloud library for p1a / default QA user.
 * Idempotent upsert so `qa:rec-behavior` can run without production credentials.
 */
import { createHash } from 'crypto'

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

const PREFIX = 'm5qa-'

/** @type {{ id: string; title: string; artist: string; album: string; tags: { slug: string; confidence: number }[]; energy: number; danceability: number }[]} */
export const M5_QA_TRACKS = [
  {
    id: `${PREFIX}seed-001`,
    title: 'M5 QA Seed',
    artist: 'Pop Star',
    album: 'Behavior Suite',
    tags: [
      { slug: 'pop', confidence: 0.9 },
      { slug: 'dance-pop', confidence: 0.85 },
      { slug: 'confident', confidence: 0.8 },
    ],
    energy: 3.5,
    danceability: 3.8,
  },
  {
    id: `${PREFIX}cand-002`,
    title: 'M5 QA Candidate B',
    artist: 'Pop Star',
    album: 'Behavior Suite',
    tags: [
      { slug: 'pop', confidence: 0.88 },
      { slug: 'dance-pop', confidence: 0.82 },
      { slug: 'euphoric', confidence: 0.75 },
    ],
    energy: 3.4,
    danceability: 3.7,
  },
  {
    id: `${PREFIX}cand-003`,
    title: 'M5 QA Candidate C',
    artist: 'Pop Star',
    album: 'Behavior Suite',
    tags: [
      { slug: 'pop', confidence: 0.86 },
      { slug: 'dance-pop', confidence: 0.8 },
      { slug: 'confident', confidence: 0.7 },
    ],
    energy: 3.3,
    danceability: 3.6,
  },
  {
    id: `${PREFIX}cand-004`,
    title: 'M5 QA Candidate D',
    artist: 'Alt Pop',
    album: 'Behavior Suite',
    tags: [
      { slug: 'pop', confidence: 0.84 },
      { slug: 'dance-pop', confidence: 0.78 },
      { slug: 'euphoric', confidence: 0.72 },
    ],
    energy: 3.2,
    danceability: 3.5,
  },
]

/** @param {string} value */
function keyFor(value) {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

/**
 * @param {SupabaseClient} sb
 * @param {string} userId
 * @returns {Promise<{ seeded: number; seedTrackId: string }>}
 */
export async function ensureM5QaLibrary(sb, userId) {
  const { count, error: countErr } = await sb
    .from('music_track_meta')
    .select('track_id', { count: 'exact', head: true })
    .like('track_id', `${PREFIX}%`)

  if (countErr) throw countErr
  if ((count ?? 0) >= M5_QA_TRACKS.length) {
    return { seeded: 0, seedTrackId: M5_QA_TRACKS[0].id }
  }

  const now = Date.now()
  let seeded = 0

  for (const track of M5_QA_TRACKS) {
    const artistKey = keyFor(track.artist)
    const albumKey = keyFor(track.album)

    const { error: metaErr } = await sb.from('music_track_meta').upsert(
      {
        user_id: userId,
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_key: albumKey,
        artist_key: artistKey,
        duration: 200,
        liked: 0,
        play_count: 0,
        added_at: now,
      },
      { onConflict: 'user_id,track_id' },
    )
    if (metaErr) throw metaErr

    const { error: enrichErr } = await sb.from('track_enrichment').upsert(
      {
        user_id: userId,
        track_id: track.id,
        source_quality: 'standard-quality',
        tagging_status: 'ready',
        tag_confidence_avg: 0.8,
      },
      { onConflict: 'user_id,track_id' },
    )
    if (enrichErr) throw enrichErr

    const { error: featErr } = await sb.from('track_audio_features').upsert(
      {
        user_id: userId,
        track_id: track.id,
        energy: track.energy,
        danceability: track.danceability,
        valence: 3.5,
      },
      { onConflict: 'user_id,track_id' },
    )
    if (featErr) throw featErr

    for (const tag of track.tags) {
      const { error: tagErr } = await sb.from('track_tags').upsert(
        {
          user_id: userId,
          track_id: track.id,
          tag_slug: tag.slug,
          confidence: tag.confidence,
          source: 'heuristic',
          locked: false,
        },
        { onConflict: 'user_id,track_id,tag_slug,source' },
      )
      if (tagErr) throw tagErr
    }

    seeded += 1
  }

  return { seeded, seedTrackId: M5_QA_TRACKS[0].id }
}

/** Stable id for cleanup of MUSC.PIPE.5 test play_events */
export function m5QaEventFingerprint(trackId) {
  return createHash('sha256').update(`m5qa:${trackId}`).digest('hex').slice(0, 32)
}
