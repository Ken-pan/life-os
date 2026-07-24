/**
 * Resolve which LocalAI gateway URL this device should use.
 *
 * Phone Daily Beta cannot reach Mac loopback (127.0.0.1). When the shell is
 * loaded from a phone-reachable private host (.local / LAN / Tailscale), use
 * the same-origin `/__localai` reverse proxy that Daily Beta serves on the Mac.
 * LocalAI itself stays bound to 127.0.0.1 — only the paired shell surface is
 * exposed (prefer Tailscale MagicDNS so only the trusted peer can reach it).
 */

export const DEFAULT_GATEWAY = 'http://127.0.0.1:18888'
/** Same-origin proxy prefix served by kenos-daily-beta serve-static. */
export const SAME_ORIGIN_GATEWAY = '/__localai'

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLoopbackHost(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

/**
 * Hosts where the Kenos shell can reverse-proxy LocalAI for a phone/peer.
 * Includes Bonjour .local, RFC1918 LAN, and Tailscale (MagicDNS / CGNAT).
 * @param {string} hostname
 * @returns {boolean}
 */
export function shouldUseSameOriginLocalAiProxy(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
  if (!h || isLoopbackHost(h)) return false
  if (h.endsWith('.local')) return true
  if (h.endsWith('.ts.net')) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  // Tailscale CGNAT 100.64.0.0/10
  const m = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h)
  if (m) {
    const second = Number(m[1])
    return second >= 64 && second <= 127
  }
  return false
}

/**
 * 壳注入的网关(`window.__KENOS_LOCALAI_GATEWAY__`)是否可用作候选。
 * 只收 https(生产页是 https,http 会被混合内容拦截)且指向 tailnet 主机 ——
 * 这是「离开 Mac 也能用本地 AI」的通道:手机 Tailscale 在线时,从任何网络
 * 都能经 tailscale-serve 的 HTTPS 反代打到 Mac 上的网关。
 * @param {string} url
 * @returns {boolean}
 */
export function isUsableInjectedGateway(url) {
  const v = String(url || '').trim().replace(/\/$/, '')
  if (!v) return false
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:') return false
    return u.hostname.toLowerCase().endsWith('.ts.net')
  } catch {
    return false
  }
}

/**
 * @param {{
 *   override?: string | null,
 *   envGateway?: string | null,
 *   hostname?: string | null,
 *   injected?: string | null,
 * }} [opts]
 * @returns {string}
 */
export function resolveGatewayUrl(opts = {}) {
  const saved = String(opts.override ?? '').trim().replace(/\/$/, '')
  // Ignore stale loopback overrides on phone — they only point at the handset.
  if (saved && !isBuiltinGatewayUrl(saved)) return saved
  const env = String(opts.envGateway ?? '').trim().replace(/\/$/, '')
  if (env && !isBuiltinGatewayUrl(env)) return env
  if (shouldUseSameOriginLocalAiProxy(opts.hostname ?? '')) {
    return SAME_ORIGIN_GATEWAY
  }
  // 生产/公网 origin 上,壳注入的 tailnet HTTPS 网关取代「手机上必死的
  // loopback 默认」——同一份代码在 Mac 桌面(loopback 可达)与手机(tailnet
  // 可达)上都自动选对,用户无感。
  const injected = String(opts.injected ?? '').trim().replace(/\/$/, '')
  if (isUsableInjectedGateway(injected)) return injected
  return DEFAULT_GATEWAY
}

/**
 * Values that mean "no device override" when persisting.
 * @param {string} url
 * @returns {boolean}
 */
export function isBuiltinGatewayUrl(url) {
  const v = String(url || '')
    .trim()
    .replace(/\/$/, '')
  return (
    !v ||
    v === DEFAULT_GATEWAY ||
    v === SAME_ORIGIN_GATEWAY ||
    v === 'http://localhost:18888'
  )
}
