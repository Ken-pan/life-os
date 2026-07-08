import { resolveToastDuration } from '@life-os/theme'
import { createToastStore } from '@life-os/platform-web/svelte/toast-store'
import { loadUiPrefs, saveUiPrefs } from './settingsPersistence.js'

/** @typedef {import('@life-os/contracts/feedback').FeedbackMessage} FeedbackMessage */

// Music 专属时长策略：整体更紧凑（error 4500–6000 / 其他 2000–3500）
const toastStore = createToastStore({
  resolveDuration: (msg, { tone }) =>
    resolveToastDuration(msg, {
      tone,
      min: tone === 'error' ? 4500 : 2000,
      max: tone === 'error' ? 6000 : 3500,
    }),
})

export const toastState = toastStore.toastState
export const dismissToast = toastStore.dismissToast

/**
 * @param {string} msg
 * @param {'success'|'error'|'warn' | FeedbackMessage['severity'] | { duration?: number, error?: boolean, warn?: boolean, key?: string, dedupeMs?: number }} [toneOrOpts]
 * @param {{ duration?: number, key?: string, dedupeMs?: number }} [maybeOpts]
 */
export function toast(msg, toneOrOpts = 'success', maybeOpts = {}) {
  if (!String(msg ?? '').trim()) return
  toastStore.toast(msg, toneOrOpts, maybeOpts)
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
  tab: loadUiPrefs().utilityPaneTab,
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
      getComputedStyle(document.documentElement).getPropertyValue(
        '--sidebar-w',
      ),
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
  saveUiPrefs({ utilityPaneTab: tab })
}

export function closeUtilityPane() {
  utilityPane.open = false
}

/** @param {'queue' | 'lyrics'} [tab] */
export function toggleUtilityPane(tab) {
  if (utilityPane.open && (!tab || utilityPane.tab === tab)) {
    closeUtilityPane()
  } else {
    const next = tab ?? utilityPane.tab
    openUtilityPane(next)
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
