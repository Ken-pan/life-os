<script>
  // Port of src/components/CashFlowsView.tsx.
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import { getFinanceStore, uid } from '$lib/finance.svelte.js'
  import SortBySelect from './SortBySelect.svelte'
  import CashFlowRow from './CashFlowRow.svelte'

  const store = getFinanceStore()
  const cashFlows = $derived(store.data.cashFlows)
  const privacy = $derived(store.data.privacy)

  let flowQuery = $state('')
  let flowFilter = $state(/** @type {'all' | 'income' | 'expense'} */ ('all'))
  /** @type {'logic' | 'amount-desc' | 'amount-asc' | 'name'} */
  let flowSort = $state('logic')
  let addFlowOpen = $state(false)

  const intlLoc = $derived(intlLocaleTag())

  /** @param {import('../../types.js').CashFlowType} type */
  function addCashFlow(type) {
    store.upsertCashFlow({
      id: uid('cf'),
      name: '',
      type,
      frequency: 'monthly',
      amount: 0,
      essential: type === 'expense',
    })
    addFlowOpen = false
  }

  const filteredFlows = $derived.by(() => {
    const flowQ = flowQuery.trim().toLowerCase()
    return cashFlows
      .filter((c) => {
        const qOk =
          !flowQ ||
          (c.name || '').toLowerCase().includes(flowQ) ||
          (c.category || '').toLowerCase().includes(flowQ)
        if (!qOk) return false
        if (flowFilter === 'income') return c.type === 'income'
        if (flowFilter === 'expense') return c.type === 'expense'
        return true
      })
      .slice()
      .sort((a, b) => {
        if (flowSort === 'amount-desc') {
          const delta = b.amount - a.amount
          if (delta !== 0) return delta
          return (a.name || '').localeCompare(b.name || '', intlLoc)
        }
        if (flowSort === 'amount-asc') {
          const delta = a.amount - b.amount
          if (delta !== 0) return delta
          return (a.name || '').localeCompare(b.name || '', intlLoc)
        }
        if (flowSort === 'name') {
          return (a.name || '').localeCompare(b.name || '', intlLoc)
        }
        const typeDelta = a.type === b.type ? 0 : a.type === 'income' ? -1 : 1
        if (typeDelta !== 0) return typeDelta
        if (a.frequency !== b.frequency) return a.frequency === 'monthly' ? -1 : 1
        const amountDelta = b.amount - a.amount
        if (amountDelta !== 0) return amountDelta
        return (a.name || '').localeCompare(b.name || '', intlLoc)
      })
  })
</script>

<div class="accounts-section records-flow-panel">
  <div class="section-head">
    <h2 class="section-title">{t('cashFlows.sectionTitle')}</h2>
    <button type="button" class="icon-btn" onclick={() => (addFlowOpen = !addFlowOpen)}>
      {addFlowOpen ? t('cashFlows.addToggleOpen') : t('cashFlows.addToggleClosed')}
    </button>
  </div>
  <p class="muted-note">{t('cashFlows.intro')}</p>
  <div class="filter-bar">
    <div class="field filter-bar-search">
      <label>{t('cashFlows.searchLabel')}</label>
      <input
        class="input"
        bind:value={flowQuery}
        placeholder={t('cashFlows.searchPlaceholder')}
      />
    </div>
    <div class="field filter-bar-filters">
      <label>{t('cashFlows.filterLabel')}</label>
      <div class="seg">
        <button type="button" class={flowFilter === 'all' ? 'active' : ''} onclick={() => (flowFilter = 'all')}>
          {t('cashFlows.filterAll')}
        </button>
        <button type="button" class={flowFilter === 'income' ? 'active' : ''} onclick={() => (flowFilter = 'income')}>
          {t('cashFlows.filterIncome')}
        </button>
        <button type="button" class={flowFilter === 'expense' ? 'active' : ''} onclick={() => (flowFilter = 'expense')}>
          {t('cashFlows.filterExpense')}
        </button>
      </div>
    </div>
    <SortBySelect
      label={t('cashFlows.sortLabel')}
      value={flowSort}
      onChange={(v) => (flowSort = v)}
      options={[
        { id: 'logic', label: t('cashFlows.sortLogic') },
        { id: 'amount-desc', label: t('cashFlows.sortAmountDesc') },
        { id: 'amount-asc', label: t('cashFlows.sortAmountAsc') },
        { id: 'name', label: t('cashFlows.sortName') },
      ]}
    />
  </div>
  {#if addFlowOpen}
    <div class="chart-controls mt-2">
      <button type="button" class="icon-btn" onclick={() => addCashFlow('income')}>
        {t('cashFlows.addIncome')}
      </button>
      <button type="button" class="icon-btn" onclick={() => addCashFlow('expense')}>
        {t('cashFlows.addExpense')}
      </button>
    </div>
  {/if}
  <div class="grid gap-3">
    {#if cashFlows.length === 0}
      <div class="empty">{t('cashFlows.empty')}</div>
    {:else if filteredFlows.length === 0}
      <div class="empty">{t('cashFlows.emptyFilter')}</div>
    {:else}
      {#each filteredFlows as c (c.id)}
        <CashFlowRow {c} {privacy} />
      {/each}
    {/if}
  </div>
</div>
