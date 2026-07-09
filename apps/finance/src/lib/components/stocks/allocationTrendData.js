/** @typedef {import('../../../engine/holdingsPortfolio.js').AllocationTrendPoint} AllocationTrendPoint */
/** @typedef {import('../../../types.js').PortfolioAllocationTarget} PortfolioAllocationTarget */

export const CHART_W = 560
export const CHART_H = 150
export const PAD_L = 34
export const PAD_R = 12
export const PAD_T = 10
export const PAD_B = 22

/** @param {number} index @param {number} count */
export function xAt(index, count) {
  if (count <= 1) return PAD_L
  return PAD_L + ((CHART_W - PAD_L - PAD_R) * index) / (count - 1)
}

/** @param {number} pct */
export function yAt(pct) {
  const clamped = Math.max(0, Math.min(100, pct))
  return PAD_T + (CHART_H - PAD_T - PAD_B) * (1 - clamped / 100)
}

/**
 * @param {AllocationTrendPoint[]} points
 * @param {(p: AllocationTrendPoint) => number} pick
 */
export function linePath(points, pick) {
  return points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${xAt(i, points.length).toFixed(1)},${yAt(pick(p)).toFixed(1)}`,
    )
    .join(' ')
}

/** @param {number | undefined} value */
export function hasNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/** @param {number} d */
export function fmtDelta(d) {
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
}

/**
 * @param {AllocationTrendPoint[]} points
 * @param {PortfolioAllocationTarget | undefined} target
 */
export function buildAllocationTrendMeta(points, target) {
  const latest = points[points.length - 1]
  const first = points[0]
  const stockDelta = latest.stockPct - first.stockPct
  const top3Delta = latest.top3Pct - first.top3Pct
  const threshold = target?.driftThresholdPct ?? 5
  const stockTarget = hasNumber(target?.stockPct) ? target.stockPct : null
  const top3Target = hasNumber(target?.top3MaxPct) ? target.top3MaxPct : null
  const hasStockTarget = stockTarget != null
  const hasTop3Target = top3Target != null
  const stockBandTop = hasStockTarget ? Math.min(100, stockTarget + threshold) : null
  const stockBandBottom = hasStockTarget ? Math.max(0, stockTarget - threshold) : null

  return {
    latest,
    first,
    stockDelta,
    top3Delta,
    threshold,
    stockTarget,
    top3Target,
    hasStockTarget,
    hasTop3Target,
    stockBandTop,
    stockBandBottom,
    hasEnoughPoints: points.length >= 2,
  }
}
