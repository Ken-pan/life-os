<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { buildAppPath } from '@life-os/finance-core/routing/app-route'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import RecordsView from '$lib/components/RecordsView.svelte'
  import TxnEntryDrawer from '$lib/components/TxnEntryDrawer.svelte'

  const finance = getFinanceStore()
  const txStore = getTransactionsStore()

  const VALID_SECTIONS = new Set(['insights', 'fixed', 'oneoff'])

  const section = $derived.by(() => {
    const s = page.params.section ?? 'insights'
    return VALID_SECTIONS.has(s) ? s : 'insights'
  })

  let ledgerSearch = $state(undefined)
  let focusEventId = $state(undefined)
  let txnDrawer = $state(false)

  $effect(() => {
    const q = page.url.searchParams.get('q')
    const focus = page.url.searchParams.get('focus')
    if (q) ledgerSearch = q
    if (focus) focusEventId = focus
  })

  /** @param {'insights' | 'fixed' | 'oneoff'} nextSection */
  function onChange(nextSection) {
    goto(buildAppPath({ tab: 'history', section: nextSection }), { keepFocus: true, noScroll: true })
  }

  /** @param {string} tab @param {string} [sec] @param {{ ledgerSearch?: string, focusEventId?: string }} [opts] */
  function goTab(tab, sec, opts) {
    let path = buildAppPath({ tab, section: sec })
    const params = new URLSearchParams()
    if (opts?.ledgerSearch) params.set('q', opts.ledgerSearch)
    if (opts?.focusEventId) params.set('focus', opts.focusEventId)
    const qs = params.toString()
    goto(qs ? `${path}?${qs}` : path)
  }

  function clearSearchParam(key) {
    const url = new URL(page.url)
    url.searchParams.delete(key)
    goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true })
  }
</script>

<RecordsView
  data={finance.data}
  active={section}
  {onChange}
  onGoTab={goTab}
  {ledgerSearch}
  onLedgerSearchConsumed={() => {
    ledgerSearch = undefined
    clearSearchParam('q')
  }}
  {focusEventId}
  onFocusEventConsumed={() => {
    focusEventId = undefined
    clearSearchParam('focus')
  }}
  onQuickAdd={() => (txnDrawer = true)}
/>

{#if txnDrawer}
  <TxnEntryDrawer
    privacy={finance.data.privacy}
    onAdd={(input) => txStore.addTxn(input)}
    onClose={() => (txnDrawer = false)}
  />
{/if}
