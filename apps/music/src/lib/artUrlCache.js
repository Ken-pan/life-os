/** @type {Map<string, string>} */
const objectUrlByKey = new Map()
const MAX_OBJECT_URLS = 512

function trimObjectUrlCache() {
  while (objectUrlByKey.size > MAX_OBJECT_URLS) {
    const oldestKey = objectUrlByKey.keys().next().value
    if (!oldestKey) return
    revokeObjectUrlKey(oldestKey)
  }
}

/** @param {string} key @param {Blob} blob */
export function objectUrlForBlob(key, blob) {
  const cached = objectUrlByKey.get(key)
  if (cached) {
    objectUrlByKey.delete(key)
    objectUrlByKey.set(key, cached)
    return cached
  }
  const url = URL.createObjectURL(blob)
  objectUrlByKey.set(key, url)
  trimObjectUrlCache()
  return url
}

/** @param {string} key */
export function revokeObjectUrlKey(key) {
  const url = objectUrlByKey.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrlByKey.delete(key)
  }
}

/**
 * Persistent object URLs for local track audio blobs, keyed by the track's
 * content-hash id. Not LRU-evicted: a track id maps to identical bytes forever,
 * and the currently-playing element holds a live reference we must never revoke
 * out from under it. Deduping to one URL per id turns the previous unbounded
 * leak (a fresh URL on every db read / library render) into O(library size).
 * @type {Map<string, string>}
 */
const audioObjectUrlById = new Map()

/** @param {string} trackId @param {Blob} blob @returns {string} */
export function localAudioObjectUrl(trackId, blob) {
  const cached = audioObjectUrlById.get(trackId)
  if (cached) return cached
  const url = URL.createObjectURL(blob)
  audioObjectUrlById.set(trackId, url)
  return url
}

/** @param {string} trackId */
export function revokeLocalAudioObjectUrl(trackId) {
  const url = audioObjectUrlById.get(trackId)
  if (url) {
    URL.revokeObjectURL(url)
    audioObjectUrlById.delete(trackId)
  }
}
