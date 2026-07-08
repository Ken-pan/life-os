/**
 * Spatial Studio — internal-only floor plan editing + furniture layers.
 * Public deploy: off by default. Enable via `?studio=1` (persisted) or local `npm run dev`.
 */
import { browser } from '$app/environment'
import { persist, S } from './state.svelte.js'

/** @returns {boolean} */
export function isSpatialStudioEnabled() {
  if (S.settings.spatialStudio === false) return false
  if (S.settings.spatialStudio === true) return true
  return import.meta.env.DEV
}

/**
 * Apply `?studio=1` / `?studio=0` from URL (call once per navigation in root layout).
 * @param {URLSearchParams} searchParams
 */
export function syncSpatialStudioFromUrl(searchParams) {
  if (!browser) return
  const flag = searchParams.get('studio')
  if (flag === '1') {
    S.settings.spatialStudio = true
    persist()
  } else if (flag === '0') {
    S.settings.spatialStudio = false
    persist()
  }
}

/** @param {boolean} enabled */
export function setSpatialStudioEnabled(enabled) {
  S.settings.spatialStudio = enabled
  persist()
}
