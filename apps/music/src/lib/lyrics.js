/**
 * @typedef {{ time: number, text: string }} LyricLine
 * @typedef {{ timed: boolean, lines: LyricLine[] }} LyricsModel
 */

const LRC_LINE = /^\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\](.*)$/;

/** @param {string} [raw] @returns {LyricsModel} */
export function parseLyrics(raw) {
  const text = (raw || '').trim();
  if (!text) return { timed: false, lines: [] };

  /** @type {LyricLine[]} */
  const timed = [];
  /** @type {string[]} */
  const plain = [];

  for (const row of text.split(/\r?\n/)) {
    const line = row.trim();
    if (!line) continue;
    const m = line.match(LRC_LINE);
    if (m) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      const body = m[4].trim();
      if (!body) continue;
      timed.push({ time: min * 60 + sec + frac / 1000, text: body });
      continue;
    }
    if (!/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(line)) {
      plain.push(line.replace(/^\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]\s*/, ''));
    }
  }

  if (timed.length >= 2) {
    timed.sort((a, b) => a.time - b.time);
    return { timed: true, lines: timed };
  }

  const fallback = plain.length ? plain : timed.map((l) => l.text);
  return {
    timed: false,
    lines: fallback.filter(Boolean).map((text) => ({ time: 0, text }))
  };
}

/** Active line index for timed lyrics; -1 when not timed or before first line. */
/** @param {LyricsModel} model @param {number} currentTime */
export function activeLyricIndex(model, currentTime) {
  if (!model.timed || !model.lines.length) return -1;
  const t = Number.isFinite(currentTime) ? currentTime : 0;
  let idx = -1;
  for (let i = 0; i < model.lines.length; i++) {
    if (model.lines[i].time <= t + 0.05) idx = i;
    else break;
  }
  return idx;
}

/** Normalize names for LRC ↔ track matching. */
/** @param {string} name */
export function lyricsMatchKey(name) {
  return (name || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '')
    .trim();
}
