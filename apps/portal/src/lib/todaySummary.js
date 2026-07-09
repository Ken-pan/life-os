import { supabase } from './supabase.js'

/** @typedef {'planner' | 'finance' | 'fitness' | 'music' | 'home'} SummaryAppId */

/** @typedef {{
 *   ok: boolean,
 *   asOf?: string,
 *   planner?: { todayOpen: number, overdue: number },
 *   finance?: { monthSurplus: number, monthIncome: number, monthExpense: number },
 *   fitness?: { sessionDate: string, dayId: string } | null,
 *   music?: { trackTitle: string, trackArtist: string, playedAt: string } | null,
 *   home?: { storageZoneCount: number, reportedAt: string } | null,
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

/** @param {string | undefined} isoDateTime */
export function formatPlayedAgo(isoDateTime) {
  if (!isoDateTime) return ''
  const played = new Date(isoDateTime)
  if (Number.isNaN(played.getTime())) return ''
  const diffMs = Date.now() - played.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return formatShortDate(isoDateTime.slice(0, 10))
}

/** @param {string | undefined} title @param {string | undefined} artist */
export function musicTrackLabel(title, artist) {
  const t = (title ?? '').trim()
  const a = (artist ?? '').trim()
  if (t && a) return `${t} · ${a}`
  return t || a || '最近播放'
}

/** @param {string | undefined} isoDate */
export function formatShortDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/** @param {string | undefined} isoDateTime */
export function formatReportedAgo(isoDateTime) {
  return formatPlayedAgo(isoDateTime)
}

/** @param {number | undefined} count */
export function formatHomeStorageZones(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  return n === 0 ? '尚未配置储藏区' : `${n} 个储藏区`
}

/** @returns {Promise<PortalTodaySummaryPayload | null>} */
export async function fetchPortalTodaySummary() {
  const { data, error } = await supabase.rpc('portal_today_summary')
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  return /** @type {PortalTodaySummaryPayload} */ (data)
}
