<script>
  // 端口自 src/components/PurchaseEnrichmentBlock.tsx。
  import { t } from '$lib/i18n.svelte.js'
  import { moneyPrecise } from '$lib/format.js'
  import { lineItemImageSrc, uniqueLineItems } from '$lib/engine/purchaseEnrichment'
  import {
    isReturnLikeEnrichment,
    returnStatusLabelKey,
  } from '$lib/engine/purchaseReturnStatus'

  let {
    enrichment,
    privacy,
    chargeDate,
    compact = false,
    showLineItemsInBody = true,
    displayState = 'clean_enriched',
    debugMode = false,
    onOpenChange,
  } = $props()

  let open = $state(!compact)

  $effect(() => {
    onOpenChange?.(open)
  })

  const items = $derived(uniqueLineItems(enrichment.lineItems))
  const hasItemPrices = $derived(items.some((li) => li.price != null))
  const returnInfo = $derived(enrichment.returnInfo)
  const showReturnBadge = $derived(isReturnLikeEnrichment(returnInfo) || returnInfo?.isRefundCredit)
  const allowLineItems = $derived(displayState === 'clean_enriched' && showLineItemsInBody)
  const showItemCount = $derived(items.length > 0 && (displayState === 'clean_enriched' || debugMode))
  const noItemsMessage = $derived(
    displayState === 'matched_review'
      ? t('history.purchaseStateReviewHint')
      : displayState === 'unsupported_source'
        ? t('history.purchaseState.unsupported_source')
        : t('history.purchaseNoItems'),
  )
  const orderLabel = $derived(
    enrichment.source === 'amazon'
      ? t('history.amazonOrder')
      : enrichment.source === 'bestbuy'
        ? t('history.bestBuyOrder')
        : enrichment.source === 'target'
          ? t('history.targetOrder')
          : t('history.purchaseOrder'),
  )
</script>

<div class="purchase-enrichment">
  <div class="purchase-enrichment-head">
    <button
      type="button"
      class="purchase-enrichment-toggle"
      onclick={() => (open = !open)}
      aria-expanded={open}
    >
      <span class="purchase-enrichment-badge">{orderLabel}</span>
      {#if showReturnBadge && returnInfo}
        <span
          class="purchase-enrichment-return-badge purchase-enrichment-return-badge--{returnInfo.status}{returnInfo.isRefundCredit ? ' is-refund-credit' : ''}"
        >
          {returnInfo.isRefundCredit
            ? t('history.purchaseRefundCredit')
            : t(returnStatusLabelKey(returnInfo.status))}
        </span>
      {/if}
      {#if showItemCount}
        <span class="text-muted text-sm">{t('history.purchaseItemCount', { count: items.length })}</span>
      {/if}
      <span class="purchase-enrichment-chevron">{open ? '▾' : '▸'}</span>
    </button>
    {#if enrichment.detailUrl}
      <a
        class="purchase-enrichment-link"
        href={enrichment.detailUrl}
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => e.stopPropagation()}
      >
        {t('history.purchaseViewOrder')} ↗
      </a>
    {/if}
  </div>
  {#if open}
    <div class="purchase-enrichment-body">
      <dl class="purchase-enrichment-meta-list">
        {#if chargeDate}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseChargeDate')}</dt>
            <dd>{chargeDate}</dd>
          </div>
        {/if}
        {#if enrichment.orderDate}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseOrderDate')}</dt>
            <dd>{enrichment.orderDate}</dd>
          </div>
        {/if}
        {#if enrichment.status}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseOrderStatus')}</dt>
            <dd>{enrichment.status}</dd>
          </div>
        {/if}
        {#if returnInfo?.eventDate}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseReturnDate')}</dt>
            <dd>{returnInfo.eventDate}</dd>
          </div>
        {/if}
        {#if returnInfo?.refundAmount != null}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseRefundAmount')}</dt>
            <dd>{moneyPrecise(returnInfo.refundAmount, privacy)}</dd>
          </div>
        {/if}
        {#if returnInfo?.relatedOrderId}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseRelatedOrder')}</dt>
            <dd>{returnInfo.relatedOrderId}</dd>
          </div>
        {/if}
        {#if enrichment.orderId}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseOrderId')}</dt>
            <dd>{enrichment.orderId}</dd>
          </div>
        {/if}
        {#if enrichment.orderTotal != null}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseOrderTotal')}</dt>
            <dd>{moneyPrecise(enrichment.orderTotal, privacy)}</dd>
          </div>
        {/if}
      </dl>
      {#if items.length > 0}
        {#if allowLineItems}
          {#if !hasItemPrices}
            <p class="purchase-enrichment-note text-sm">{t('history.purchaseNoItemPrices')}</p>
          {/if}
          <ul class="purchase-enrichment-items">
            {#each items as item (item.asin || item.detailUrl || item.title)}
              {@const imgSrc = lineItemImageSrc(item)}
              <li>
                {#if imgSrc && !privacy}
                  <img
                    class="purchase-enrichment-item-img"
                    src={imgSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                  />
                {/if}
                <div class="purchase-enrichment-item-main">
                  {#if item.detailUrl}
                    <a href={item.detailUrl} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  {:else}
                    <span>{item.title}</span>
                  {/if}
                  {#if (item.quantity ?? 1) > 1}
                    <span class="purchase-enrichment-item-qty">×{item.quantity}</span>
                  {/if}
                </div>
                {#if item.price != null}
                  <span class="purchase-enrichment-item-price">{moneyPrecise(item.price, privacy)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted-note text-sm mb-0">{t('history.purchaseItemsAbove')}</p>
        {/if}
      {:else}
        <p class="muted-note text-sm">{noItemsMessage}</p>
      {/if}
    </div>
  {/if}
</div>
