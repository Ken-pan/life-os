<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { buildAppPath } from '$lib/appRoute'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import ReviewView from '$lib/components/ReviewView.svelte'

  const finance = getFinanceStore()

  /** @typedef {'import' | 'queue' | 'baseline' | 'calibrate' | 'reconcile'} ReviewTab */

  const section = $derived(/** @type {ReviewTab} */ (page.params.section ?? 'import'))

  /** @param {ReviewTab} tab */
  function onChange(tab) {
    goto(buildAppPath({ tab: 'review', section: tab }))
  }
</script>

<ReviewView data={finance.data} active={section} {onChange} />
