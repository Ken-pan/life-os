/**
 * Life OS local/staging apps — SvelteKit hints for Cursor UI work.
 */
;(function initLifeOsAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []

  const APP_PORTS = {
    5188: 'planner-os',
    5189: 'music-os',
    5190: 'fitness-os',
    5191: 'finance-os',
  }

  function matches(url) {
    try {
      const u = new URL(url)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true
      if (u.hostname.endsWith('.netlify.app')) return true
      if (u.hostname.endsWith('.kenos.space')) return true
      return false
    } catch {
      return false
    }
  }

  function guessApp(url) {
    const u = new URL(url)
    if (APP_PORTS[u.port]) return APP_PORTS[u.port]
    const host = u.hostname
    if (host.includes('planner')) return 'planner-os'
    if (host.includes('music')) return 'music-os'
    if (host.includes('fitness')) return 'fitness-os'
    if (host.includes('finance')) return 'finance-os'
    return 'life-os'
  }

  window.__WSD_ADAPTERS__.push({
    id: 'life-os',
    site: 'life-os',
    entity: 'svelte-ui',
    matches,
    run() {
      const fw = window.__WSD_FRAMEWORK__?.detectFramework?.() || {
        name: 'unknown',
      }
      const components =
        window.__WSD_FRAMEWORK__?.collectComponentHints?.(40) || []
      return {
        site: 'life-os',
        entity: 'svelte-ui',
        app: guessApp(location.href),
        framework: fw,
        components,
      }
    },
  })
})()
