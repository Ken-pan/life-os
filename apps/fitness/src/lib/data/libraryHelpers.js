import { LIBRARY } from './library.js';
import { localizeLibraryEntry } from '../i18n/libraryLabels.js';
import { t } from '../i18n/index.js';

/** @typedef {{ id: string; label: string; match: (tag: string) => boolean }} LibraryFilterCategory */

/** Broader filter chips mapped from entry `tag` strings (e.g. "容量 · 有效组" → 容量). */
/** @type {LibraryFilterCategory[]} */
export const LIBRARY_FILTER_CATEGORIES = [
  { id: 'volume', label: '容量', match: (tag) => /容量/.test(tag) },
  { id: 'intensity', label: '强度', match: (tag) => /强度|RIR/.test(tag) },
  { id: 'recovery', label: '恢复', match: (tag) => /恢复|减载|热身/.test(tag) },
  { id: 'progression', label: '渐进', match: (tag) => /渐进|加重/.test(tag) },
  { id: 'nutrition', label: '营养', match: (tag) => /营养/.test(tag) },
  { id: 'movement', label: '动作', match: (tag) => /动作|胸背臂腿/.test(tag) },
  { id: 'periodization', label: '周期', match: (tag) => /周期/.test(tag) },
  { id: 'principles', label: '原则', match: (tag) => /核心原则/.test(tag) },
  { id: 'personal', label: '复盘', match: (tag) => /个性化/.test(tag) }
];

/** @param {string} param URL `tag` value (category id or label) */
export function resolveCategoryId(param) {
  if (!param) return '';
  const lower = param.toLowerCase();
  const byId = LIBRARY_FILTER_CATEGORIES.find((c) => c.id === param || c.id === lower);
  if (byId) return byId.id;
  return LIBRARY_FILTER_CATEGORIES.find((c) => c.label === param || c.label.toLowerCase() === lower)?.id ?? '';
}

/** @param {import('./library.js').LibraryEntry} entry @param {string} categoryId */
export function entryMatchesCategory(entry, categoryId) {
  const cat = LIBRARY_FILTER_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return false;
  const orig = LIBRARY.find((e) => e.id === entry.id) ?? entry;
  const tags = orig.tags?.length ? orig.tags : [orig.tag];
  return tags.some((t) => cat.match(t));
}

/** @param {string} categoryId */
export function countByCategory(categoryId) {
  return LIBRARY.filter((e) => entryMatchesCategory(e, categoryId)).length;
}

/** Categories with non-zero counts, stable order. */
export function getLibraryFilterChips() {
  return LIBRARY_FILTER_CATEGORIES.map((c) => ({ ...c, count: countByCategory(c.id) })).filter(
    (c) => c.count > 0
  );
}

/** @param {string} id */
export function getLibraryEntry(id) {
  const entry = LIBRARY.find((e) => e.id === id) ?? null;
  return localizeLibraryEntry(entry);
}

/** @param {string} tagFragment partial tag match */
export function findByTag(tagFragment) {
  const q = tagFragment.toLowerCase();
  return LIBRARY.find((e) => e.tag.toLowerCase().includes(q)) ?? null;
}

/** @param {string} id */
export function libraryHref(id) {
  return `/library#lib-${id}`;
}

/** Strip HTML and collapse whitespace. @param {string} html */
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Condensed bullet points for contextual sheets.
 * @param {import('./library.js').LibraryEntry} entry
 * @param {number} [maxItems]
 */
export function getKnowledgePreview(entry, maxItems = 4) {
  if (!entry) return [];

  const bullets = [];

  if (entry.html) {
    for (const m of entry.html.matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi)) {
      const text = stripHtml(m[1]);
      if (text) bullets.push(text);
      if (bullets.length >= maxItems) return bullets;
    }
    if (bullets.length === 0) {
      const p = entry.html.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i);
      if (p) bullets.push(stripHtml(p[1]));
    }
  }

  if (bullets.length < maxItems && entry.rules?.length > 1) {
    for (const row of entry.rules.slice(1)) {
      bullets.push(`${row[0]}${t('knowledge.ruleSep')}${stripHtml(row[1])}`);
      if (bullets.length >= maxItems) break;
    }
  }

  if (bullets.length < maxItems && entry.table?.length > 1) {
    bullets.push(t('knowledge.previewRef', { cols: entry.table[0].slice(1).join(' / ') }));
  }

  return bullets.slice(0, maxItems);
}

/** @type {Record<string, string[]>} */
const DAY_RECOMMENDATIONS = {
  chest: ['volume-landmarks', 'effective-sets', 'exercise-quality', 'rir', 'progressive-overload', 'compound-isolation'],
  back: ['volume-landmarks', 'indirect-volume', 'exercise-quality', 'progressive-overload', 'compound-isolation'],
  arms: ['rep-ranges', 'exercise-order', 'tempo-control', 'rir', 'double-progression', 'training-failure'],
  legs: ['volume-landmarks', 'cardio-hypertrophy', 'rest-intervals', 'progressive-overload', 'warmup', 'joint-pain'],
  delts: ['volume-landmarks', 'exercise-quality', 'rir', 'tempo-control', 'indirect-volume', 'compound-isolation'],
  core: ['volume-landmarks', 'exercise-quality', 'rir', 'tempo-control'],
  upper_a: ['frequency', 'effective-sets', 'daily-readiness', 'rotation', 'compound-isolation'],
  upper_b: ['frequency', 'effective-sets', 'daily-readiness', 'rotation', 'compound-isolation'],
  legs_a: ['volume-landmarks', 'rest-intervals', 'warmup', 'joint-pain', 'cardio-hypertrophy'],
  legs_b: ['volume-landmarks', 'rest-intervals', 'warmup', 'joint-pain', 'cardio-hypertrophy']
};

const GENERIC_FALLBACK = ['frequency', 'effective-sets', 'daily-readiness', 'weekly-review', 'deload', 'rotation', 'mesocycle'];

/**
 * Contextual library picks for home carousel.
 * @param {{ dayId: string; limit?: number; offset?: number }} opts
 */
export function getRecommendedEntries({ dayId, limit = 3, offset = 0 }) {
  const primary = DAY_RECOMMENDATIONS[dayId] ?? GENERIC_FALLBACK;
  const pool = [
    ...primary,
    ...GENERIC_FALLBACK.filter((id) => !primary.includes(id))
  ];
  const start = pool.length ? offset % pool.length : 0;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated
    .slice(0, limit)
    .map((id) => getLibraryEntry(id))
    .filter(Boolean);
}

/**
 * One-line teaser for carousel cards.
 * @param {import('./library.js').LibraryEntry | null | undefined} entry
 * @param {number} [maxLen]
 */
export function getKnowledgeTeaser(entry, maxLen = 88) {
  if (!entry) return '';
  const candidates = getKnowledgePreview(entry, 3);
  const line =
    candidates.length > 0
      ? [...candidates].sort((a, b) => a.length - b.length)[0]
      : '';
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1)}…`;
}
