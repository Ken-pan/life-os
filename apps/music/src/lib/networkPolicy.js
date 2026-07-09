import { browser } from '$app/environment'

/** @typedef {'none' | 'range' | 'full'} WarmByteMode */

/** @returns {{ saveData?: boolean, effectiveType?: string, downlink?: number } | undefined} */
export function getNetworkConnection() {
  if (!browser) return undefined
  try {
    return /** @type {{ saveData?: boolean, effectiveType?: string, downlink?: number } | undefined} */ (
      navigator.connection ||
        // @ts-expect-error vendor-prefixed
        navigator.mozConnection ||
        // @ts-expect-error vendor-prefixed
        navigator.webkitConnection
    )
  } catch {
    return undefined
  }
}

/**
 * Cap prefetch volume on Save-Data / slow cellular.
 * @param {number} limit
 * @returns {number}
 */
export function getPrefetchLimit(limit) {
  const conn = getNetworkConnection()
  if (conn?.saveData) return 0
  const type = conn?.effectiveType || ''
  if (type === 'slow-2g' || type === '2g') return Math.min(limit, 4)
  if (type === '3g') return Math.min(limit, 8)
  return limit
}

/**
 * Whether background IndexedDB audio caching is allowed.
 * @returns {boolean}
 */
export function shouldCacheAudioToIndexedDB() {
  const conn = getNetworkConnection()
  if (conn?.saveData) return false
  const type = conn?.effectiveType || ''
  return type !== 'slow-2g' && type !== '2g'
}

/**
 * SW / fetch warm strategy for audio bytes.
 * @returns {WarmByteMode}
 */
export function getWarmByteMode() {
  const conn = getNetworkConnection()
  if (conn?.saveData) return 'none'
  const type = conn?.effectiveType || ''
  if (type === 'slow-2g' || type === '2g') return 'range'
  if (type === '3g') return 'range'
  return 'full'
}

/** First-chunk size for range warm (512 KiB). */
export const RANGE_WARM_BYTES = 512 * 1024
