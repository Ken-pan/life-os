/**
 * Client-side search scoring — exact > prefix > contains > fuzzy.
 * Field weights follow common relevance patterns (title > artist > album).
 */

/** @param {string} a @param {string} b */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  /** @type {number[]} */
  const row = [];
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

/** @param {string} text @param {string} token */
export function scoreTokenMatch(text, token) {
  const t = (text || '').toLowerCase().trim();
  const q = token.toLowerCase().trim();
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 82;
  if (t.includes(q)) return 62;

  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 48 + Math.min(10, (q.length / Math.max(t.length, 1)) * 10);

  if (q.length >= 2 && t.length <= 48) {
    const dist = levenshtein(t, q);
    const maxLen = Math.max(t.length, q.length);
    const sim = 1 - dist / maxLen;
    if (sim >= 0.72) return Math.round(sim * 42);
  }
  return 0;
}

/** @param {string} query */
export function tokenizeQuery(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * @param {string} text
 * @param {string} query
 * @param {number} [weight=1]
 */
export function scoreField(text, query, weight = 1) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return 0;
  let best = 0;
  for (const token of tokens) {
    best = Math.max(best, scoreTokenMatch(text, token));
  }
  return best * weight;
}

/**
 * @param {import('./types.js').Track} track
 * @param {string} query
 */
export function scoreTrack(track, query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return 0;

  let score = 0;
  score += scoreField(track.title, query, 3);
  score += scoreField(track.artist, query, 2);
  score += scoreField(track.album, query, 1.5);

  for (const token of tokens) {
    for (const w of track.words || []) {
      score += scoreTokenMatch(w, token) * 0.35;
    }
  }

  const allTokensMatch = tokens.every(
    (token) =>
      scoreTokenMatch(track.title, token) > 0 ||
      scoreTokenMatch(track.artist, token) > 0 ||
      scoreTokenMatch(track.album, token) > 0 ||
      (track.words || []).some((w) => scoreTokenMatch(w, token) > 0)
  );
  if (allTokensMatch && tokens.length > 1) score += 12;

  score += Math.min((track.playCount || 0) * 0.4, 12);
  if (track.liked) score += 2;
  return score;
}

/**
 * @param {import('./types.js').Track} track
 * @param {string} query
 * @param {number} [minScore=18]
 */
export function trackMatchesQuery(track, query, minScore = 18) {
  return scoreTrack(track, query) >= minScore;
}

/** @param {string} text @param {string} query */
export function highlightParts(text, query) {
  const raw = text || '';
  const tokens = tokenizeQuery(query).sort((a, b) => b.length - a.length);
  if (!tokens.length || !raw) return [{ text: raw, match: false }];

  /** @type {{ start: number; end: number }[]} */
  const spans = [];
  const lower = raw.toLowerCase();
  for (const token of tokens) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(token, from);
      if (idx < 0) break;
      spans.push({ start: idx, end: idx + token.length });
      from = idx + token.length;
    }
  }
  if (!spans.length) return [{ text: raw, match: false }];

  spans.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
  /** @type {{ start: number; end: number }[]} */
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (!last || span.start >= last.end) merged.push({ ...span });
    else last.end = Math.max(last.end, span.end);
  }

  /** @type {{ text: string; match: boolean }[]} */
  const parts = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start > cursor) parts.push({ text: raw.slice(cursor, span.start), match: false });
    parts.push({ text: raw.slice(span.start, span.end), match: true });
    cursor = span.end;
  }
  if (cursor < raw.length) parts.push({ text: raw.slice(cursor), match: false });
  return parts;
}

/** @param {string} query @param {string[]} candidates */
export function suggestAlternatives(query, candidates) {
  const trimmed = query.trim();
  if (!trimmed || !candidates.length) return [];

  /** @type {{ term: string; score: number }[]} */
  const ranked = [];
  for (const term of candidates) {
    const score = scoreField(term, trimmed, 1);
    if (score > 0) ranked.push({ term, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, 4).map((r) => r.term);
}
