import { supabase } from './supabase.js'

/** @typedef {'planner' | 'finance' | 'fitness'} SummaryAppId */

/** @typedef {{
 *   ok: boolean,
 *   asOf?: string,
 *   planner?: { todayOpen: number, overdue: number },
 *   finance?: { monthSurplus: number, monthIncome: number, monthExpense: number },
 *   fitness?: { sessionDate: string, dayId: string } | null,
 * }} PortalTodaySummaryPayload */

const FITNESS_DAY_LABELS = /** @type {Record<string, string>} */ ({
  chest: '胸',
  back: '背',
  legs: '腿',
  arms: '臂',
})

/**
 * @param {number} value
 * @param {{ signed?: boolean }} [options]
 */
export function formatUsd(value, options = {}) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  if (options.signed && n > 0) return `+$${abs}`
  if (options.signed && n < 0) return `−$${abs}`
  return `$${abs}`
}

/** @param {string | undefined} dayId */
export function fitnessDayLabel(dayId) {
  if (!dayId) return '训练'
  return FITNESS_DAY_LABELS[dayId] ?? dayId
}

/** @param {string | undefined} isoDate */
export function formatShortDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/** @returns {Promise<PortalTodaySummaryPayload | null>} */
export async function fetchPortalTodaySummary() {
  const { data, error } = await supabase.rpc('portal_today_summary')
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  return /** @type {PortalTodaySummaryPayload} */ (data)
}
