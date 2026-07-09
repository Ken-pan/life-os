<script>
  // Port of src/components/MerchantOrderCatalogSection.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { purchaseEnrichmentFromRow } from '../../engine/purchaseEnrichment.js'
  import PurchaseEnrichmentBlock from './PurchaseEnrichmentBlock.svelte'
  import { purchaseSourceLabel } from '$lib/purchaseSourceLabel.js'

  /** @type {readonly ['target', 'bestbuy']} */
  const SOURCES = ['target', 'bestbuy']

  /** @param {'target' | 'bestbuy'} source */
  function catalogHintKey(source) {
    return source === 'target' ? 'history.catalogTargetHint' : 'history.catalogBestbuyHint'
  }

  /** @type {{ catalog?: import('../../types.js').MerchantOrderCatalog, privacy: boolean, debugMode?: boolean }} */
  let { catalog, privacy, debugMode = false } = $props()

  let expanded = $state(debugMode)

  const sections = $derived.by(() => {
    if (!catalog) return []
    /** @type {{ source: 'target' | 'bestbuy', orders: import('../../engine/purchaseEnrichment.js').PurchaseEnrichment[] }[]} */
    const out = []
    for (const source of SOURCES) {
      const bucket = catalog[source]?.orders
      if (!bucket?.length) continue
      out.push({
        source,
        orders: bucket
          .map((o) => purchaseEnrichmentFromRow(o))
          .filter((o) => o != null),
      })
    }
    return out
  })

  const orderCount = $derived(sections.reduce((n, s) => n + s.orders.length, 0))
</script>

{#if catalog && sections.length > 0}
  {#if !expanded}
    <div class="card merchant-order-catalog-collapsed">
      <p class="merchant-order-catalog-collapsed-title mb-1">
        {t('history.catalogMaintenanceTitle', { count: orderCount.toLocaleString() })}
      </p>
      <p class="muted-note text-sm mb-2">{t('history.catalogMaintenanceHint')}</p>
      <button
        type="button"
        class="btn ghost"
        aria-expanded={false}
        aria-controls="merchant-order-catalog-panel"
        onclick={() => (expanded = true)}
      >
        {t('history.catalogMaintenanceAction')}
      </button>
    </div>
  {:else}
    <section class="merchant-order-catalog" id="merchant-order-catalog-panel">
      {#if !debugMode}
        <button
          type="button"
          class="btn ghost text-sm merchant-order-catalog-collapse"
          aria-expanded={true}
          aria-controls="merchant-order-catalog-panel"
          onclick={() => (expanded = false)}
        >
          {t('common.close')}
        </button>
      {/if}
      {#each sections as { source, orders } (source)}
        <div class="card merchant-order-catalog-card">
          <h3 class="merchant-order-catalog-title">
            {t('history.catalogUnlinkedTitle', { source: purchaseSourceLabel(source, t) })}
          </h3>
          <p class="muted-note text-sm mb-2">{t(catalogHintKey(source))}</p>
          <div class="merchant-order-catalog-list">
            {#each orders as enrichment (enrichment.orderId ?? enrichment.detailUrl)}
              <PurchaseEnrichmentBlock {enrichment} {privacy} compact {debugMode} />
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}
{/if}
