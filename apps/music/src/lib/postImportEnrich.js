import { supabase } from './supabase.js'

/**
 * Server-side post-import enrich: MusicBrainz ID, optional LLM tags, embeddings.
 * @param {string[]} trackIds
 */
export async function postImportServerEnrich(trackIds) {
  if (!trackIds?.length) return null

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return null

  try {
    const res = await fetch('/api/import/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ trackIds: trackIds.slice(0, 12) }),
    })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, ...(await res.json()) }
  } catch {
    return { ok: false }
  }
}
