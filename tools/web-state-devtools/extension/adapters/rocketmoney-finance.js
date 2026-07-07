/**
 * Rocket Money finance adapter — delegates to shared RM_PROBES.
 */
;(function initRocketMoneyFinanceAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []
  const P = () => window.RM_PROBES

  function requireProbes(url) {
    const probes = P()
    if (probes) return probes
    if (matches(url)) {
      console.warn(
        '[WSD] RM_PROBES missing on Rocket Money page — reload Web State DevTools extension (>=0.8.4)',
      )
    }
    return null
  }

  function matches(url) {
    try {
      return /rocketmoney\.com/i.test(new URL(url).hostname)
    } catch {
      return false
    }
  }

  window.__WSD_ADAPTERS__.push({
    id: 'rocketmoney-finance',
    site: 'rocketmoney',
    entity: 'finance',
    matches,
    async prepare() {
      const probes = requireProbes(location.href)
      if (!probes) return { error: 'RM_PROBES missing' }
      return probes.preparePage(probes.detectPageKind())
    },
    run() {
      const probes = requireProbes(location.href)
      if (!probes) return null
      const kind = probes.detectPageKind()
      if (kind === 'transactions') {
        const items = probes.probeTransactions() ?? []
        return {
          site: 'rocketmoney',
          entity: 'transactions',
          pageKind: kind,
          items,
          count: items.length,
        }
      }
      if (kind === 'recurring') {
        const items = probes.probeRecurring() ?? []
        return {
          site: 'rocketmoney',
          entity: 'recurring',
          pageKind: kind,
          items,
          count: items.length,
        }
      }
      if (kind === 'net-worth') {
        const items = probes.probeNetWorthAccounts() ?? []
        return {
          site: 'rocketmoney',
          entity: 'accounts',
          pageKind: kind,
          items,
          count: items.length,
        }
      }
      if (kind === 'dashboard') {
        const items = probes.probeDashboardAccounts() ?? []
        return {
          site: 'rocketmoney',
          entity: 'accounts',
          pageKind: kind,
          items,
          count: items.length,
        }
      }
      return {
        site: 'rocketmoney',
        entity: 'finance',
        pageKind: kind,
        items: [],
        note: 'Open dashboard / net-worth / recurring / transactions',
      }
    },
  })
})()
