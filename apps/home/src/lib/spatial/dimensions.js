/** @typedef {{ ft: number, in?: number }} FtIn */

/** @param {FtIn} d */
export function toInches(d) {
  return d.ft * 12 + (d.in ?? 0)
}

/** @param {number} totalIn */
export function fromInches(totalIn) {
  const ft = Math.floor(totalIn / 12)
  return { ft, in: Math.round(totalIn - ft * 12) }
}

/** @param {FtIn} d */
export function formatFtIn(d) {
  const inches = d.in ?? 0
  if (inches === 0) return `${d.ft}'`
  return `${d.ft}'${inches}"`
}

/** @param {FtIn} d @param {number} pxPerFt */
export function dimPx(d, pxPerFt) {
  return (toInches(d) / 12) * pxPerFt
}

/** @param {number} px @param {number} pxPerFt @returns {FtIn} */
export function pxToFtIn(px, pxPerFt) {
  return fromInches(Math.round((px / pxPerFt) * 12))
}

/**
 * @param {FtIn} d
 * @param {{ ft?: number, in?: number }} patch
 */
export function patchFtIn(d, patch) {
  const next = { ft: patch.ft ?? d.ft, in: patch.in ?? d.in ?? 0 }
  if (next.in >= 12) {
    next.ft += Math.floor(next.in / 12)
    next.in = next.in % 12
  }
  if (next.in < 0) {
    next.ft -= 1
    next.in += 12
  }
  return next
}

/** @param {number} px @param {number} pxPerFt @param {number} [stepIn] */
export function snapDeltaPx(px, pxPerFt, stepIn = 1) {
  const deltaIn = (px / pxPerFt) * 12
  const snappedIn = Math.round(deltaIn / stepIn) * stepIn
  return (snappedIn / 12) * pxPerFt
}

/** @param {number} deltaPx @param {number} pxPerFt */
export function formatDeltaPx(deltaPx, pxPerFt) {
  const totalIn = Math.round((deltaPx / pxPerFt) * 12)
  if (totalIn === 0) return '±0"'
  const sign = totalIn > 0 ? '+' : '−'
  const abs = Math.abs(totalIn)
  const ft = Math.floor(abs / 12)
  const inch = abs % 12
  if (ft === 0) return `${sign}${inch}"`
  if (inch === 0) return `${sign}${ft}'`
  return `${sign}${ft}'${inch}"`
}
