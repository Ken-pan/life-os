<script>
  // Svelte equivalent of nesting <FinanceProvider><TransactionsProvider><TimelineProvider> from
  // the React store providers. Recreated whenever AuthGate remounts it (keyed by dataEpoch), so
  // each fresh instance re-runs the store factories with the latest `data`.
  import { createFinanceStore, setFinanceStore } from '$lib/finance.svelte.js'
  import { createTransactionsStore, setTransactionsStore } from '$lib/transactions.svelte.js'
  import { createTimelineStore, setTimelineStore } from '$lib/timeline.svelte.js'

  /** @type {{ data: import('../../types').FinanceData, children?: import('svelte').Snippet }} */
  let { data, children } = $props()

  const financeStore = createFinanceStore(data)
  const transactionsStore = createTransactionsStore()
  const timelineStore = createTimelineStore(financeStore, transactionsStore)

  setFinanceStore(financeStore)
  setTransactionsStore(transactionsStore)
  setTimelineStore(timelineStore)
</script>

{@render children?.()}
