import { createToastDeduper, resolveToastDuration } from '@life-os/theme'

export const toastState = $state({ msg: '', show: false, tone: 'success' })

let toastTimer = null
const shouldShowToast = createToastDeduper()

export function dismissToast() {
  toastState.show = false
  clearTimeout(toastTimer)
}

/**
 * @param {string} msg
 * @param {'success'|'error'|'warn' | { duration?: number, error?: boolean, warn?: boolean, key?: string, dedupeMs?: number }} [toneOrOpts]
 * @param {{ duration?: number, key?: string, dedupeMs?: number }} [maybeOpts]
 */
export function toast(msg, toneOrOpts = 'success', maybeOpts = {}) {
  let tone = 'success'
  /** @type {{ duration?: number, key?: string, dedupeMs?: number }} */
  let options = {}

  if (typeof toneOrOpts === 'object' && toneOrOpts !== null) {
    tone = toneOrOpts.error ? 'error' : toneOrOpts.warn ? 'warn' : 'success'
    options = toneOrOpts
  } else {
    tone = toneOrOpts
    options = maybeOpts
  }

  const key = options.key ?? (tone === 'success' ? msg : `${tone}:${msg}`)
  if (!shouldShowToast(key, options.dedupeMs ?? 3000)) return

  const ms =
    options.duration ??
    resolveToastDuration(msg, { tone, min: tone === 'error' ? 4500 : 2000, max: tone === 'error' ? 6000 : 3500 })
  toastState.msg = msg
  toastState.tone = tone
  toastState.show = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastState.show = false
  }, ms)
}

export const queueDrawerOpen = $state({ open: false })

export function openQueueDrawer() {
  queueDrawerOpen.open = true
}

export function closeQueueDrawer() {
  queueDrawerOpen.open = false
}

/** @type {{ open: boolean; tab: 'queue' | 'lyrics'; width: number }} */
export const utilityPane = $state({
  open: false,
  tab: 'queue',
  width: 360,
})

const UTILITY_PANE_WIDTH_KEY = 'musicos:utility-pane-width'
export const UTILITY_PANE_WIDTH_DEFAULT = 360
export const UTILITY_PANE_WIDTH_MIN = 280
export const UTILITY_PANE_WIDTH_MAX = 560
const UTILITY_PANE_MAIN_MIN = 480

/** @returns {number} */
function readStoredUtilityPaneWidth() {
  if (typeof localStorage === 'undefined') return UTILITY_PANE_WIDTH_DEFAULT
  try {
    const raw = localStorage.getItem(UTILITY_PANE_WIDTH_KEY)
    const n = raw ? Number(raw) : NaN
    if (!Number.isFinite(n)) return UTILITY_PANE_WIDTH_DEFAULT
    return Math.round(n)
  } catch {
    return UTILITY_PANE_WIDTH_DEFAULT
  }
}

/** @returns {{ min: number, max: number }} */
export function getUtilityPaneWidthLimits() {
  if (typeof window === 'undefined') {
    return { min: UTILITY_PANE_WIDTH_MIN, max: UTILITY_PANE_WIDTH_MAX }
  }
  const sidebar =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'),
    ) || 228
  const maxByViewport = window.innerWidth - sidebar - UTILITY_PANE_MAIN_MIN
  return {
    min: UTILITY_PANE_WIDTH_MIN,
    max: Math.max(
      UTILITY_PANE_WIDTH_MIN,
      Math.min(UTILITY_PANE_WIDTH_MAX, maxByViewport),
    ),
  }
}

/** @param {number} width */
export function clampUtilityPaneWidth(width) {
  const { min, max } = getUtilityPaneWidthLimits()
  return Math.min(max, Math.max(min, Math.round(width)))
}

export function initUtilityPaneWidth() {
  utilityPane.width = clampUtilityPaneWidth(readStoredUtilityPaneWidth())
}

/** @param {number} width @param {{ persist?: boolean }} [opts] */
export function setUtilityPaneWidth(width, opts = {}) {
  const { persist = true } = opts
  const clamped = clampUtilityPaneWidth(width)
  utilityPane.width = clamped
  if (persist && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(UTILITY_PANE_WIDTH_KEY, String(clamped))
    } catch {
      /* ignore */
    }
  }
}

/** @param {number} delta */
export function nudgeUtilityPaneWidth(delta) {
  setUtilityPaneWidth(utilityPane.width + delta)
}

/** @param {'queue' | 'lyrics'} [tab='queue'] */
export function openUtilityPane(tab = 'queue') {
  utilityPane.open = true
  utilityPane.tab = tab
}

export function closeUtilityPane() {
  utilityPane.open = false
}

/** @param {'queue' | 'lyrics'} [tab] */
export function toggleUtilityPane(tab) {
  if (utilityPane.open && (!tab || utilityPane.tab === tab)) {
    closeUtilityPane()
  } else {
    openUtilityPane(tab ?? utilityPane.tab)
  }
}

const REC_DEBUG_STORAGE_KEY = 'musicos:debug-rec'

/** Dev / audit only — never shown to normal users in production. */
export const recDebug = $state({ enabled: false })

/** @returns {boolean} */
function readRecDebugFlag() {
  if (typeof window === 'undefined') return false
  try {
    const v = localStorage.getItem(REC_DEBUG_STORAGE_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* ignore */
  }
  return import.meta.env.DEV
}

export function initRecDebug() {
  recDebug.enabled = readRecDebugFlag()
}

/** @param {boolean} on */
export function setRecDebugEnabled(on) {
  recDebug.enabled = on
  if (!on) recommendationPreview.length = 0
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REC_DEBUG_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function toggleRecDebug() {
  setRecDebugEnabled(!recDebug.enabled)
}

export function installRecDebugConsole() {
  if (typeof window === 'undefined') return
  window.toggleMusicosRecDebug = () => {
    toggleRecDebug()
    console.info(
      `[musicos] recommendation debug ${recDebug.enabled ? 'enabled' : 'disabled'}`,
    )
    return recDebug.enabled
  }
}

/** Last similar-continue picks — dev/audit queue panel only. */
export const recommendationPreview = $state(
  /** @type {Array<{ track: import('./types.js').Track, score: number, reasons: string[], matchedTags: string[] }>} */ ([]),
)
