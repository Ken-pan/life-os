import { supabase } from './supabase.js'

export {
  formatUsd,
  fitnessDayLabel,
  formatPlayedAgo,
  musicTrackLabel,
  formatShortDate,
  formatReportedAgo,
  formatHomeStorageZones,
  formatFitnessTodaySummary,
} from './todaySummaryFormat.js'

/** @typedef {import('./todaySummaryFormat.js').PortalFitnessSummary} PortalFitnessSummary */

/** @typedef {{
 *   ok: boolean,
 *   asOf?: string,
 *   planner?: { todayOpen: number, overdue: number },
 *   finance?: { monthSurplus: number, monthIncome: number, monthExpense: number },
 *   fitness?: PortalFitnessSummary | null,
 *   music?: { trackTitle: string, trackArtist: string, playedAt: string } | null,
 *   home?: { storageZoneCount: number, reportedAt: string } | null,
 * }} PortalTodaySummaryPayload */

/** @returns {Promise<PortalTodaySummaryPayload | null>} */
export async function fetchPortalTodaySummary() {
  let tz = 'America/Los_Angeles'
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch (e) {
    // Ignore error, fallback is handled
  }

  const { data, error } = await supabase.rpc('portal_today_summary', { p_timezone: tz })
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  return /** @type {PortalTodaySummaryPayload} */ (data)
}
