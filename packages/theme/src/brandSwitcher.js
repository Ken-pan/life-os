import { getLifeOsBrand } from './brand.js'

/** @typedef {import('./siteMeta.js').LifeOsAppId} LifeOsAppId */
/** @typedef {{ id: LifeOsAppId; experimental?: boolean }} LifeOsSwitcherEntry */

/**
 * @param {LifeOsSwitcherEntry[]} apps
 * @param {string} query
 */
export function filterLifeOsSwitcherApps(apps, query) {
  const q = query.trim().toLowerCase()
  if (!q) return apps

  return apps.filter((entry) => {
    const brand = getLifeOsBrand(entry.id)
    const haystack = [
      entry.id,
      brand.fullName,
      brand.wordmarkBase,
      brand.wordmarkAccent,
      entry.experimental ? 'beta experimental' : '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

/**
 * @param {LifeOsSwitcherEntry[]} apps
 * @param {string} query
 */
export function findSwitcherTypeAheadIndex(apps, query) {
  const q = query.trim().toLowerCase()
  if (!q) return -1
  return apps.findIndex((entry) => {
    const brand = getLifeOsBrand(entry.id)
    return (
      entry.id.startsWith(q) ||
      brand.wordmarkBase.toLowerCase().startsWith(q) ||
      brand.fullName.toLowerCase().startsWith(q)
    )
  })
}
