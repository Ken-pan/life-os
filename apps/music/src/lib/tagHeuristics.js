/** @typedef {{ slug: string, confidence: number, source: string }} TagHit */

const K_POP_SOLO = new Set([
  'jennie', 'lisa', 'rosé', 'rose', 'jisoo', 'iu', 'taeyeon', 'sunmi', 'hwasa', 'chung ha', 'chungha',
])

const K_POP_GROUPS = new Set([
  'blackpink', 'aespa', 'ive', 'itzy', 'newjeans', 'le sserafim', 'gidle', '(g)i-dle', 'twice', 'red velvet',
  'xg', 'babymonster', 'illit', 'kepler', 'fromis_9', 'stayc',
])

const WESTERN_POP_CLUB = new Set([
  'dua lipa', 'charli xcx', 'doja cat', 'tate mcrae', 'raye', 'ariana grande', 'madison beer', 'sabrina carpenter',
  'miley cyrus', 'lady gaga', 'britney spears', 'kylie minogue',
])

const EDM = new Set(['tiësto', 'tiesto', 'alan walker', 'calvin harris', 'david guetta', 'anyma', 'skrillex'])

const DRAMATIC_POP = new Set(['halsey', 'raye', 'ariana grande', 'demi lovato', 'sia'])

const QUIRKY_RAP = new Set(['bbno$', 'bbno', 'connor price', 'tom macdonald', 'lil nas x'])

function norm(s) {
  return String(s ?? '').trim().toLowerCase()
}

/** 短 token（如 iu）用词边界，避免 boygenius → iu 误匹配 */
function textHasToken(text, token) {
  const t = norm(text)
  const k = norm(token)
  if (!t || !k) return false
  if (k.length <= 3) {
    return new RegExp(`(?:^|[\\s(,;\\[\\/])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s),;\\]\\/])`).test(` ${t} `)
  }
  return t.includes(k)
}

function artistMatches(artist, title, token) {
  return textHasToken(artist, token) || textHasToken(title, token)
}

/** @param {Map<string, TagHit>} map */
function addTag(map, slug, confidence, source) {
  const prev = map.get(slug)
  if (!prev || prev.confidence < confidence) {
    map.set(slug, { slug, confidence, source })
  }
}

/** @param {Map<string, TagHit>} map */
function inferFromText(map, text, source, confidence = 0.65) {
  const t = norm(text)
  if (!t) return

  if (/k-pop|kpop|blackpink|girl crush|女团|成员/.test(t)) {
    addTag(map, 'k-pop', confidence, source)
    addTag(map, 'girl-crush', confidence - 0.05, source)
    addTag(map, 'baddie', confidence - 0.08, source)
  }
  if (/dua lipa/.test(t)) {
    addTag(map, 'dance-pop', confidence, source)
    addTag(map, 'pop', confidence - 0.05, source)
    addTag(map, 'club', confidence - 0.05, source)
    addTag(map, 'playlist-continue-good', confidence - 0.1, source)
  }
  if (/raye|tate|doja|ariana|halsey/.test(t)) {
    addTag(map, 'pop', confidence, source)
    addTag(map, 'dance-pop', confidence - 0.05, source)
    addTag(map, 'dramatic', confidence - 0.05, source)
    addTag(map, 'confident', confidence - 0.08, source)
  }
  if (/怪可爱|tiktok|rap|meme|魔性/.test(t)) {
    addTag(map, 'hip-hop', confidence - 0.05, source)
    addTag(map, 'rap', confidence - 0.05, source)
    addTag(map, 'quirky', confidence, source)
    addTag(map, 'meme', confidence - 0.05, source)
    addTag(map, 'playful', confidence - 0.08, source)
  }
  if (/edm|techno|trance|walker|tiësto|tiesto/.test(t)) {
    addTag(map, 'edm', confidence, source)
    addTag(map, 'euphoric', confidence - 0.05, source)
    addTag(map, 'gym', confidence - 0.1, source)
  }
  if (/night|drive|weeknd|neon/.test(t)) {
    addTag(map, 'night-drive', confidence - 0.05, source)
    addTag(map, 'neon', confidence - 0.08, source)
  }
  if (/game|ost|anime|boss/.test(t)) {
    addTag(map, 'game-ost', confidence - 0.05, source)
    addTag(map, 'game', confidence - 0.05, source)
    addTag(map, 'boss-fight', confidence - 0.08, source)
  }
}

/**
 * Heuristic tags from title / artist / album (shared by browser import + CLI enrich).
 * @param {{ title?: string, artist?: string, album?: string }} track
 * @returns {TagHit[]}
 */
export function inferTags(track) {
  /** @type {Map<string, TagHit>} */
  const map = new Map()
  const artist = norm(track.artist)
  const title = norm(track.title)
  const album = norm(track.album)
  const combined = `${artist} ${title} ${album}`

  inferFromText(map, album, 'filename', 0.68)
  inferFromText(map, combined, 'heuristic', 0.62)

  for (const a of K_POP_SOLO) {
    if (artistMatches(artist, title, a)) {
      addTag(map, 'k-pop', 0.82, 'heuristic')
      addTag(map, 'k-pop-solo', 0.85, 'heuristic')
      addTag(map, 'girl-crush', 0.78, 'heuristic')
      addTag(map, 'baddie', 0.75, 'heuristic')
      addTag(map, 'confident', 0.7, 'heuristic')
      addTag(map, 'club', 0.65, 'heuristic')
      addTag(map, 'gym', 0.6, 'heuristic')
      addTag(map, 'lang-ko', 0.7, 'heuristic')
    }
  }

  for (const g of K_POP_GROUPS) {
    if (artistMatches(artist, album, g) || textHasToken(album, g)) {
      addTag(map, 'k-pop', 0.85, 'heuristic')
      addTag(map, 'girl-group', 0.82, 'heuristic')
      addTag(map, 'girl-crush', 0.8, 'heuristic')
      addTag(map, 'baddie', 0.72, 'heuristic')
      addTag(map, 'lang-ko', 0.65, 'heuristic')
    }
  }

  for (const w of WESTERN_POP_CLUB) {
    if (artistMatches(artist, title, w)) {
      addTag(map, 'pop', 0.85, 'heuristic')
      addTag(map, 'dance-pop', 0.82, 'heuristic')
      addTag(map, 'club', 0.75, 'heuristic')
      addTag(map, 'playlist-continue-good', 0.7, 'heuristic')
      addTag(map, 'homepage-safe', 0.68, 'heuristic')
      addTag(map, 'lang-en', 0.8, 'heuristic')
    }
  }

  for (const e of EDM) {
    if (artistMatches(artist, title, e) || textHasToken(combined, e)) {
      addTag(map, 'edm', 0.88, 'heuristic')
      addTag(map, 'euphoric', 0.8, 'heuristic')
      addTag(map, 'gym', 0.72, 'heuristic')
      addTag(map, 'transition-safe', 0.65, 'heuristic')
    }
  }

  for (const d of DRAMATIC_POP) {
    if (artistMatches(artist, title, d)) {
      addTag(map, 'pop', 0.82, 'heuristic')
      addTag(map, 'dramatic', 0.78, 'heuristic')
      addTag(map, 'confident', 0.7, 'heuristic')
    }
  }

  for (const q of QUIRKY_RAP) {
    if (artistMatches(artist, title, q)) {
      addTag(map, 'hip-hop', 0.8, 'heuristic')
      addTag(map, 'quirky', 0.85, 'heuristic')
      addTag(map, 'meme', 0.7, 'heuristic')
      addTag(map, 'playful', 0.75, 'heuristic')
    }
  }

  if (/remix|mix|edit/i.test(combined)) addTag(map, 'remix', 0.75, 'heuristic')
  if (/live/i.test(combined)) addTag(map, 'live', 0.8, 'heuristic')
  if (/sped|speed up/i.test(combined)) addTag(map, 'sped-up', 0.85, 'heuristic')
  if (/slowed|slow version/i.test(combined)) addTag(map, 'slowed', 0.85, 'heuristic')
  if (/instrumental|karaoke|off vocal/i.test(combined)) addTag(map, 'instrumental', 0.85, 'heuristic')

  if (map.size === 0) {
    addTag(map, 'pop', 0.55, 'heuristic')
    addTag(map, 'needs-review', 0.9, 'heuristic')
  } else {
    addTag(map, 'playlist-continue-good', 0.62, 'heuristic')
    addTag(map, 'transition-safe', 0.58, 'heuristic')
  }

  return [...map.values()].filter((t) => t.confidence >= 0.55)
}

/**
 * @param {{ bitrate_kbps?: number | null, codec?: string | null, title?: string | null, artist?: string | null }} [probe]
 * @param {number} sizeBytes
 * @param {number} durationSec
 * @param {{ title?: string, artist?: string }} [trackMeta]
 */
export function qualityFromProbe(probe, sizeBytes, durationSec, trackMeta) {
  const bitrate =
    probe?.bitrate_kbps ??
    (durationSec > 0 ? Math.round((sizeBytes * 8) / durationSec / 1000) : null)
  let sourceQuality = 'standard-quality'
  let qualityTag = 'standard-quality'
  if (bitrate != null) {
    if (bitrate >= 256) {
      sourceQuality = probe?.codec === 'flac' ? 'lossless' : 'high-compressed'
      qualityTag = sourceQuality
    } else if (bitrate < 128) {
      sourceQuality = 'low-quality'
      qualityTag = 'low-quality'
    }
  }
  const hasMeta = Boolean(
    String(probe?.title || probe?.artist || trackMeta?.title || trackMeta?.artist || '').trim(),
  )
  if (!hasMeta) {
    qualityTag = 'bad-metadata'
  }
  return { bitrate_kbps: bitrate, sourceQuality, qualityTag }
}

/** @param {TagHit[]} tags @param {{ duration_sec?: number }} [probe] */
export function audioFromVibes(tags, probe) {
  const vibeSet = new Set(tags.map((t) => t.slug))
  let energy = 3
  let danceability = 3
  let valence = 3

  if (vibeSet.has('gym') || vibeSet.has('edm') || vibeSet.has('club')) {
    energy = 5
    danceability = 5
    valence = 4
  } else if (vibeSet.has('baddie') || vibeSet.has('girl-crush')) {
    energy = 4
    danceability = 4
    valence = 3
  } else if (vibeSet.has('quirky') || vibeSet.has('meme')) {
    energy = 4
    danceability = 3
    valence = 4
  } else if (vibeSet.has('night-drive') || vibeSet.has('sexy')) {
    energy = 3
    danceability = 3
    valence = 2
  } else if (vibeSet.has('cute') || vibeSet.has('soft')) {
    energy = 2
    danceability = 3
    valence = 4
  }

  if (probe?.duration_sec && probe.duration_sec < 90) {
    energy = Math.min(5, energy + 1)
  }

  return {
    bpm: probe?.bpm ?? null,
    energy,
    danceability,
    valence,
    vocal_presence: vibeSet.has('instrumental') ? 1 : 4,
    analyzed_at: new Date().toISOString(),
  }
}

/** @param {TagHit[]} tags */
export function taggingStatusFromTags(tags) {
  const avgConf = tags.length
    ? tags.reduce((s, t) => s + t.confidence, 0) / tags.length
    : 0
  const hasNeedsReview = tags.some((t) => t.slug === 'needs-review')
  let taggingStatus = 'partial'
  if (avgConf >= 0.7 && !hasNeedsReview) taggingStatus = 'ready'
  else if (avgConf < 0.55) taggingStatus = 'needs_review'
  return { taggingStatus, tagConfidenceAvg: Number(avgConf.toFixed(3)) }
}

/** @param {TagHit[]} tags */
export function versionFlagsFromTags(tags) {
  const slugs = new Set(tags.map((t) => t.slug))
  return {
    version_type: slugs.has('remix')
      ? 'remix'
      : slugs.has('live')
        ? 'live'
        : 'original',
    is_live: slugs.has('live'),
    is_remix: slugs.has('remix'),
    is_cover: slugs.has('cover'),
  }
}
