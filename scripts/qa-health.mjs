/**
 * Poll a dev/preview URL until it responds (Finance / Music / Portal QA scripts).
 *
 * @param {string} baseUrl e.g. http://127.0.0.1:5180
 * @param {{ timeoutMs?: number, intervalMs?: number, path?: string }} [options]
 */
export async function waitForQaUrl(baseUrl, options = {}) {
  const { timeoutMs = 60_000, intervalMs = 500, path = '/' } = options
  const target = new URL(path, baseUrl).toString()
  const deadline = Date.now() + timeoutMs
  let lastError = ''

  while (Date.now() < deadline) {
    try {
      const res = await fetch(target, { redirect: 'follow' })
      if (res.ok || res.status < 500) return
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(
    `QA server not ready at ${target} within ${timeoutMs}ms (last: ${lastError})`,
  )
}
