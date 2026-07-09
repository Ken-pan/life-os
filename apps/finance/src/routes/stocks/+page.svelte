<script>
  import { goto } from '$app/navigation'
  import { buildAppPath } from '$lib/appRoute'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTimelineStore } from '$lib/timeline.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { computeDashboard } from '$lib/dashboard.js'
  import StocksView from '$lib/components/StocksView.svelte'

  const finance = getFinanceStore()
  const timeline = getTimelineStore()
  const transactions = getTransactionsStore()
  const dashboard = $derived.by(() => computeDashboard(finance.data, timeline, transactions))

  function onGoSettings() {
    goto(buildAppPath({ tab: 'accounts' }))
  }
</script>

<StocksView
  data={finance.data}
  tabActive={true}
  {onGoSettings}
  savingCapacity={dashboard.derived.savingCapacity}
/>
