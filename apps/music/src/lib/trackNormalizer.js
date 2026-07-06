const TRACK_SUFFIXES = [
  ' - YouTube Music',
  ' | YouTube Music',
  'YouTube Music',
  ' - Topic',
  ' | Topic',
  'Official Audio',
  'Official Video'
];

const ARTIST_SUFFIXES = [' - Topic', ' | Topic'];

const ARTIST_DELIMITERS = [
  ' feat. ',
  ' feat ',
  ' ft. ',
  ' ft ',
  ', ',
  ' & ',
  ' / ',
  ' and ',
  ' with ',
  ' featuring '
];

/** @param {string} s */
function collapseSpaces(s) {
  return s.replace(/\s{2,}/g, ' ').trim();
}

/** @param {string} s */
export function normalizeTrack(s) {
  let t = s || '';
  for (const suffix of TRACK_SUFFIXES) {
    const idx = t.toLowerCase().indexOf(suffix.toLowerCase());
    if (idx >= 0) t = t.slice(0, idx) + t.slice(idx + suffix.length);
  }
  return collapseSpaces(t);
}

/** @param {string} s */
export function normalizeArtist(s) {
  let t = (s || '')
    .replace(/\s+ft\.\s+/gi, ' feat. ')
    .replace(/\s+ft\s+/gi, ' feat. ')
    .replace(/\s+x\s+/gi, ' ');
  for (const suffix of ARTIST_SUFFIXES) {
    const idx = t.toLowerCase().indexOf(suffix.toLowerCase());
    if (idx >= 0) t = t.slice(0, idx) + t.slice(idx + suffix.length);
  }
  return collapseSpaces(t);
}

/** @param {string} s */
export function normalizeTrackForSearch(s) {
  let t = normalizeTrack(s);
  t = t.replace(/\s*\([^)]*\)/g, '');
  t = t.replace(/\s*\[[^\]]*\]/g, '');
  t = t.replace(
    /\s+-\s+(?:Remaster(?:ed)?|Deluxe|Live|Bonus|Radio Edit|Acoustic|Demo|Remix|Single|Extended|Instrumental|Anniversary|Edition|Version|Sped Up|Slowed).*$/i,
    ''
  );
  t = t.replace(/\s+(?:feat\.?|featuring|ft\.?)\s+.*$/i, '');
  const result = collapseSpaces(t);
  return result || normalizeTrack(s);
}

/** @param {string} s */
export function primaryArtist(s) {
  const normalized = normalizeArtist(s);
  let result = normalized;
  for (const delimiter of ARTIST_DELIMITERS) {
    const idx = result.toLowerCase().indexOf(delimiter.toLowerCase());
    if (idx >= 0) result = result.slice(0, idx);
  }
  const trimmed = result.trim();
  return trimmed || normalized;
}

/** @param {string} a @param {string} b */
export function similarity(a, b) {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  if (!la || !lb) return 0;
  if (la.includes(lb) || lb.includes(la)) return 0.85;

  const bigramsA = new Set(bigrams(la));
  const bigramsB = new Set(bigrams(lb));
  if (!bigramsA.size && !bigramsB.size) return 0;
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection += 1;
  }
  const union = bigramsA.size + bigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** @param {string} s */
function bigrams(s) {
  if (s.length < 2) return [s];
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** @param {string} s */
function splitArtists(s) {
  const parts = s.split(/(?:\s*(?:feat\.?|ft\.?|featuring|&|,|\/|;|and|with|×|x)\s*)/i);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** @param {string} candidate @param {string} query */
export function bestArtistMatch(candidate, query) {
  const queryParts = splitArtists(query);
  const candidateParts = splitArtists(candidate);
  let best = 0;
  for (const q of queryParts) {
    for (const c of candidateParts) {
      best = Math.max(best, similarity(q, c));
    }
  }
  return Math.max(best, similarity(candidate, query));
}

/** @param {string} trackName @param {string} artistName */
export function lyricsCacheKey(trackName, artistName) {
  return `${normalizeTrack(trackName)}\t${normalizeArtist(artistName)}`;
}
