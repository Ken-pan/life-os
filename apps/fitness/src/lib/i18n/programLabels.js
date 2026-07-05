/**
 * Training-day display labels (i18n).
 *
 * Data model (program.js `days[id]`):
 * - `cn`   — Primary label, localized via program-en.js in English ("Chest", "Back").
 * - `name` — Decorative English caps (CHEST, BACK). Never translated; zh UI accent only.
 *
 * Always use the helpers below instead of reading `cn` + `name` together in templates.
 */
import { S } from '../state.svelte.js';
import { resolveLocale } from './index.js';
import programEn from './messages/program-en.js';
import { localizeExercise } from './exerciseLabels.js';

function isEn() {
  return resolveLocale(S.settings.locale) === 'en';
}

/** Primary localized day label (cn in zh, program-en.cn in en). */
export function dayDisplayName(day) {
  if (!day) return '';
  return day.cn ?? day.name ?? '';
}

/**
 * Decorative English caps from `day.name` — zh UI only (e.g. CHEST under 胸).
 * Returns null in English so templates skip the secondary line.
 */
export function dayDecorEn(day) {
  if (!day || isEn()) return null;
  return day.name ?? null;
}

/** @deprecated Use dayDecorEn — kept for readability at call sites. */
export function dayDisplaySub(day) {
  return dayDecorEn(day);
}

/** Card/list title: "胸 · CHEST" (zh) or "Chest" (en). */
export function dayDisplayFull(day) {
  if (!day) return '';
  if (isEn()) return dayDisplayName(day);
  const decor = dayDecorEn(day);
  return decor ? `${day.cn ?? ''} · ${decor}` : dayDisplayName(day);
}

/** @param {string} dayId @param {{ cn?: string } | null | undefined} [day] */
export function dayCn(dayId, day) {
  if (resolveLocale(S.settings.locale) === 'zh') {
    return day?.cn ?? dayId;
  }
  return programEn.days[dayId]?.cn ?? day?.cn ?? dayId;
}

/** @param {object | null | undefined} day @param {string} [dayId] */
export function localizeDay(day, dayId) {
  if (!day) return day;
  const id = dayId ?? day.id;
  if (!id || resolveLocale(S.settings.locale) === 'zh') return day;
  const en = programEn.days[id];
  if (!en) return day;

  const localized = {
    ...day,
    cn: en.cn ?? day.cn,
    subtitle: en.subtitle ?? day.subtitle,
    label: en.label ?? day.label,
    note: en.note ?? day.note,
    vol: en.vol ?? day.vol
    // `name` intentionally not overwritten — stays decorative EN for zh
  };

  if (Array.isArray(day.warmup) && en.warmup) {
    localized.warmup = day.warmup.map((w, i) => ({
      ...w,
      name: en.warmup[i]?.name ?? w.name,
      note: en.warmup[i]?.note ?? w.note
    }));
  }

  if (Array.isArray(day.ex)) {
    localized.ex = day.ex.map((ex) => localizeExercise(ex));
  }

  return localized;
}

/** @param {import('../data/program.js').ProgramDef | { id: string, meta: object, days: Record<string, object>, rotationOrder: string[] }} program */
export function localizeProgram(program) {
  if (!program || resolveLocale(S.settings.locale) === 'zh') return program;
  const metaEn = programEn.programs[program.id];
  const days = {};
  for (const [id, day] of Object.entries(program.days ?? {})) {
    days[id] = localizeDay(day, id);
  }
  return {
    ...program,
    meta: metaEn ? { ...program.meta, ...metaEn } : program.meta,
    days
  };
}

/** @param {{ rotationOrder: string[], days: Record<string, { cn?: string }> }} program */
export function rotationLabel(program) {
  return program.rotationOrder
    .map((id) => dayCn(id, program.days[id]))
    .join(' → ');
}
