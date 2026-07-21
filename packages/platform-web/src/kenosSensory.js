/**
 * Kenos sensory vocabulary — semantic haptics for Continuity + PWA.
 *
 * Prefers `nativeHaptic` inside the iOS WKWebView shell; falls back to
 * `navigator.vibrate` on Android / capable browsers. iOS Safari / WKWebView
 * do not implement vibrate — those surfaces must go through the native bridge.
 *
 * @typedef {'select'|'tick'|'soft'|'commit'|'success'|'warn'|'error'|'pulse'} KenosSensoryIntent
 * @typedef {{ force?: boolean, now?: number }} KenosSensoryOptions
 */

import { isNativeBridgeAvailable, nativeHaptic } from './kenosNativeBridge.js'

/** @type {Record<KenosSensoryIntent, { haptic: string, vibrate: number|number[] }>} */
export const SENSORY_MAP = {
  select: { haptic: 'selection', vibrate: [8] },
  tick: { haptic: 'rigid', vibrate: [10] },
  soft: { haptic: 'soft', vibrate: [12] },
  commit: { haptic: 'medium', vibrate: [20] },
  success: { haptic: 'success', vibrate: [30, 40, 30] },
  warn: { haptic: 'warning', vibrate: [40, 30, 40] },
  error: { haptic: 'error', vibrate: [60, 40, 60] },
  // Native implements heavy → delayed medium; vibrate pattern mirrors the feel.
  pulse: { haptic: 'pulse', vibrate: [120, 60, 120] },
}

/** Minimum gap between identical intents (ms). Prevents threshold / countdown spam. */
export const SENSORY_MIN_INTERVAL_MS = {
  select: 40,
  tick: 90,
  soft: 140,
  commit: 120,
  success: 220,
  warn: 160,
  error: 220,
  pulse: 320,
}

/** @type {Map<string, number>} */
const lastFiredAt = new Map()

/**
 * @param {unknown} intent
 * @returns {KenosSensoryIntent}
 */
export function normalizeSensoryIntent(intent) {
  const key = String(intent || '').toLowerCase()
  if (Object.prototype.hasOwnProperty.call(SENSORY_MAP, key)) {
    return /** @type {KenosSensoryIntent} */ (key)
  }
  return 'soft'
}

/**
 * Reset throttle clocks (tests / after long background).
 */
export function resetSensoryThrottle() {
  lastFiredAt.clear()
}

/**
 * @param {KenosSensoryIntent} intent
 * @param {KenosSensoryOptions} [opts]
 * @returns {boolean}
 */
export function shouldFireSensory(intent, opts = {}) {
  if (opts.force) return true
  const now =
    typeof opts.now === 'number' && Number.isFinite(opts.now)
      ? opts.now
      : Date.now()
  const gap = SENSORY_MIN_INTERVAL_MS[intent] ?? 120
  const prev = lastFiredAt.get(intent) ?? 0
  return now - prev >= gap
}

/**
 * Fire a semantic sensory cue.
 * @param {KenosSensoryIntent|string} [intent='soft']
 * @param {KenosSensoryOptions} [opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   intent: KenosSensoryIntent,
 *   via: 'native'|'vibrate'|'none',
 *   skipped?: boolean,
 *   throttled?: boolean,
 * }>}
 */
export async function sensory(intent = 'soft', opts = {}) {
  const normalized = normalizeSensoryIntent(intent)
  const mapped = SENSORY_MAP[normalized]
  const now =
    typeof opts.now === 'number' && Number.isFinite(opts.now)
      ? opts.now
      : Date.now()

  if (!shouldFireSensory(normalized, { ...opts, now })) {
    return {
      ok: false,
      intent: normalized,
      via: 'none',
      skipped: true,
      throttled: true,
    }
  }

  if (isNativeBridgeAvailable()) {
    try {
      const result = await nativeHaptic(mapped.haptic)
      if (result?.ok) {
        lastFiredAt.set(normalized, now)
        return { ok: true, intent: normalized, via: 'native' }
      }
    } catch {
      /* fall through to vibrate */
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    try {
      const played = navigator.vibrate(mapped.vibrate)
      if (played !== false) {
        lastFiredAt.set(normalized, now)
        return { ok: true, intent: normalized, via: 'vibrate' }
      }
    } catch {
      /* ignore */
    }
  }

  return { ok: false, intent: normalized, via: 'none', skipped: true }
}
