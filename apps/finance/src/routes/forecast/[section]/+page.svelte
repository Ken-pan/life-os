<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { buildAppPath } from '$lib/appRoute'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { computeDashboard } from '$lib/dashboard.js'
  import ForecastHubView from '$lib/components/ForecastHubView.svelte'

  const finance = getFinanceStore()
  const timeline = getTimelineStore()
  const transactions = getTransactionsStore()

  /** @typedef {'forecast' | 'scenarios'} ForecastSection */

  const section = $derived(/** @type {ForecastSection} */ (page.params.section ?? 'forecast'))
  const dashboard = $derived.by(() => computeDashboard(finance.data, timeline, transactions))

  /** @param {string} tab @param {string} [sub] */
  function onGoTab(tab, sub) {
    goto(buildAppPath({ tab: /** @type {import('$lib/appRoute').AppTab} */ (tab), section: sub }))
  }

  /** @param {ForecastSection} next */
  function onChange(next) {
    goto(buildAppPath({ tab: 'forecast', section: next }))
  }
</script>

<ForecastHubView
  data={finance.data}
  projection={dashboard.projection}
  displayLiquidCash={dashboard.derived.liquidCash}
  cashAnchors={dashboard.derived.cashAnchors}
  {onGoTab}
  active={section}
  {onChange}
/>
