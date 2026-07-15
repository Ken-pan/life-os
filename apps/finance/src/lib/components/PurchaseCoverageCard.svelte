<script>
  // Port of src/components/PurchaseCoverageCard.tsx.
  import { intlLocaleTag, t } from '$lib/i18n.svelte.js'
  import { purchaseSourceLabel } from '$lib/purchaseSourceLabel.js'
  import {
    coveredSources,
    rankCoverageSources,
  } from '../../engine/purchaseEnrichmentDisplay.js'
  import MerchantLogo from './MerchantLogo.svelte'

  // Enrichment source key → a merchant string MerchantLogo can resolve. Kept
  // explicit rather than reusing the (localized) chip label, and because the
  // enrichment key 'bestbuy' differs from the brand id 'best-buy'.
  const SOURCE_BRAND = { target: 'Target', amazon: 'Amazon', bestbuy: 'Best Buy' }

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

  // Chips keep the stable display order; only the lead copy ranks by coverage.
  const sourceChips = $derived(coveredSources(stats))
  const rankedSources = $derived(rankCoverageSources(stats))

  // Labels are Latin brand names ('Target', 'Best Buy'), so Intl's unspaced zh
  // conjunction ('Target和Best Buy') reads cramped against the rest of the zh copy,
  // which spaces Latin tokens out. Pad it back; safe because no label contains 和.
  function joinSourceLabels(labels) {
    const tag = intlLocaleTag()
    const joined = new Intl.ListFormat(tag, {
      style: 'long',
      type: 'conjunction',
    }).format(labels)
    return tag.startsWith('zh') ? joined.replace(/和/g, ' 和 ') : joined
  }

  // Derived from the live per-source counts rather than hardcoded: the previous
  // static copy named whichever merchant led when it was written and went stale
  // every time coverage shifted.
  const coverageLead = $derived.by(() => {
    if (rankedSources.length === 0) return ''
    const top = purchaseSourceLabel(rankedSources[0], t)
    if (rankedSources.length === 1) {
      return t('history.coverageLeadSingle', { top })
    }
    const rest = joinSourceLabels(
      rankedSources.slice(1).map((s) => purchaseSourceLabel(s, t)),
    )
    return t('history.coverageLead', { top, rest })
  })
</script>

<div class="card purchase-coverage-card">
  <h3 class="purchase-coverage-title">{t('history.coverageTitle')}</h3>
  <p class="purchase-coverage-headline">
    {t('history.coverageHeadline', {
      bills: stats.cleanEnriched.toLocaleString(),
      items: stats.cleanItemCount.toLocaleString(),
    })}
  </p>
  {#if coverageLead}
    <p class="muted-note text-sm mb-2">{coverageLead}</p>
  {/if}
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
          <MerchantLogo merchant={SOURCE_BRAND[source]} size={16} />
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
