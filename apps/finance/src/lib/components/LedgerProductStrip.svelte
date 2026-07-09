<script>
  // 端口自 src/components/LedgerProductStrip.tsx。
  import { t } from '$lib/i18n.svelte.js'
  import { moneyPrecise } from '$lib/format.js'
  import { lineItemImageSrc, uniqueLineItems } from '$lib/engine/purchaseEnrichment'

  const DEFAULT_MAX = 3

  let { enrichment, privacy, maxItems = DEFAULT_MAX } = $props()

  const items = $derived(uniqueLineItems(enrichment.lineItems))
  const shown = $derived(items.slice(0, maxItems))
  const extra = $derived(items.length - shown.length)
</script>

{#if items.length > 0}
  <ul class="ledger-product-strip" aria-label={t('history.ledgerProductsAria')}>
    {#each shown as item (item.asin || item.detailUrl || item.title)}
      {@const imgSrc = lineItemImageSrc(item)}
      <li class="ledger-product-chip">
        {#if imgSrc && !privacy}
          <img
            class="ledger-product-chip-img"
            src={imgSrc}
            alt=""
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
          />
        {/if}
        <span class="ledger-product-chip-text">
          {#if item.detailUrl}
            <a href={item.detailUrl} target="_blank" rel="noopener noreferrer">{item.title}</a>
          {:else}
            {item.title}
          {/if}
          {#if (item.quantity ?? 1) > 1}
            <span class="ledger-product-chip-qty"> ×{item.quantity}</span>
          {/if}
          {#if item.price != null}
            <span class="ledger-product-chip-price"> {moneyPrecise(item.price, privacy)}</span>
          {/if}
        </span>
      </li>
    {/each}
    {#if extra > 0}
      <li class="ledger-product-chip ledger-product-chip--more">
        {t('history.ledgerProductsMore', { count: extra })}
      </li>
    {/if}
  </ul>
{/if}
