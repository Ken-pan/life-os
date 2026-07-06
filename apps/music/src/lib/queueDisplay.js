/** @typedef {import('./types.js').Track} Track */
/** @typedef {{ track: Track; i: number; wrapAround?: boolean }} QueueDisplayEntry */

/** Fisher–Yates shuffle (returns new array). */
export function shuffleCopy(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Indices of tracks that will play after the current one (matches sequential playback).
 * @param {{ index: number; repeat: import('./types.js').RepeatMode; length: number }}
 */
export function getUpNextIndices({ index, repeat, length }) {
  if (length <= 0) return []
  /** @type {Array<{ index: number; wrapAround: boolean }>} */
  const out = []
  for (let i = index + 1; i < length; i++) {
    out.push({ index: i, wrapAround: false })
  }
  if (!out.length && repeat === 'all' && length > 1) {
    out.push({ index: 0, wrapAround: true })
  }
  return out
}

/**
 * @param {Track[]} queue
 * @param {number} index
 * @param {import('./types.js').RepeatMode} repeat
 * @returns {QueueDisplayEntry[]}
 */
export function buildUpNextEntries(queue, index, repeat) {
  return getUpNextIndices({ index, repeat, length: queue.length }).map(
    ({ index: i, wrapAround }) => ({
      track: queue[i],
      i,
      wrapAround,
    }),
  )
}

/**
 * @param {number} i
 * @param {number} index
 * @param {import('./types.js').RepeatMode} repeat
 * @param {number} length
 */
export function isFirstUpNextRow(i, index, repeat, length) {
  const upNext = getUpNextIndices({ index, repeat, length })
  return upNext.length > 0 && i === upNext[0].index
}

/** @param {number} i @param {number} index */
export function isFirstHistoryRow(i, index) {
  return index > 0 && i === 0
}

/**
 * Full queue rows for list UI (history → current → up next in queue order).
 * @param {Track[]} queue
 * @param {number} index
 * @param {import('./types.js').RepeatMode} repeat
 * @param {{ upNextOnly?: boolean }} [opts]
 * @returns {QueueDisplayEntry[]}
 */
export function buildQueueDisplayEntries(queue, index, repeat, opts = {}) {
  if (opts.upNextOnly) return buildUpNextEntries(queue, index, repeat)
  return queue.map((track, i) => ({ track, i }))
}

/** True when up-next rows can be drag-reordered without corrupting the queue. */
export function canReorderUpNextEntries(entries, index) {
  return entries.some(({ i, wrapAround }) => i > index && !wrapAround)
}
