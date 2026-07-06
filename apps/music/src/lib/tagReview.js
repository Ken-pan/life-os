import { supabase } from './supabase.js'
import { MUSIC_TABLES as T } from './supabaseTables.js'

/** @typedef {{ id: string, track_id: string, reason: string, confidence: number | null, proposed_tags: unknown, status: string, created_at: string, title?: string, artist?: string }} TagReviewRow */

/** @returns {Promise<TagReviewRow[]>} */
export async function fetchPendingTagReviews(limit = 20) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from(T.tagReviewQueue)
    .select('id, track_id, reason, confidence, proposed_tags, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data?.length) return []

  const ids = data.map((r) => r.track_id)
  const { data: meta } = await supabase
    .from(T.trackMeta)
    .select('track_id, title, artist')
    .eq('user_id', user.id)
    .in('track_id', ids)

  const metaById = new Map((meta || []).map((m) => [m.track_id, m]))
  return data.map((row) => {
    const m = metaById.get(row.track_id)
    return {
      ...row,
      title: m?.title || row.track_id.slice(0, 8),
      artist: m?.artist || '',
    }
  })
}

/** @param {string} id @param {'approved' | 'rejected'} status */
export async function resolveTagReview(id, status) {
  const { error } = await supabase
    .from(T.tagReviewQueue)
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

/** @returns {Promise<{ playEvents: number, embeddings: number, pendingReviews: number }>} */
export async function fetchRecommendationHealth() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { playEvents: 0, embeddings: 0, pendingReviews: 0 }

  const [pe, emb, rev] = await Promise.all([
    supabase
      .from(T.playEvents)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from(T.trackEmbeddings)
      .select('track_id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from(T.tagReviewQueue)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending'),
  ])

  return {
    playEvents: pe.count ?? 0,
    embeddings: emb.count ?? 0,
    pendingReviews: rev.count ?? 0,
  }
}
