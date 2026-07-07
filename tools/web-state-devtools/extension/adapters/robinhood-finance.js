/**
 * Robinhood finance adapter — delegates to shared RH_PROBES.
 */
;(function initRobinhoodFinanceAdapter() {
  window.__WSD_ADAPTERS__ = window.__WSD_ADAPTERS__ || []
  const P = () => window.RH_PROBES

  function matches(url) {
    try {
      return /robinhood\.com/i.test(new URL(url).hostname)
    } catch {
      return false
    }
  }

  let preparedList = null

  window.__WSD_ADAPTERS__.push({
    id: 'robinhood-finance',
    site: 'robinhood',
    entity: 'finance',
    matches,
    async prepare() {
      const probes = P()
      if (!probes) return { error: 'RH_PROBES missing' }
      if (probes.isDetailPage()) return { kind: 'detail' }
      if (!probes.isListPage()) return { kind: 'unknown' }
      preparedList = await probes.prepareListPage()
      return {
        kind: 'holdings',
        positions: preparedList.positions.length,
        totalValue: preparedList.totalValue,
      }
    },
    run() {
      const probes = P()
      if (!probes) return null
      if (probes.isDetailPage()) {
        const detail = probes.readStockDetailMetrics()
        return detail
          ? {
              site: 'robinhood',
              entity: 'position-detail',
              items: [detail],
              count: 1,
            }
          : {
              site: 'robinhood',
              entity: 'position-detail',
              items: [],
              note: 'Wait for caption-text / table.table',
            }
      }
      const list =
        preparedList ??
        (() => {
          const positions = probes.readListPositions()
          return {
            positions,
            totalValue: probes.readPortfolioValue() ?? undefined,
          }
        })()
      preparedList = null
      return {
        site: 'robinhood',
        entity: 'holdings',
        items: list.positions,
        count: list.positions.length,
        totalValue: list.totalValue,
        note: list.positions.length
          ? undefined
          : 'Scroll sidebar or wait for VirtualizedSidebar',
      }
    },
  })
})()
