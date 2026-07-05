/** @typedef {'straight'|'ascending'|'descending'|'pyramid'|'reverse_pyramid'|'drop'|'superset'} SetSchemeId */

import { t } from '../i18n/index.js';

/** @type {Record<SetSchemeId, { id: SetSchemeId }>} */
export const SET_SCHEMES = {
  straight: { id: 'straight' },
  ascending: { id: 'ascending' },
  descending: { id: 'descending' },
  pyramid: { id: 'pyramid' },
  reverse_pyramid: { id: 'reverse_pyramid' },
  drop: { id: 'drop' },
  superset: { id: 'superset' }
};

/** @type {SetSchemeId[]} */
export const SCHEME_OPTIONS = [
  'straight',
  'ascending',
  'descending',
  'pyramid',
  'reverse_pyramid',
  'drop',
  'superset'
];

/** @type {{ labelKey: string, schemes: SetSchemeId[] }[]} */
export const SCHEME_GROUPS = [
  { labelKey: 'groupBasic', schemes: ['straight'] },
  { labelKey: 'groupAdvanced', schemes: ['ascending', 'descending', 'pyramid', 'reverse_pyramid'] },
  { labelKey: 'groupExpert', schemes: ['drop', 'superset'] }
];

/** @param {string | undefined | null} schemeId */
export function schemeMeta(schemeId) {
  const id = /** @type {SetSchemeId} */ (schemeId && SET_SCHEMES[schemeId] ? schemeId : 'straight');
  const hint = t(`schemes.${id}.hint`);
  return {
    id,
    label: t(`schemes.${id}.label`),
    short: t(`schemes.${id}.short`),
    description: t(`schemes.${id}.description`),
    hint: hint ? hint : null
  };
}

/** @param {string | undefined | null} schemeId */
export function schemeLabel(schemeId) {
  if (!schemeId || schemeId === 'straight') return null;
  return schemeMeta(schemeId).short;
}

/**
 * @param {{ scheme?: string, pairWith?: string, name?: string }} ex
 * @param {{ id: string, name: string }[]} [dayExercises]
 * @returns {string | null}
 */
export function schemeCoachHint(ex, dayExercises = []) {
  const scheme = ex.scheme || 'straight';
  if (scheme === 'straight') return null;

  if (scheme === 'superset') {
    const pairId = ex.pairWith;
    if (!pairId) return t('schemes.supersetNoPair');
    const inDay = dayExercises.find((e) => e.id === pairId);
    if (!inDay) return t('schemes.supersetMissing');
    return t('schemes.supersetWith', { name: inDay.name });
  }

  return schemeMeta(scheme).hint;
}
