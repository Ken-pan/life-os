<script>
  // Port of src/components/HistoryView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import {
    money,
    signedMoney,
    depositDeltaClass,
  } from '$lib/format.js'
  import {
    accountNamesOf,
    categoriesOf,
    computeRecurring,
    computeStatistics,
    categoryBreakdown,
    monthlySeries,
    searchTxns,
    spendingSummary,
    topMerchants,
  } from '../../engine/transactions.js'
  import {
    buildPurchaseDisplayContext,
    computePurchaseCoverage,
  } from '../../engine/purchaseEnrichmentDisplay.js'
  import { isPurchaseEnrichmentDebugMode } from '../../lib/purchaseDebugMode.js'
  import SpendingTrendChart from './SpendingTrendChart.svelte'
  import BudgetPulseCard from './BudgetPulseCard.svelte'
  import PurchaseCoverageCard from './PurchaseCoverageCard.svelte'
  import MerchantOrderCatalogSection from './MerchantOrderCatalogSection.svelte'
  import HistoryLedger from './HistoryLedger.svelte'

  /** @typedef {'month' | '3m' | '12m' | 'all'} Window */

  /** @param {string} asOf @param {number} n */
  function monthsBeforeAsOf(asOf, n) {
    const [y, m, d] = asOf.split('-').map(Number)
    const total = y * 12 + (m - 1) - n
    const yy = Math.floor(total / 12)
    const mm = (total % 12) + 1
    return `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  /** @param {string} asOf @param {Window} w */
  function windowRange(asOf, w) {
    const to = asOf
    switch (w) {
      case 'month':
        return { from: `${asOf.slice(0, 7)}-01`, to, label: t('history.windowMonthLong') }
      case '3m':
        return { from: monthsBeforeAsOf(asOf, 3), to, label: t('history.window3mLong') }
      case '12m':
        return { from: monthsBeforeAsOf(asOf, 12), to, label: t('history.window12mLong') }
      case 'all':
      default:
        return { label: t('history.windowAllLong') }
    }
  }

  /** @param {number} amount @param {'monthly' | 'annual'} frequency */
  function toMonthly(amount, frequency) {
    return frequency === 'annual' ? amount / 12 : amount
  }

  /** @type {{
   *   data: import('../../types.js').FinanceData,
   *   initialLedgerSearch?: string,
   *   onLedgerSearchConsumed?: () => void,
   *   onQuickAdd?: () => void,
   * }} */
  let { data, initialLedgerSearch, onLedgerSearchConsumed, onQuickAdd } = $props()

  const txStore = getTransactionsStore()
  const privacy = $derived(data.privacy)

  const series = $derived(monthlySeries(txStore.txns))
  const summary = $derived(spendingSummary(series))
  const recurring = $derived(computeRecurring(txStore.txns, { limit: 12 }))
  const txnStatistics = $derived(computeStatistics(txStore.txns))
  const categoryList = $derived(categoriesOf(txStore.txns))
  const accountList = $derived(accountNamesOf(txStore.txns))

  /** @type {Window} */
  let trendWindow = $state('month')
  /** @type {Window} */
  let catWindow = $state('month')
  let showInsights = $state(false)

  const trendSeries = $derived.by(() => {
    if (trendWindow === 'all') return series
    const n = trendWindow === 'month' ? 1 : trendWindow === '3m' ? 3 : 12
    return series.slice(-n - (trendWindow === 'month' ? 0 : 1))
  })

  const catRange = $derived(windowRange(txStore.meta.asOf, catWindow))
  const categories = $derived(
    categoryBreakdown(txStore.txns, { from: catRange.from, to: catRange.to }),
  )
  const merchants = $derived(
    topMerchants(txStore.txns, { from: catRange.from, to: catRange.to, limit: 12 }),
  )
  const maxCat = $derived(categories[0]?.amount ?? 1)
  const categoryLimit = $derived(catWindow === 'month' ? 8 : 14)
  const merchantLimit = $derived(catWindow === 'month' ? 8 : 12)
  const latest = $derived(summary.latestMonth)
  const thisMonthSpending = $derived(latest?.spending ?? 0)
  const purchaseDisplayContext = $derived(buildPurchaseDisplayContext(txStore.txns))
  const purchaseCoverage = $derived(computePurchaseCoverage(txStore.txns, purchaseDisplayContext))
  const purchaseDebugMode = $derived(isPurchaseEnrichmentDebugMode())

  /** @type {HTMLDivElement | null} */
  let ledgerRef = $state(null)
  let jumpLedgerSearch = $state(undefined)
  /** @type {'all' | 'clean' | 'review' | 'return'} */
  let purchaseStateFilter = $state('all')
  /** @type {'all' | import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource} */
  let purchaseSourceFilter = $state('all')

  const plannedMonthly = $derived(
    data.cashFlows
      .filter((c) => c.type === 'expense')
      .reduce((a, c) => a + toMonthly(c.amount, c.frequency), 0),
  )
  const planDiff = $derived(thisMonthSpending - plannedMonthly)
  const planOverspend = $derived(planDiff > 0)
  const planRatio = $derived(plannedMonthly > 0 ? planDiff / plannedMonthly : 0)
  const planMeaningful = $derived(Math.abs(planRatio) >= 0.05)

  function scrollToLedger() {
    ledgerRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
</script>

{#if txStore.loading}
  <div class="card">{t('history.loading')}</div>
{:else if txStore.error}
  <div class="card">{t('history.loadFailed', { error: txStore.error })}</div>
{:else}
  <div class="history-view">
    <details class="history-intro-details">
      <summary class="history-intro-summary">
        {t('history.introSummary', {
          start: txStore.meta.dateRange.start,
          end: txStore.meta.dateRange.end,
          count: txStore.meta.rowCount.toLocaleString(),
        })}
      </summary>
      <p class="muted-note history-intro mb-0 mt-1">
        {t('history.intro', {
          start: txStore.meta.dateRange.start,
          end: txStore.meta.dateRange.end,
          count: txStore.meta.rowCount.toLocaleString(),
        })}
      </p>
    </details>

    <PurchaseCoverageCard
      stats={purchaseCoverage}
      debugMode={purchaseDebugMode}
      sourceFilter={purchaseSourceFilter}
      onSourceFilterChange={(source) => {
        purchaseSourceFilter = source
        if (source !== 'all') purchaseStateFilter = 'clean'
        scrollToLedger()
      }}
      onFilter={(preset) => {
        if (preset === 'purchase:clean') purchaseStateFilter = 'clean'
        else if (preset === 'purchase:review') purchaseStateFilter = 'review'
        else if (preset === 'purchase:return') purchaseStateFilter = 'return'
        purchaseSourceFilter = 'all'
        scrollToLedger()
      }}
      onViewCleanBills={() => {
        purchaseStateFilter = 'clean'
        purchaseSourceFilter = 'all'
        scrollToLedger()
      }}
    />

    <div bind:this={ledgerRef} id="history-ledger">
      <HistoryLedger
        {privacy}
        txns={txStore.txns}
        {categoryList}
        {accountList}
        {purchaseDisplayContext}
        {purchaseStateFilter}
        {purchaseSourceFilter}
        {purchaseDebugMode}
        onPurchaseStateFilterChange={(f) => {
          purchaseStateFilter = f
          if (f !== 'clean') purchaseSourceFilter = 'all'
        }}
        onEdit={(txn) => txStore.editTxn(txn)}
        onDelete={(id) => txStore.removeTxn(id)}
        initialSearch={jumpLedgerSearch ?? initialLedgerSearch}
        onInitialSearchConsumed={() => {
          jumpLedgerSearch = undefined
          onLedgerSearchConsumed?.()
        }}
      />
    </div>

    <section class="history-summary-secondary">
      <BudgetPulseCard {data} {onQuickAdd} compact />
      <MerchantOrderCatalogSection catalog={data.merchantOrderCatalog} {privacy} debugMode={purchaseDebugMode} />
    </section>

    <div class="history-insights-toggle">
      <button
        type="button"
        class="btn ghost"
        onclick={() => (showInsights = !showInsights)}
        aria-expanded={showInsights}
      >
        {showInsights ? t('history.collapseInsights') : t('history.expandInsights')}
      </button>
    </div>

    <div class="history-insights{showInsights ? ' open' : ''}">
      {#if showInsights}
        <div class="card history-kpi-card">
          <h3>{t('history.extendedKpiTitle')}</h3>
          <div class="grid history-kpi-grid mt-2-5">
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiAvgSpending')}</span>
              <span class="value records-metric">{money(summary.avgMonthlySpending, privacy)}</span>
              <span class="sub">
                {summary.monthsCounted === 1
                  ? t('history.kpiAvgSpendingSubOne')
                  : t('history.kpiAvgSpendingSub', { months: summary.monthsCounted })}
              </span>
            </div>
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiAvgIncome')}</span>
              <span class="value records-metric">{money(summary.avgMonthlyIncome, privacy)}</span>
              <span class="sub">{t('history.kpiAvgIncomeSub')}</span>
            </div>
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiThisMonth', { month: latest?.month ?? '—' })}</span>
              <span class="value records-metric">{money(latest?.spending ?? 0, privacy)}</span>
              <span class="sub">
                {latest
                  ? t('history.kpiNetSub', { amount: signedMoney(latest.net, privacy) })
                  : t('history.kpiNoData')}
              </span>
            </div>
            <div class="history-kpi-cell">
              <span class="label">{t('history.kpiTrailing12')}</span>
              <span class="value records-metric">{money(summary.trailing12mSpending, privacy)}</span>
              <span class="sub">
                {t('history.kpiHighestMonth', {
                  amount: money(summary.highestMonth?.spending ?? 0, privacy),
                })}
              </span>
            </div>
          </div>
        </div>

        {#if plannedMonthly > 0 && thisMonthSpending > 0}
          <div class="card">
            <h3>{t('history.planRealityTitle')}</h3>
            <div class="grid plan-reality-grid gap-3">
              <div class="kv-stack">
                <span class="text-secondary">{t('history.plannedMonthly')}</span>
                <span class="pr-value records-metric">{money(plannedMonthly, privacy)}</span>
              </div>
              <div class="kv-stack">
                <span class="text-secondary">{t('history.actualThisMonth')}</span>
                <span class="pr-value records-metric">{money(thisMonthSpending, privacy)}</span>
              </div>
              <div class="kv-stack">
                <span class="text-secondary">{t('history.diff')}</span>
                <span class="pr-value records-metric {depositDeltaClass(-planDiff)}">
                  {signedMoney(planDiff, privacy)}
                </span>
              </div>
            </div>
            <p class="muted-note mt-2-5">
              {!planMeaningful
                ? t('history.planMatch')
                : planOverspend
                  ? t('history.planOverspend', { pct: (planRatio * 100).toFixed(0) })
                  : t('history.planUnderspend', { pct: (Math.abs(planRatio) * 100).toFixed(0) })}
            </p>
          </div>
        {/if}

        <div class="card">
          <div class="card-head">
            <h3>{t('history.trendTitle')}</h3>
            <div class="seg">
              {#each [
                { id: 'month', label: t('history.windowMonth') },
                { id: '3m', label: t('history.window3m') },
                { id: '12m', label: t('history.window12m') },
                { id: 'all', label: t('history.windowAll') },
              ] as w (w.id)}
                <button
                  type="button"
                  class={trendWindow === w.id ? 'active' : ''}
                  onclick={() => (trendWindow = w.id)}
                >
                  {w.label}
                </button>
              {/each}
            </div>
          </div>
          <SpendingTrendChart series={trendSeries} {privacy} />
          <p class="muted-note mt-2">{t('history.trendNote')}</p>
        </div>

        <div class="grid cols-2">
          <div class="card">
            <div class="card-head">
              <h3>{t('history.categoriesTitle', { range: catRange.label })}</h3>
              <div class="seg">
                {#each [
                  { id: 'month', label: t('history.windowMonth') },
                  { id: '3m', label: t('history.window3m') },
                  { id: '12m', label: t('history.window12m') },
                  { id: 'all', label: t('history.windowAll') },
                ] as w (w.id)}
                  <button
                    type="button"
                    class={catWindow === w.id ? 'active' : ''}
                    onclick={() => (catWindow = w.id)}
                  >
                    {w.label}
                  </button>
                {/each}
              </div>
            </div>
            {#if categories.length === 0}
              <p class="muted-note">{t('history.noSpendingInRange')}</p>
            {:else}
              <div class="cat-list">
                {#each categories.slice(0, categoryLimit) as c (c.category)}
                  <div class="cat-row">
                    <div class="cat-top">
                      <span class="cat-name">{c.category}</span>
                      <span class="cat-amt">{money(c.amount, privacy)}</span>
                    </div>
                    <div class="cat-bar">
                      <div
                        class="cat-bar-fill"
                        style:width="{Math.max(2, (c.amount / maxCat) * 100)}%"
                      ></div>
                    </div>
                    <div class="cat-meta">
                      {c.count === 1
                        ? t('history.categoryMetaOne', { pct: (c.pct * 100).toFixed(1) })
                        : t('history.categoryMeta', { pct: (c.pct * 100).toFixed(1), count: c.count })}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="card">
            <h3>{t('history.recurringTitle')}</h3>
            <p class="muted-note mb-2-5">{t('history.recurringNote')}</p>
            <div class="list recurring-list">
              {#each recurring as r (r.merchant)}
                <div class="item">
                  <div class="grow">
                    <div class="name">{r.merchant}</div>
                    <div class="meta">
                      {t('history.recurringMeta', {
                        months: r.distinctMonths,
                        count: r.transactionCount,
                        lastSeen: r.lastSeen,
                      })}
                    </div>
                  </div>
                  <div class="amount text-secondary">
                    {money(r.averageAmount, privacy)}{t('history.perOccurrence')}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div class="card">
          <h3>{t('history.topMerchantsTitle', { range: catRange.label })}</h3>
          {#if merchants.length === 0}
            <p class="muted-note">{t('history.noSpendingInRange')}</p>
          {:else}
            <div class="grid merchant-grid">
              {#each merchants.slice(0, merchantLimit) as m, i (m.merchant)}
                <div class="merchant-cell">
                  <span class="merchant-rank">{i + 1}</span>
                  <div class="grow">
                    <div class="name">{m.merchant}</div>
                    <div class="meta">{t('history.merchantMeta', { count: m.count })}</div>
                  </div>
                  <span class="amount">{money(m.amount, privacy)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <p class="muted-note">
      {t('history.footnote', {
        ccPayments: txnStatistics.creditCardPaymentRows,
        transfers: txnStatistics.internalTransferRows,
        mirrors: txnStatistics.mirrorDuplicateRowsExcludedFromAnalytics,
      })}
    </p>
  </div>
{/if}
