import { adjustForDisplay, monthOffsetToCalendarLabel } from '$lib/format.js'

/** @param {number} months @param {number} step */
export function buildXTicks(months, step) {
  const stride =
    months <= 12 ? 1 : months <= 24 ? 2 : months <= 60 ? 3 : months <= 120 ? 6 : 12
  const ticks = []
  for (let m = 0; m <= months; m += stride) ticks.push(m - (m % step))
  if (ticks[ticks.length - 1] !== months - (months % step)) ticks.push(months - (months % step))
  return Array.from(new Set(ticks)).sort((a, b) => a - b)
}

/**
 * @param {number} m
 * @param {number} months
 * @param {string} intlLoc
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 */
export function formatXAxisLabel(m, months, intlLoc, translate) {
  const d = new Date()
  d.setMonth(d.getMonth() + m)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = d.getMonth() + 1
  if (months <= 12) {
    if (intlLoc.startsWith('zh')) return translate('forecastChart.monthShort', { month: String(mm) })
    return d.toLocaleDateString(intlLoc, { month: 'short' })
  }
  if (months <= 36) return `${yy}/${mm}`
  return `${d.getFullYear()}`
}

/**
 * @param {number} m
 * @param {number} months
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 */
export function formatTooltipLabel(m, months, translate) {
  const cal = monthOffsetToCalendarLabel(m)
  if (months <= 12) return translate('forecastChart.tooltipMonthsLater', { cal, months: String(m) })
  if (months <= 36)
    return translate('forecastChart.tooltipYearsApprox', { cal, years: (m / 12).toFixed(1) })
  return translate('forecastChart.tooltipYearN', { cal, year: String(Math.round(m / 12)) })
}

/** @param {Array<Record<string, number>>} data */
export function buildYDomain(data) {
  let min = Infinity
  let max = -Infinity
  for (const p of data) {
    for (const key of ['baseline', 'low', 'sim', 'high']) {
      const v = p[key]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  const span = Math.max(1, max - min)
  const pad = span * 0.12
  let lower = min - pad
  let upper = max + pad
  if (min > 0 && lower <= 0) lower = min * 0.88
  if (max < 0 && upper >= 0) upper = max * 0.88
  if (Math.abs(upper - lower) < 1) upper = lower + 1
  return [lower, upper]
}

/**
 * @param {{
 *   baseline: import('../../engine/monthly.js').MonthSnapshot[],
 *   low: import('../../engine/monthly.js').MonthSnapshot[],
 *   high: import('../../engine/monthly.js').MonthSnapshot[],
 *   sim?: import('../../engine/monthly.js').MonthSnapshot[],
 *   read: import('../../engine/metrics.js').GoalMetricValue,
 *   displayMode: import('../../types.js').DisplayMode,
 *   inflation: number,
 *   months: number,
 *   step: number,
 * }} input
 */
export function buildForecastChartData(input) {
  const { baseline, low, high, sim, read, displayMode, inflation, months, step } = input
  /** @type {Array<Record<string, number>>} */
  const data = []
  for (let m = 0; m <= months; m += step) {
    const adj = (v) => adjustForDisplay(v, m, displayMode, inflation)
    const lo = adj(read(low[m]))
    const hi = adj(read(high[m]))
    const point = {
      m,
      baseline: adj(read(baseline[m])),
      low: lo,
      high: hi,
    }
    if (sim) point.sim = adj(read(sim[m]))
    data.push(point)
  }
  return data
}

/**
 * @param {{
 *   baseline: import('../../engine/monthly.js').MonthSnapshot[],
 *   displayMode: import('../../types.js').DisplayMode,
 *   inflation: number,
 *   months: number,
 *   step: number,
 * }} input
 */
export function buildForecastSplitChartData(input) {
  const { baseline, displayMode, inflation, months, step } = input
  /** @type {Array<Record<string, number>>} */
  const data = []
  for (let m = 0; m <= months; m += step) {
    const adj = (v) => adjustForDisplay(v, m, displayMode, inflation)
    const accessible = Math.max(0, adj(baseline[m].accessible))
    const locked = Math.max(0, adj(baseline[m].locked))
    data.push({
      m,
      accessible,
      locked,
      stackTop: accessible + locked,
    })
  }
  return data
}

/** Split chart x-axis labels (no i18n in original ForecastSplitChart.tsx). */
export function formatSplitXAxisLabel(m, months) {
  const d = new Date()
  d.setMonth(d.getMonth() + m)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = d.getMonth() + 1
  if (months <= 12) return `${mm}月`
  if (months <= 36) return `${yy}/${mm}`
  return `${d.getFullYear()}`
}

export function formatSplitTooltipLabel(m, months) {
  const cal = monthOffsetToCalendarLabel(m)
  if (months <= 12) return `${cal}（${m}个月后）`
  if (months <= 36) return `${cal}（约 ${(m / 12).toFixed(1)} 年后）`
  return `${cal}（约第 ${Math.round(m / 12)} 年）`
}
