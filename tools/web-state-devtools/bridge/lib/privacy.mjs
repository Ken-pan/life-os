/**
 * Generic privacy redaction — not site-specific.
 * Rule: enrich keeps merge keys; export applies orderId mask.
 */

const REDACT_PATTERNS = [
  {
    field: /address|shipTo|ship-to|street|postal|zip/i,
    replacement: '[redacted-address]',
  },
  { field: /email|e-mail/i, replacement: '[redacted-email]' },
  { field: /phone|tel|mobile/i, replacement: '[redacted-phone]' },
  { field: /name|recipient|customer/i, replacement: '[redacted-name]' },
  { field: /ssn|credit|card|cvv|password/i, replacement: '[redacted]' },
]

const EXPORT_EXTRA = [
  { field: /orderId|order-id|order_id/i, transform: maskId },
]

function maskId(value) {
  if (typeof value !== 'string') return value
  const m = value.match(/^(\d{3})-(\d+)-(\d+)$/)
  if (m) return `${m[1]}-****-${m[3]}`
  if (value.length > 8) return value.slice(0, 3) + '****' + value.slice(-4)
  return '[redacted-id]'
}

/**
 * @param {unknown} obj
 * @param {string} [path]
 * @param {Array<{field: RegExp, replacement?: string, transform?: Function}>} [patterns]
 */
export function redactSensitiveFields(
  obj,
  path = '',
  patterns = REDACT_PATTERNS,
) {
  if (obj == null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((v, i) =>
      redactSensitiveFields(v, `${path}[${i}]`, patterns),
    )
  }

  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key
    let redacted = false
    for (const rule of patterns) {
      if (!rule.field.test(key) && !rule.field.test(fullPath)) continue
      if (rule.transform && typeof value === 'string') {
        out[key] = rule.transform(value)
      } else if (typeof value === 'string' && value.length > 0) {
        out[key] = rule.replacement || '[redacted]'
      } else {
        out[key] = redactSensitiveFields(value, fullPath, patterns)
      }
      redacted = true
      break
    }
    if (!redacted) {
      out[key] =
        typeof value === 'object'
          ? redactSensitiveFields(value, fullPath, patterns)
          : value
    }
  }
  return out
}

/**
 * @param {Record<string, unknown>} snapshot
 */
export function applyPrivacyPolicy(snapshot) {
  const redactedFields = []
  const adapter = snapshot.adapter
  if (adapter?.items) {
    adapter.items = adapter.items.map((item, i) => {
      const before = JSON.stringify(item)
      const after = redactSensitiveFields(item)
      if (before !== JSON.stringify(after))
        redactedFields.push(`adapter.items[${i}]`)
      return after
    })
  }
  return {
    ...snapshot,
    adapter,
    privacy: {
      redactedFields,
      policy: 'web-state-devtools/privacy/v1',
    },
  }
}

/** Export-only redaction (includes unique orderId mask). */
export function redactForExport(obj) {
  return redactSensitiveFields(obj, '', [...REDACT_PATTERNS, ...EXPORT_EXTRA])
}

export { maskId }
