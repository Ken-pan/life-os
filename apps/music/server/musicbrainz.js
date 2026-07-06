const MB_BASE = 'https://musicbrainz.org/ws/2'
const UA = 'MusicOS/0.1 (life-os; contact@example.com)'

/**
 * @param {string} artist
 * @param {string} title
 * @returns {Promise<{ id: string, title: string, artist: string, releaseYear: number | null } | null>}
 */
export async function lookupMusicBrainzRecording(artist, title) {
  const q = [`recording:"${escapeQuery(title)}"`, artist ? `artist:"${escapeQuery(artist)}"` : '']
    .filter(Boolean)
    .join(' AND ')
  const url = `${MB_BASE}/recording?${new URLSearchParams({ query: q, fmt: 'json', limit: '5' })}`

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = await res.json()
  const recordings = /** @type {{ id?: string, title?: string, score?: number, 'artist-credit'?: { artist?: { name?: string } }[], 'first-release-date'?: string }[]} */ (
    data.recordings || []
  )
  if (!recordings.length) return null

  const best =
    recordings.find((r) => norm(r.title) === norm(title)) ||
    recordings.sort((a, b) => (b.score || 0) - (a.score || 0))[0]
  if (!best?.id) return null

  return {
    id: best.id,
    title: best.title || title,
    artist: best['artist-credit']?.[0]?.artist?.name || artist,
    releaseYear: best['first-release-date']
      ? Number(String(best['first-release-date']).slice(0, 4)) || null
      : null,
  }
}

/** @param {string} s */
function escapeQuery(s) {
  return String(s ?? '').replace(/"/g, '\\"').trim()
}

/** @param {string} s */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .trim()
}
