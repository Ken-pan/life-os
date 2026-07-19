/**
 * Online / offline helpers for shell banner + reconnect (no secrets).
 */

/**
 * @param {{ online?: boolean, wasOffline?: boolean }} state
 */
export function shouldReconnectAfterOnline(state = {}) {
  return state.wasOffline === true && state.online === true
}

/**
 * Bounded retry delays (ms). Callers must not loop unboundedly.
 * @param {number} attempt zero-based
 */
export function reconnectDelayMs(attempt) {
  const delays = [0, 400, 1000, 2000, 4000]
  const i = Math.max(0, Math.min(delays.length - 1, Number(attempt) || 0))
  return delays[i]
}

/**
 * @param {number} attempt
 * @param {number} [maxAttempts]
 */
export function canRetryReconnect(attempt, maxAttempts = 5) {
  return Number(attempt) < Number(maxAttempts)
}
