import { S } from '../state.svelte.js';
import { EX_BY_ID, resolveExerciseId } from '../data/exercises.js';
import { resolveLocale } from './index.js';
import exercisesEn from './messages/exercises-en.js';
import exercisesCuesEn from './messages/exercises-cues-en.js';

/** @param {string | undefined} val */
function localizeRepsField(val) {
  if (!val || resolveLocale(S.settings.locale) === 'zh') return val;
  return String(val)
    .replace(/\/侧/g, '/side')
    .replace(/\/腿/g, '/leg')
    .replace(/静控/g, 'static')
    .replace(/慢控/g, 'slow');
}

/** @param {string | { id?: string, name?: string } | null | undefined} exOrId */
export function exerciseName(exOrId) {
  const id =
    typeof exOrId === 'string'
      ? resolveExerciseId(exOrId)
      : exOrId?.id
        ? resolveExerciseId(exOrId.id)
        : null;
  if (!id) {
    return typeof exOrId === 'object' && exOrId?.name ? exOrId.name : typeof exOrId === 'string' ? exOrId : '';
  }
  if (resolveLocale(S.settings.locale) === 'zh') {
    return (typeof exOrId === 'object' && exOrId?.name) || EX_BY_ID[id]?.name || id;
  }
  return exercisesEn[id]?.name || EX_BY_ID[id]?.name || id;
}

/** @param {string | { id?: string, m?: string } | null | undefined} exOrId */
export function exerciseMuscle(exOrId) {
  const id =
    typeof exOrId === 'string'
      ? resolveExerciseId(exOrId)
      : exOrId?.id
        ? resolveExerciseId(exOrId.id)
        : null;
  if (!id) {
    return typeof exOrId === 'object' && exOrId?.m ? exOrId.m : '';
  }
  if (resolveLocale(S.settings.locale) === 'zh') {
    return (typeof exOrId === 'object' && exOrId?.m) || EX_BY_ID[id]?.m || '';
  }
  return exercisesEn[id]?.m || EX_BY_ID[id]?.m || '';
}

/**
 * Return a shallow copy with localized name / muscle / alternatives for display.
 * @template {Record<string, unknown>} T
 * @param {T | null | undefined} ex
 */
export function localizeExercise(ex) {
  if (!ex) return ex;
  if (resolveLocale(S.settings.locale) === 'zh') return ex;
  /** @type {any} */
  const localized = {
    ...ex,
    name: exerciseName(ex),
    m: exerciseMuscle(ex)
  };
  if (Array.isArray(ex.alternatives)) {
    localized.alternatives = ex.alternatives.map((alt) => ({
      ...alt,
      name: exerciseName(alt.id) || alt.name
    }));
  }
  if (ex.sub) {
    const id = ex.id ? resolveExerciseId(ex.id) : null;
    const enSub = id && exercisesEn[id]?.sub;
    if (enSub) localized.sub = enSub;
  }
  if (Array.isArray(ex.cues)) {
    const id = ex.id ? resolveExerciseId(ex.id) : null;
    const enCues = id && exercisesCuesEn[id];
    if (enCues?.length) localized.cues = enCues;
  }
  if (ex.reps) localized.reps = localizeRepsField(ex.reps);
  if (ex.rir) localized.rir = localizeRepsField(ex.rir);
  return localized;
}
