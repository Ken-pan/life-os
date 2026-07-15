<script>
  // Ledger from HistoryView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { moneyPrecise } from '$lib/format.js'
  import { isMoneyMovement, outflowOf, searchTxns } from '../../engine/transactions.js'
  import { classifyPurchaseDisplayState } from '../../engine/purchaseEnrichmentDisplay.js'
  import HistoryLedgerRow from './HistoryLedgerRow.svelte'

  const PAGE_SIZE = 40

  /** @param {(key: string) => string} tl */
  function flowOptions(tl) {
    return [
      { id: 'all', label: tl('history.flowAll') },
      { id: 'expense', label: tl('history.flowExpense') },
      { id: 'income', label: tl('history.flowIncome') },
      { id: 'credit_card_payment', label: tl('history.flowCcPayment') },
      { id: 'internal_transfer', label: tl('history.flowTransfer') },
      { id: 'refund_or_reversal', label: tl('history.flowRefund') },
      { id: 'reconcile_adjustment', label: tl('history.flowReconcile') },
    ]
  }

  /** @param {import('../../engine/transactions.js').Txn} txn @param {'all' | 'clean' | 'review' | 'return'} filter @param {'all' | import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource} sourceFilter @param {import('../../engine/purchaseEnrichmentDisplay.js').PurchaseDisplayContext} ctx */
  function matchesPurchaseStateFilter(txn, filter, sourceFilter, ctx) {
    const { state } = classifyPurchaseDisplayState(txn, ctx)
    if (sourceFilter !== 'all') {
      return state === 'clean_enriched' && txn.purchaseEnrichment?.source === sourceFilter
    }
    if (filter === 'all') return true
    if (filter === 'clean') return state === 'clean_enriched'
    if (filter === 'review') return state === 'matched_review' || state === 'unsupported_source'
    if (filter === 'return') return state === 'return_refund'
    return true
  }

  /** @type {{
   *   privacy: boolean,
   *   txns: import('../../engine/transactions.js').Txn[],
   *   categoryList: string[],
   *   accountList: string[],
   *   purchaseDisplayContext: import('../../engine/purchaseEnrichmentDisplay.js').PurchaseDisplayContext,
   *   purchaseStateFilter: 'all' | 'clean' | 'review' | 'return',
   *   purchaseSourceFilter: 'all' | import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource,
   *   purchaseDebugMode: boolean,
   *   onPurchaseStateFilterChange: (f: 'all' | 'clean' | 'review' | 'return') => void,
   *   onEdit: (t: import('../../engine/transactions.js').Txn) => Promise<void>,
   *   onDelete: (id: string) => Promise<void>,
   *   dateFilter?: { from: string, to: string, label: string } | null,
   *   onDateFilterClear?: () => void,
   *   initialSearch?: string,
   *   onInitialSearchConsumed?: () => void,
   * }} */
  let {
    privacy,
    txns,
    categoryList,
    accountList,
    purchaseDisplayContext,
    purchaseStateFilter,
    purchaseSourceFilter,
    purchaseDebugMode,
    onPurchaseStateFilterChange,
    onEdit,
    onDelete,
    dateFilter = null,
    onDateFilterClear,
    initialSearch,
    onInitialSearchConsumed,
  } = $props()

  const flowOpts = $derived(flowOptions(t))

  let search = $state('')
  let category = $state('')
  let account = $state('')
  /** @type {import('../../engine/transactions.js').FlowType | 'all'} */
  let flow = $state('all')
  let spendingOnly = $state(false)
  // 默认隐藏内部转账 / 信用卡还款 / 镜像重复：它们只是钱在自己账户间搬运，
  // 混在流水里会把「钱花在哪」冲淡（本账本 5,445 行里有相当一部分是这类）。
  // 可关闭，且隐藏了多少行会明示，避免看起来像数据缺失。
  let hideMoneyMovement = $state(true)
  let page = $state(0)
  let showFilters = $state(false)
  let editingId = $state(null)
  let busyId = $state(null)

  $effect(() => {
    if (!initialSearch) return
    search = initialSearch
    showFilters = true
    onInitialSearchConsumed?.()
  })

  // The date filter arrives from outside (chart click); page 3 of last week's
  // results is not a view of the newly chosen day.
  $effect(() => {
    void dateFilter
    page = 0
  })

  const results = $derived.by(() => {
    const searched = searchTxns(txns, {
      search: search || undefined,
      category: category || undefined,
      account: account || undefined,
      from: dateFilter?.from,
      to: dateFilter?.to,
      flow,
      spendingOnly,
      hideMoneyMovement,
    })
    return searched.filter((txn) =>
      matchesPurchaseStateFilter(txn, purchaseStateFilter, purchaseSourceFilter, purchaseDisplayContext),
    )
  })

  // 明示被隐藏的行数，而不是让账本静静地少掉几千行。
  const hiddenMovementCount = $derived(
    hideMoneyMovement && (!flow || flow === 'all')
      ? txns.filter((t) => isMoneyMovement(t)).length
      : 0,
  )

  // outflowOf，与页面其他卡同口径：退款不冲抵、取现等资金搬运不算花销。
  // 之前把可见行的 budgetImpact 直接求和，被误分类的退款能把「匹配花销合计」
  // 拉成负数，和上方 KPI 各说各话。
  const totalSpending = $derived(results.reduce((a, txn) => a + outflowOf(txn), 0))

  const pageCount = $derived(Math.max(1, Math.ceil(results.length / PAGE_SIZE)))
  const safePage = $derived(Math.min(page, pageCount - 1))
  const shown = $derived(results.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE))

  /** @param {() => void} fn */
  function reset(fn) {
    fn()
    page = 0
  }
</script>

<div class="card ledger-card">
  <div class="card-head">
    <h3>{t('history.ledgerTitle', { count: results.length.toLocaleString() })}</h3>
    <div class="section-head-actions">
      {#if dateFilter}
        <!-- The chart set this filter from another card; without a visible,
             dismissable chip the ledger just looks mysteriously short. -->
        <button
          type="button"
          class="btn ghost text-sm ledger-date-chip"
          onclick={() => reset(() => onDateFilterClear?.())}
          title={t('history.ledgerDateChipClear')}
        >
          {t('history.ledgerDateChip', { date: dateFilter.label })} ✕
        </button>
      {/if}
      {#if purchaseStateFilter !== 'all' || purchaseSourceFilter !== 'all'}
        <button
          type="button"
          class="btn ghost text-sm"
          onclick={() => onPurchaseStateFilterChange('all')}
        >
          {t('history.purchaseFilterClear')}
        </button>
      {/if}
      {#if hiddenMovementCount > 0}
        <button
          type="button"
          class="btn ghost text-sm"
          onclick={() => reset(() => (hideMoneyMovement = false))}
          title={t('history.moneyMovementHiddenHint')}
        >
          {t('history.moneyMovementHidden', { count: hiddenMovementCount.toLocaleString() })}
        </button>
      {/if}
      <span class="text-muted text-sm">
        {t('history.ledgerSpendingTotal', { amount: moneyPrecise(totalSpending, privacy) })}
      </span>
      <button type="button" class="icon-btn ledger-filter-toggle" onclick={() => (showFilters = !showFilters)}>
        {showFilters ? t('history.hideFilters') : t('history.showFilters')}
      </button>
    </div>
  </div>

  {#if showFilters}
    <div class="ledger-filter-backdrop" onclick={() => (showFilters = false)} role="presentation"></div>
  {/if}
  <div class="ledger-filter-panel{showFilters ? ' open' : ''}">
    <div class="ledger-filters">
      <input
        class="input"
        placeholder={t('history.searchPlaceholder')}
        bind:value={search}
        oninput={() => (page = 0)}
      />
      <select class="input" bind:value={category} onchange={() => (page = 0)}>
        <option value="">{t('history.allCategories')}</option>
        {#each categoryList as c (c)}<option value={c}>{c}</option>{/each}
      </select>
      <select class="input" bind:value={account} onchange={() => (page = 0)}>
        <option value="">{t('history.allAccounts')}</option>
        {#each accountList as a (a)}<option value={a}>{a}</option>{/each}
      </select>
      <select
        class="input"
        bind:value={flow}
        onchange={() => (page = 0)}
      >
        {#each flowOpts as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
      </select>
      <label class="ledger-check">
        <input
          type="checkbox"
          bind:checked={spendingOnly}
          onchange={() => (page = 0)}
        />
        {t('history.expensesOnly')}
      </label>
      <label class="ledger-check">
        <input
          type="checkbox"
          bind:checked={hideMoneyMovement}
          onchange={() => (page = 0)}
        />
        {t('history.hideMoneyMovement')}
      </label>
    </div>
    <div class="ledger-filter-actions">
      <button type="button" class="btn ghost" onclick={() => (showFilters = false)}>
        {t('history.done')}
      </button>
    </div>
  </div>

  <div class="ledger" role="list">
    {#each shown as txn, i (txn.id ?? `${txn.date}-${i}-${txn.merchant}`)}
      <HistoryLedgerRow
        {txn}
        {privacy}
        {purchaseDisplayContext}
        {purchaseDebugMode}
        editing={editingId === txn.id}
        busy={busyId === txn.id}
        onStartEdit={() => (editingId = txn.id ?? null)}
        onCancelEdit={() => (editingId = null)}
        onSaveEdit={async (next) => {
          if (!txn.id) return
          busyId = txn.id
          try {
            await onEdit(next)
            editingId = null
          } finally {
            busyId = null
          }
        }}
        onDelete={async () => {
          if (!txn.id) return
          busyId = txn.id
          try {
            await onDelete(txn.id)
          } finally {
            busyId = null
          }
        }}
      />
    {/each}
    {#if shown.length === 0}
      <p class="muted-note mt-3 mb-3">{t('history.noMatches')}</p>
    {/if}
  </div>

  {#if pageCount > 1}
    <div class="pager">
      <button type="button" class="btn ghost" disabled={safePage === 0} onclick={() => (page = safePage - 1)}>
        {t('history.prevPage')}
      </button>
      <span class="text-muted">{t('history.pageOf', { page: safePage + 1, total: pageCount })}</span>
      <button
        type="button"
        class="btn ghost"
        disabled={safePage >= pageCount - 1}
        onclick={() => (page = safePage + 1)}
      >
        {t('history.nextPage')}
      </button>
    </div>
  {/if}
</div>
