/**
 * Scroll to a settings section by hash (e.g. `#cloud`).
 * WKWebView / SPA navigations often skip native hash scroll — call from onMount.
 * Retries briefly so late-mounted panels (e.g. Finance App tab) can appear first.
 *
 * @param {string} [hash='cloud']
 * @param {{
 *   delayMs?: number,
 *   retryMs?: number,
 *   retries?: number,
 *   behavior?: ScrollBehavior,
 *   block?: ScrollLogicalPosition,
 * }} [opts]
 * @returns {() => void} dispose (removes hashchange listener + pending timers)
 */
export function scrollToSettingsHash(hash = 'cloud', opts = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }
  const id = String(hash || 'cloud').replace(/^#/, '')
  if (!id) return () => {}

  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 60
  const retryMs = Number.isFinite(opts.retryMs) ? opts.retryMs : 80
  const retries = Number.isFinite(opts.retries) ? opts.retries : 10
  const behavior = opts.behavior || 'smooth'
  const block = opts.block || 'start'

  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = []
  let disposed = false

  const run = (attempt = 0) => {
    if (disposed) return
    const current = (window.location.hash || '').replace(/^#/, '')
    if (current !== id) return
    const el = document.getElementById(id)
    if (el) {
      try {
        el.scrollIntoView({ behavior, block })
      } catch {
        el.scrollIntoView()
      }
      return
    }
    if (attempt < retries) {
      timers.push(window.setTimeout(() => run(attempt + 1), retryMs))
    }
  }

  timers.push(window.setTimeout(() => run(0), delayMs))
  const onHash = () => run(0)
  window.addEventListener('hashchange', onHash)
  return () => {
    disposed = true
    for (const t of timers) window.clearTimeout(t)
    window.removeEventListener('hashchange', onHash)
  }
}
