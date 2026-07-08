/** Show all blocks in detail view; filter to one block when `state` is set (embed / matrix). */
export const CATALOG_STATE_ALL = 'all'

/**
 * @param {string | undefined | null} activeState
 * @param {string} blockStateId
 */
export function isCatalogStateVisible(activeState, blockStateId) {
  if (blockStateId.startsWith('detail:')) {
    return !activeState || activeState === CATALOG_STATE_ALL
  }
  if (!activeState || activeState === CATALOG_STATE_ALL) return true
  return activeState === blockStateId
}
