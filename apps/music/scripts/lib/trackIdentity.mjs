/** Shared title/artist normalization for dedupe + smoke seed search. */

/** @param {string} s */
export function nfkc(s) {
  return String(s ?? '').normalize('NFKC')
}

const PAREN_NOISE =
  /\s*\([^)]*(explicit|clean|radio edit|radio-edit|instrumental|live|remix|version|edit|sped|slowed|dirty|album version)[^)]*\)/gi

/** @param {string} s */
export function canonicalTitle(s) {
  return nfkc(s)
    .toLowerCase()
    .replace(PAREN_NOISE, '')
    .replace(/[?!.,'"''""`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} s */
export function canonicalArtist(s) {
  const raw = nfkc(s)
    .toLowerCase()
    .replace(/\s*(feat\.?|ft\.?|featuring|with)\s+/gi, ';')
    .replace(/\s*[;&、，]\s*/g, ';')
    .replace(/\s+x\s+/g, ';')
    .replace(/\s+/g, ' ')
  const tokens = raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .sort()
  return tokens.join(';')
}

/** @param {string} title @param {string} artist */
export function canonicalTrackKey(title, artist) {
  const t = canonicalTitle(title)
  const a = canonicalArtist(artist)
  if (!t || !a) return `__invalid__::${title}::${artist}`
  return `${t}::${a}`
}

/** @param {string} artist */
export function artistTokens(artist) {
  return canonicalArtist(artist)
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** @param {string} a @param {string} b */
function tokenOverlap(a, b) {
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit += 1
  return hit / Math.max(ta.size, tb.size)
}

/** @param {string} title @param {object[]} tracks */
export function findTracksByTitle(title, tracks) {
  const st = canonicalTitle(title)
  if (!st) return []
  return tracks.filter((t) => {
    const ct = canonicalTitle(t.title)
    if (!ct) return false
    return (
      ct === st ||
      ct.includes(st) ||
      st.includes(ct) ||
      tokenOverlap(ct, st) >= 0.6
    )
  })
}

/**
 * @param {object} track
 * @param {string} specArtist
 * @param {string} specTitle
 */
export function scoreSeedMatch(track, specArtist, specTitle) {
  const ct = canonicalTitle(track.title)
  const st = canonicalTitle(specTitle)
  const titleScore =
    ct === st
      ? 1
      : ct.includes(st) || st.includes(ct)
        ? 0.85
        : tokenOverlap(ct, st)

  const specArts = artistTokens(specArtist)
  const trackArts = artistTokens(track.artist)
  if (!specArts.length) return titleScore * 0.5

  let artistHits = 0
  for (const sa of specArts) {
    if (
      trackArts.some((ta) => ta === sa || ta.includes(sa) || sa.includes(ta))
    ) {
      artistHits += 1
    }
  }
  const artistScore = artistHits / specArts.length
  return titleScore * 0.55 + artistScore * 0.45
}

/**
 * @param {object[]} tracks
 * @param {string} artist
 * @param {string} title
 */
export function findSeedTrack(tracks, artist, title) {
  const st = canonicalTitle(title)
  const sa = canonicalArtist(artist)
  const titlePool = findTracksByTitle(title, tracks)

  if (!titlePool.length) {
    return {
      track: null,
      match: null,
      reason: 'seed_not_found_library_absent',
      candidates: [],
    }
  }

  const exact = titlePool.find(
    (t) => canonicalTitle(t.title) === st && canonicalArtist(t.artist) === sa,
  )
  if (exact) {
    return { track: exact, match: 'exact', reason: null, candidates: [] }
  }

  const scored = titlePool
    .map((t) => ({ t, score: scoreSeedMatch(t, artist, title) }))
    .sort((a, b) => b.score - a.score)

  if (scored[0]?.score >= 0.72) {
    return {
      track: scored[0].t,
      match: scored[0].score >= 0.95 ? 'exact' : 'fuzzy',
      reason: null,
      candidates: [],
    }
  }

  return {
    track: null,
    match: null,
    reason: 'seed_not_found_search_too_strict',
    candidates: scored.slice(0, 3).map((x) => ({
      title: x.t.title,
      artist: x.t.artist,
      score: Number(x.score.toFixed(3)),
    })),
  }
}
