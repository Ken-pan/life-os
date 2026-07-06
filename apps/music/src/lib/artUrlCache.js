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
