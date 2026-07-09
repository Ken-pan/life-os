import { browser } from '$app/environment'

const STORAGE_KEY = 'musicos_play_metrics'
const MAX_ENTRIES = 50

/** @typedef {'blob' | 'idb' | 'signed' | 'network' | 'unknown'} PlayUrlSource */

/**
 * @typedef {{
 *   id: string,
 *   trackId: string,
 *   t0: number,
 *   urlResolvedAt?: number,
 *   canplayAt?: number,
 *   playingAt?: number,
 *   failedAt?: number,
 *   source?: PlayUrlSource,
 *   retried?: boolean,
 *   error?: string,
 *   msToCanplay?: number,
 *   msToPlaying?: number,
 * }} PlayMetricEntry
 */

/** @type {PlayMetricEntry[]} */
let entries = loadEntries()
/** @type {PlayMetricEntry | null} */
let active = null

/** @returns {PlayMetricEntry[]} */
function loadEntries() {
  if (!browser) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : []
  } catch {
    return []
  }
}

function persist() {
  if (!browser) return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    )
  } catch {
    /* quota */
  }
}

/**
 * @param {number[]} values
 * @param {number} p
 */
function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  )
  return sorted[Math.max(0, idx)]
}

/**
 * Start a play attempt metric.
 * @param {string} trackId
 * @returns {string} attempt id
 */
export function markPlayRequest(trackId) {
  if (!browser || !trackId) return ''
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  active = {
    id,
    trackId,
    t0: performance.now(),
  }
  return id
}

/**
 * @param {PlayUrlSource} source
 */
export function markUrlResolved(source) {
  if (!active) return
  active.urlResolvedAt = performance.now()
  active.source = source
}

/**
 * Mark canplay / first audible readiness.
 */
export function markCanplay() {
  if (!active || active.canplayAt != null) return
  active.canplayAt = performance.now()
  active.msToCanplay = Math.round(active.canplayAt - active.t0)
}

/**
 * Mark successful play() / playing state.
 */
export function markPlaying() {
  if (!active) return
  if (active.canplayAt == null) markCanplay()
  active.playingAt = performance.now()
  active.msToPlaying = Math.round(active.playingAt - active.t0)
  commitActive()
}

/**
 * @param {string} [error]
 * @param {{ retried?: boolean }} [opts]
 */
export function markPlayFailed(error = '', opts = {}) {
  if (!active) return
  active.failedAt = performance.now()
  active.error = error || 'play_failed'
  if (opts.retried) active.retried = true
  commitActive()
}

function commitActive() {
  if (!active) return
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), { ...active }]
  active = null
  persist()
}

/** @returns {PlayMetricEntry[]} */
export function getPlayMetricEntries() {
  return [...entries]
}

export function clearPlayMetrics() {
  entries = []
  active = null
  if (browser) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/**
 * @returns {{
 *   count: number,
 *   p50Canplay: number | null,
 *   p95Canplay: number | null,
 *   p50Playing: number | null,
 *   p95Playing: number | null,
 *   sourceCounts: Record<string, number>,
 *   failCount: number,
 *   recentFails: PlayMetricEntry[],
 * }}
 */
export function summarizePlayMetrics() {
  const ok = entries.filter((e) => e.msToCanplay != null && !e.failedAt)
  const canplayMs = ok.map((e) => /** @type {number} */ (e.msToCanplay))
  const playingMs = ok
    .filter((e) => e.msToPlaying != null)
    .map((e) => /** @type {number} */ (e.msToPlaying))
  /** @type {Record<string, number>} */
  const sourceCounts = {}
  for (const e of entries) {
    const key = e.source || 'unknown'
    sourceCounts[key] = (sourceCounts[key] || 0) + 1
  }
  const fails = entries.filter((e) => e.failedAt).slice(-8)
  return {
    count: entries.length,
    p50Canplay: percentile(canplayMs, 50),
    p95Canplay: percentile(canplayMs, 95),
    p50Playing: percentile(playingMs, 50),
    p95Playing: percentile(playingMs, 95),
    sourceCounts,
    failCount: fails.length,
    recentFails: fails,
  }
}

/**
 * Classify a resolved play URL for metrics.
 * @param {import('./types.js').Track} track
 * @param {string} src
 * @returns {PlayUrlSource}
 */
export function classifyPlayUrlSource(track, src) {
  if (!src) return 'unknown'
  if (src.startsWith('blob:')) {
    if (track.audioBlob instanceof Blob) return 'blob'
    return 'idb'
  }
  if (src.includes('/storage/v1/object/sign/')) return 'signed'
  if (src.startsWith('http')) return 'network'
  return 'unknown'
}
