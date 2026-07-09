// Navigation helper matching AppShell.tsx switchTab / GoTab semantics.
import { goto } from '$app/navigation'
import { buildAppPath, resolveGoTabTarget } from '@life-os/finance-core/routing/app-route'

/**
 * @typedef {import('@life-os/finance-core/routing/app-route').AppRoute['tab']} Tab
 * @typedef {{ ledgerSearch?: string, focusEventId?: string }} GoTabOptions
 * @typedef {(tab: Tab | string, section?: string, opts?: GoTabOptions) => void} GoTab
 */

/** @returns {GoTab} */
export function createGoTab() {
  return (tab, section) => {
    const target = resolveGoTabTarget(tab, section)
    if (!target) return
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
    void goto(buildAppPath(target))
  }
}

/**
 * @param {string} [snapshotId]
 */
export function goStocks(snapshotId) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (snapshotId) url.searchParams.set('snapshot', snapshotId)
  else url.searchParams.delete('snapshot')
  url.pathname = buildAppPath({ tab: 'stocks' })
  url.hash = ''
  void goto(`${url.pathname}${url.search}`)
}
