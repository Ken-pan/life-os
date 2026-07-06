/** @type {Map<string, string>} */
const objectUrlByKey = new Map()

/** @param {string} key @param {Blob} blob */
export function objectUrlForBlob(key, blob) {
  const cached = objectUrlByKey.get(key)
  if (cached) return cached
  const url = URL.createObjectURL(blob)
  objectUrlByKey.set(key, url)
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
