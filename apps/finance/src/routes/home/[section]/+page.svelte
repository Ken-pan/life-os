<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { buildAppPath, parseAppPath } from '@life-os/finance-core/routing/app-route'
  import HomeHubView from '$lib/components/HomeHubView.svelte'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { buildDashboard } from '$lib/dashboard.js'
  import { createGoTab, goStocks } from '$lib/goTab.js'
  import SpendImpactDrawer from '$lib/components/SpendImpactDrawer.svelte'

  const finance = getFinanceStore()
  const timeline = getTimelineStore()
  const transactions = getTransactionsStore()
  const onGoTab = createGoTab()

  const section = $derived(
    /** @type {import('@life-os/finance-core/routing/app-route').HomeSection} */ (
      parseAppPath(page.url.pathname)?.section ?? 'today'
    ),
  )

  const dashboard = $derived(
    buildDashboard(finance.data, {
      cashAnchors: timeline.cashAnchors,
      occurrences: timeline.occurrences,
      txns: transactions.txns,
    }),
  )

  const projection = $derived(dashboard.projection)

  /** @param {import('@life-os/finance-core/routing/app-route').HomeSection} next */
  function onChange(next) {
    void goto(buildAppPath({ tab: 'home', section: next }))
  }

  let spendDrawerOpen = $state(false)

  function onOpenSpend() {
    spendDrawerOpen = true
  }
</script>

<HomeHubView
  data={finance.data}
  {dashboard}
  {projection}
  active={section}
  {onChange}
  {onOpenSpend}
  {onGoTab}
  onGoStocks={goStocks}
/>

{#if spendDrawerOpen}
  <SpendImpactDrawer
    data={finance.data}
    baseline={projection.baseline}
    onClose={() => (spendDrawerOpen = false)}
  />
{/if}
