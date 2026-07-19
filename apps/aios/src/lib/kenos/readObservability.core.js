/**
 * Redacted read-path observability. No payloads, tokens, or PII in client logs.
 */

let seq = 0

/** @type {Map<string, { count: number, lastAt: string | null, lastLatencyMs: number | null }>} */
const counters = new Map()

export function newCorrelationId(prefix = 'kenos-read') {
  seq += 1
  const rand = Math.random().toString(16).slice(2, 10)
  return `${prefix}-${Date.now().toString(16)}-${seq}-${rand}`
}

function bump(key, latencyMs = null) {
  const prev = counters.get(key) ?? { count: 0, lastAt: null, lastLatencyMs: null }
  counters.set(key, {
    count: prev.count + 1,
    lastAt: new Date().toISOString(),
    lastLatencyMs: Number.isFinite(latencyMs) ? latencyMs : prev.lastLatencyMs,
  })
}

/**
 * @param {{
 *   domain: string,
 *   source: string,
 *   status: string,
 *   latencyMs?: number,
 *   correlationId?: string,
 *   flagOn?: boolean,
 *   sourceOfTruth?: string,
 * }} event
 */
export function recordReadObservation(event) {
  const status = String(event.status || 'unknown')
  bump(`read:${event.domain}:${status}`, event.latencyMs)
  bump(`source:${event.source}:${status}`, event.latencyMs)
  if (status === 'permission_denied') bump('auth_or_rls_denial')
  if (status === 'unavailable') bump('unavailable')
  if (status === 'empty') bump('empty')
  if (status === 'error' || status === 'unavailable') bump('error_or_unavailable')
  if (typeof console !== 'undefined' && console.info) {
    console.info('[kenos-read]', {
      correlationId: event.correlationId ?? null,
      domain: event.domain,
      source: event.source,
      status,
      latencyMs: event.latencyMs ?? null,
      flagOn: Boolean(event.flagOn),
      sourceOfTruth: event.sourceOfTruth ?? event.source,
    })
  }
}

/**
 * @param {{ domain: string, blocking?: number, warning?: number, correlationId?: string }} event
 */
export function recordShadowObservation(event) {
  bump(`shadow:${event.domain}:runs`)
  if (event.blocking) bump(`shadow:${event.domain}:blocking`)
  if (event.warning) bump(`shadow:${event.domain}:warning`)
  if (typeof console !== 'undefined' && console.info) {
    console.info('[kenos-shadow]', {
      correlationId: event.correlationId ?? null,
      domain: event.domain,
      blocking: event.blocking ?? 0,
      warning: event.warning ?? 0,
    })
  }
}

export function snapshotReadObservability() {
  return Object.freeze({
    at: new Date().toISOString(),
    counters: Object.freeze(
      Object.fromEntries([...counters.entries()].map(([k, v]) => [k, { ...v }])),
    ),
  })
}

export function resetReadObservabilityForTests() {
  counters.clear()
  seq = 0
}
