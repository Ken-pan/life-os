/**
 * Merge CDP capture data into enriched snapshots (bridge-side).
 */

/**
 * @param {Record<string, unknown>} snapshot
 */
export function mergeCdpIntoSnapshot(snapshot) {
  if (!snapshot.cdp && !snapshot.sensor?.network) return snapshot

  const out = { ...snapshot }

  if (snapshot.cdp?.network?.events?.length) {
    out.sensor = {
      ...(out.sensor || {}),
      network: normalizeNetwork(snapshot.cdp.network),
    }
  }

  if (snapshot.snapV2?.source === 'cdp+polyfill') {
    out.derived = out.derived || {}
    out.derived.snapSource = 'cdp+polyfill'
  }

  return out
}

/**
 * @param {Record<string, unknown>} network
 */
export function normalizeNetwork(network) {
  const events = network.events || []
  return {
    schema: 'web-state-devtools/network/v1',
    capturedAt: network.capturedAt || new Date().toISOString(),
    events: events.slice(-100),
    stats: {
      total: events.length,
      jsonCount: events.filter((e) => e.json != null).length,
      xhrFetch: events.filter((e) =>
        /xhr|fetch/i.test(String(e.resourceType || '')),
      ).length,
    },
    apiUrls: events
      .filter((e) => e.json != null)
      .slice(0, 20)
      .map((e) => ({
        url: e.url,
        status: e.status,
        keys: objectKeysPreview(e.json),
      })),
  }
}

/**
 * @param {unknown} obj
 */
function objectKeysPreview(obj) {
  if (!obj || typeof obj !== 'object') return []
  if (Array.isArray(obj)) return [`[array:${obj.length}]`]
  return Object.keys(obj).slice(0, 12)
}

/**
 * Find JSON network payloads matching URL pattern (for SPA virtual lists).
 * @param {Record<string, unknown>} snapshot
 * @param {RegExp|string} pattern
 */
export function findNetworkJson(snapshot, pattern) {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern
  const events =
    snapshot.sensor?.network?.events || snapshot.cdp?.network?.events || []
  return events.filter((e) => re.test(e.url || '') && e.json != null)
}
