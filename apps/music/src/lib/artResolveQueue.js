import { requestArtForAlbum } from './artResolver.js'

const MAX_CONCURRENT = 3

/** @type {number} */
let active = 0

/** @type {{ meta: { albumKey: string, artist: string, album: string, title?: string }, resolve: (v: string | null) => void, reject: (e: unknown) => void }[]} */
const pending = []

/** @type {Map<string, Promise<string | null>>} */
const inflightByAlbum = new Map()

function drainQueue() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift()
    if (!job) break
    active += 1
    requestArtForAlbum(job.meta)
      .then(job.resolve)
      .catch(job.reject)
      .finally(() => {
        active -= 1
        drainQueue()
      })
  }
}

/**
 * Viewport-gated resolve with global concurrency cap (max 3 iTunes lookups at once).
 * @param {{ albumKey: string, artist: string, album: string, title?: string }} meta
 */
export function enqueueArtResolve(meta) {
  const key = meta.albumKey
  const existing = inflightByAlbum.get(key)
  if (existing) return existing

  const promise = new Promise((resolve, reject) => {
    pending.push({ meta, resolve, reject })
    drainQueue()
  }).finally(() => {
    inflightByAlbum.delete(key)
  })

  inflightByAlbum.set(key, promise)
  return promise
}
