/**
 * Spatial editing — always available (browse + edit only in UI).
 * Legacy `spatialStudio` setting is ignored.
 */

/** @returns {boolean} */
export function isSpatialStudioEnabled() {
  return true
}

/** @param {URLSearchParams} _searchParams */
export function syncSpatialStudioFromUrl(_searchParams) {}

/** @param {boolean} _enabled */
export function setSpatialStudioEnabled(_enabled) {}
