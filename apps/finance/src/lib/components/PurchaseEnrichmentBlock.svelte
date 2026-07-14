<script>
  // 端口自 src/components/PurchaseEnrichmentBlock.tsx。
  import { t } from '$lib/i18n.svelte.js'
  import { moneyPrecise } from '$lib/format.js'
  import { lineItemImageSrc, uniqueLineItems } from '$lib/engine/purchaseEnrichment'
  import {
    isReturnLikeEnrichment,
    returnStatusLabelKey,
  } from '$lib/engine/purchaseReturnStatus'
  import { supabase, isSupabaseConfigured } from '$lib/supabase.js'

  let {
    enrichment,
    privacy,
    chargeDate,
    compact = false,
    showLineItemsInBody = true,
    displayState = 'clean_enriched',
    debugMode = false,
    onOpenChange,
    // FINC.PURCHASE.6.a — pass a transaction id + reviewEnabled to surface
    // Confirm / Reject / Undo for the transaction↔order association.
    transactionId = null,
    reviewEnabled = false,
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

  // ── FINC.PURCHASE.6.a — transaction↔order review actions ───────────────────
  // Lazy: only load review state when the block is expanded, and self-gate on a
  // 404 (no association). Server RPCs are authoritative; the UI keeps an
  // optimistic echo and reconciles from each RPC's returned association.
  const canReview = $derived(
    reviewEnabled && !!transactionId && isSupabaseConfigured,
  )
  let reviewLoaded = $state(false)
  let association = $state(null) // { id, state, association_version }
  let lastDecisionId = $state(null)
  let reviewStatus = $state('idle') // idle | loading | saving | stale | unknown
  let undoVisible = $state(false)
  let undoTimer = null

  function clearUndoTimer() {
    if (undoTimer) {
      clearTimeout(undoTimer)
      undoTimer = null
    }
  }

  function openUndoWindow() {
    // 10s client affordance only — the server decides Undo legality.
    undoVisible = true
    clearUndoTimer()
    undoTimer = setTimeout(() => {
      undoVisible = false
      undoTimer = null
    }, 10_000)
  }

  function applyReviewResult(payload) {
    if (payload?.association) association = payload.association
    if (payload?.decision?.id) lastDecisionId = payload.decision.id
  }

  async function loadReview() {
    if (!canReview || reviewLoaded) return
    reviewLoaded = true
    reviewStatus = 'loading'
    try {
      const { data, error } = await supabase.rpc('purchase_review_get', {
        p_transaction_id: transactionId,
      })
      if (error) throw error
      if (data?.ok && data.association) {
        association = data.association
        const decided = (data.decisions ?? [])
          .filter((d) => d.action_type !== 'undo')
          .at(-1)
        lastDecisionId = decided?.id ?? null
      }
      reviewStatus = 'idle'
    } catch {
      // Missing association / table, or offline: leave review UI hidden.
      association = null
      reviewStatus = 'idle'
    }
  }

  async function decide(actionType) {
    if (!association || association.state !== 'proposed' || reviewStatus === 'saving')
      return
    const prev = association
    // Optimistic echo.
    association = { ...association, state: actionType === 'confirm' ? 'confirmed' : 'rejected' }
    reviewStatus = 'saving'
    try {
      const { data, error } = await supabase.rpc('purchase_review_decide', {
        p_association_id: prev.id,
        p_action_type: actionType,
        p_expected_version: prev.association_version,
        p_action_key: crypto.randomUUID(),
      })
      if (error) throw error
      if (data?.ok) {
        applyReviewResult(data)
        reviewStatus = 'idle'
        openUndoWindow()
      } else if (data?.status === 409) {
        association = prev
        reviewStatus = 'stale'
        reviewLoaded = false
        await loadReview()
      } else {
        association = data?.association ?? prev
        reviewStatus = 'idle'
      }
    } catch {
      // Unknown result — reconcile from server rather than assume failure.
      association = prev
      reviewStatus = 'unknown'
      reviewLoaded = false
      await loadReview()
    }
  }

  async function undo() {
    if (!association || !lastDecisionId || reviewStatus === 'saving') return
    const prev = association
    reviewStatus = 'saving'
    try {
      const { data, error } = await supabase.rpc('purchase_review_undo', {
        p_association_id: prev.id,
        p_target_decision_id: lastDecisionId,
        p_expected_version: prev.association_version,
        p_action_key: crypto.randomUUID(),
      })
      if (error) throw error
      if (data?.ok) {
        applyReviewResult(data)
        lastDecisionId = null
        undoVisible = false
        clearUndoTimer()
        reviewStatus = 'idle'
      } else if (data?.status === 409) {
        reviewStatus = 'stale'
        reviewLoaded = false
        await loadReview()
      } else {
        reviewStatus = 'idle'
      }
    } catch {
      association = prev
      reviewStatus = 'unknown'
      reviewLoaded = false
      await loadReview()
    }
  }

  $effect(() => {
    if (open && canReview && !reviewLoaded) loadReview()
  })
  $effect(() => () => clearUndoTimer())
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

      {#if canReview && association}
        <div class="purchase-review" data-review-state={association.state}>
          {#if association.state === 'proposed'}
            <p class="purchase-review-q text-sm">{t('history.reviewQuestion')}</p>
            <div class="purchase-review-actions">
              <button
                type="button"
                class="purchase-review-btn purchase-review-btn--confirm"
                disabled={reviewStatus === 'saving'}
                onclick={() => decide('confirm')}
              >{t('history.reviewConfirm')}</button>
              <button
                type="button"
                class="purchase-review-btn purchase-review-btn--reject"
                disabled={reviewStatus === 'saving'}
                onclick={() => decide('reject')}
              >{t('history.reviewReject')}</button>
            </div>
          {:else}
            <div class="purchase-review-decided">
              <span class="purchase-review-badge purchase-review-badge--{association.state}">
                {association.state === 'confirmed'
                  ? t('history.reviewConfirmed')
                  : t('history.reviewRejected')}
              </span>
              {#if undoVisible}
                <button
                  type="button"
                  class="purchase-review-btn purchase-review-btn--undo"
                  disabled={reviewStatus === 'saving'}
                  onclick={undo}
                >{t('history.reviewUndo')}</button>
              {/if}
            </div>
          {/if}
          {#if reviewStatus === 'saving'}
            <span class="purchase-review-note text-sm text-muted">{t('history.reviewSaving')}</span>
          {:else if reviewStatus === 'stale'}
            <span class="purchase-review-note purchase-review-note--warn text-sm" role="status">{t('history.reviewStale')}</span>
          {:else if reviewStatus === 'unknown'}
            <span class="purchase-review-note purchase-review-note--warn text-sm" role="status">{t('history.reviewUnknown')}</span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
