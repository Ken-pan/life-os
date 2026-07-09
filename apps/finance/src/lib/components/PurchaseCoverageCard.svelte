<script>
  // Port of src/components/PurchaseCoverageCard.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { purchaseSourceLabel } from '$lib/purchaseSourceLabel.js'

  /** @type {import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource[]} */
  const SOURCE_ORDER = ['target', 'amazon', 'bestbuy']

  /** @type {{
   *   stats: import('../../engine/purchaseEnrichmentDisplay.js').PurchaseCoverageStats,
   *   debugMode?: boolean,
   *   sourceFilter?: 'all' | import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource,
   *   onSourceFilterChange?: (source: 'all' | import('../../engine/purchaseEnrichment.js').PurchaseEnrichmentSource) => void,
   *   onFilter?: (preset: string) => void,
   *   onViewCleanBills?: () => void,
   * }} */
  let {
    stats,
    debugMode = false,
    sourceFilter = 'all',
    onSourceFilterChange,
    onFilter,
    onViewCleanBills,
  } = $props()

  const statRows = $derived([
    { key: 'clean', label: t('history.coverageStatClean'), value: stats.cleanEnriched, preset: 'purchase:clean' },
    { key: 'review', label: t('history.coverageStatReview'), value: stats.matchedReview, preset: 'purchase:review' },
    { key: 'return', label: t('history.coverageStatReturn'), value: stats.returnRefund, preset: 'purchase:return' },
  ])

  const sourceChips = $derived(SOURCE_ORDER.filter((s) => (stats.cleanBySource[s] ?? 0) > 0))
</script>

<div class="card purchase-coverage-card">
  <h3 class="purchase-coverage-title">{t('history.coverageTitle')}</h3>
  <p class="purchase-coverage-headline">
    {t('history.coverageHeadline', {
      bills: stats.cleanEnriched.toLocaleString(),
      items: stats.cleanItemCount.toLocaleString(),
    })}
  </p>
  <p class="muted-note text-sm mb-2">{t('history.coverageLead')}</p>
  {#if stats.matchedReview > 0 || stats.returnRefund > 0}
    <p class="muted-note text-sm mb-2">
      {t('history.coverageSecondary', {
        review: stats.matchedReview.toLocaleString(),
        returns: stats.returnRefund.toLocaleString(),
      })}
    </p>
  {/if}

  <div class="purchase-coverage-stats">
    {#each statRows as row (row.key)}
      <div class="purchase-coverage-stat">
        <span class="purchase-coverage-stat-label">{row.label}</span>
        {#if onFilter}
          <button type="button" class="purchase-coverage-link" onclick={() => onFilter(row.preset)}>
            {row.value.toLocaleString()}
          </button>
        {:else}
          <span class="purchase-coverage-stat-value">{row.value.toLocaleString()}</span>
        {/if}
      </div>
    {/each}
  </div>

  {#if onViewCleanBills && stats.cleanEnriched > 0}
    <button type="button" class="btn ghost purchase-coverage-cta" onclick={onViewCleanBills}>
      {t('history.coverageViewCleanBills')}
    </button>
  {/if}

  {#if sourceChips.length > 0 && onSourceFilterChange}
    <div class="purchase-source-chips" role="group" aria-label={t('history.coverageSourceFilterAria')}>
      <button
        type="button"
        class="purchase-source-chip{sourceFilter === 'all' ? ' is-active' : ''}"
        onclick={() => onSourceFilterChange('all')}
      >
        {t('history.coverageSourceAll')}
      </button>
      {#each sourceChips as source (source)}
        <button
          type="button"
          class="purchase-source-chip{sourceFilter === source ? ' is-active' : ''}"
          onclick={() => onSourceFilterChange(source)}
        >
          {purchaseSourceLabel(source, t)} {stats.cleanBySource[source]}
        </button>
      {/each}
    </div>
  {/if}

  {#if debugMode}
    <details class="purchase-coverage-debug">
      <summary>{t('history.coverageDebugTitle')}</summary>
      <dl class="purchase-coverage-grid">
        <div class="purchase-coverage-row">
          <dt>{t('history.coverageTotal')}</dt>
          <dd>{stats.total.toLocaleString()}</dd>
        </div>
        <div class="purchase-coverage-row">
          <dt>{t('history.coverageEnriched')}</dt>
          <dd>{stats.enrichedAny.toLocaleString()}</dd>
        </div>
        <div class="purchase-coverage-row">
          <dt>{t('history.coverageMerchantOnly')}</dt>
          <dd>{stats.merchantOnly.toLocaleString()}</dd>
        </div>
      </dl>
    </details>
  {/if}
</div>
