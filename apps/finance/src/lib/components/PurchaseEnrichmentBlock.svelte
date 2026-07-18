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
  import {
    loadReviewState,
    resolveDecide,
    resolveUndo,
  } from '$lib/purchaseReviewClient.js'
  import { ReviewActions } from '@life-os/platform-web/svelte/review-card'

  let {
    enrichment,
    privacy,
    chargeDate,
    // 这笔银行扣款的金额 —— 评审时和订单总额并排比,给用户判断依据(FINC.PURCHASE.6.a closure)
    chargeAmount = null,
    compact = false,
    showLineItemsInBody = true,
    displayState = 'clean_enriched',
    debugMode = false,
    onOpenChange,
    // FINC.PURCHASE.6.a — pass a transaction id + reviewEnabled to surface
    // Confirm / Reject / Undo for the transaction↔order association.
    transactionId = null,
    reviewEnabled = false,
    // FINC.PURCHASE.6b — real negative refund txns linked to this purchase.
    /** @type {import('../../engine/refundLinks.js').RefundLink[]} */
    refundLinks = [],
  } = $props()

  // 评审态(matched_review):这正是最需要证据的地方,反而是原来把商品明细藏了的地方。
  // 评审时强制展示明细 + 一条「银行扣款 vs 订单总额」并排对比,让用户有据可判。
  const reviewMode = $derived(displayState === 'matched_review')
  const chargeCents = $derived(chargeAmount != null ? Math.round(Math.abs(chargeAmount) * 100) : null)
  const orderCents = $derived(enrichment.orderTotal != null ? Math.round(Math.abs(enrichment.orderTotal) * 100) : null)
  const amountDiffCents = $derived(
    chargeCents != null && orderCents != null ? orderCents - chargeCents : null,
  )
  const amountMatch = $derived(amountDiffCents != null && Math.abs(amountDiffCents) <= 1)

  let open = $state(!compact)

  $effect(() => {
    onOpenChange?.(open)
  })

  const items = $derived(uniqueLineItems(enrichment.lineItems))
  const hasItemPrices = $derived(items.some((li) => li.price != null))
  const returnInfo = $derived(enrichment.returnInfo)
  const showReturnBadge = $derived(isReturnLikeEnrichment(returnInfo) || returnInfo?.isRefundCredit)
  const allowLineItems = $derived(
    reviewMode || (displayState === 'clean_enriched' && showLineItemsInBody),
  )
  const showItemCount = $derived(items.length > 0 && (displayState === 'clean_enriched' || reviewMode || debugMode))
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

  // supabase.rpc bound so the pure client helpers stay Supabase-shaped + testable.
  const callRpc = (name, params) => supabase.rpc(name, params)

  async function loadReview() {
    if (!canReview || reviewLoaded) return
    reviewLoaded = true
    reviewStatus = 'loading'
    const state = await loadReviewState(callRpc, transactionId)
    association = state.association
    lastDecisionId = state.lastDecisionId
    reviewStatus = 'idle'
  }

  async function decide(actionType) {
    if (!association || association.state !== 'proposed' || reviewStatus === 'saving')
      return
    const prev = association
    // Optimistic echo — the helper reconciles to server truth (or stale/unknown).
    association = { ...association, state: actionType === 'confirm' ? 'confirmed' : 'rejected' }
    reviewStatus = 'saving'
    const patch = await resolveDecide(callRpc, {
      prev,
      actionType,
      actionKey: crypto.randomUUID(),
      transactionId,
    })
    association = patch.association
    lastDecisionId = patch.lastDecisionId
    reviewStatus = patch.status
    reviewLoaded = true
    if (patch.openUndo) openUndoWindow()
  }

  async function undo() {
    if (!association || !lastDecisionId || reviewStatus === 'saving') return
    const prev = association
    reviewStatus = 'saving'
    const patch = await resolveUndo(callRpc, {
      prev,
      lastDecisionId,
      actionKey: crypto.randomUUID(),
      transactionId,
    })
    association = patch.association
    lastDecisionId = patch.lastDecisionId
    reviewStatus = patch.status
    reviewLoaded = true
    if (patch.closeUndo) {
      undoVisible = false
      clearUndoTimer()
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
        {#if chargeAmount != null}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.reviewChargeAmount')}</dt>
            <dd>{moneyPrecise(chargeAmount, privacy)}</dd>
          </div>
        {/if}
        {#if enrichment.orderTotal != null}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.purchaseOrderTotal')}</dt>
            <dd>{moneyPrecise(enrichment.orderTotal, privacy)}</dd>
          </div>
        {/if}
        {#if reviewMode && amountDiffCents != null}
          <div class="purchase-enrichment-meta-row" data-amount-match={amountMatch}>
            <dt>{t('history.reviewChargeAmount')} ↔ {t('history.purchaseOrderTotal')}</dt>
            <dd>
              {amountMatch
                ? '✓ ' + t('history.reviewAmountMatch')
                : t('history.reviewAmountDiff', {
                    amount: moneyPrecise(Math.abs(amountDiffCents) / 100, privacy),
                  })}
            </dd>
          </div>
        {/if}
        {#if reviewMode && enrichment.matchConfidence}
          <div class="purchase-enrichment-meta-row">
            <dt>{t('history.reviewConfidence')}</dt>
            <dd>{enrichment.matchConfidence}</dd>
          </div>
        {/if}
      </dl>
      {#if refundLinks.length > 0}
        <div class="purchase-refund-links">
          <span class="purchase-refund-links-title text-sm">{t('history.refundLinkedTitle')}</span>
          <ul class="purchase-refund-links-list">
            {#each refundLinks as link (link.txnId)}
              <li class="purchase-refund-link" data-present={link.present}>
                <span class="purchase-refund-link-amt">
                  {link.present ? '−' : ''}{moneyPrecise(link.amount, privacy)}
                </span>
                <span class="purchase-refund-link-meta text-sm text-muted">
                  {#if link.present}
                    {t('history.refundLinked')}{link.date ? ` · ${link.date}` : ''}
                  {:else}
                    {t('history.refundExpected')}
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
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
          <ReviewActions
            question={association.state === 'proposed' ? t('history.reviewQuestion') : null}
            decisions={association.state === 'proposed'
              ? [
                  { key: 'confirm', label: t('history.reviewConfirm'), tone: 'confirm' },
                  { key: 'reject', label: t('history.reviewReject'), tone: 'reject' },
                ]
              : []}
            onDecide={decide}
            decided={association.state === 'proposed'
              ? null
              : {
                  label:
                    association.state === 'confirmed'
                      ? t('history.reviewConfirmed')
                      : t('history.reviewRejected'),
                  tone: association.state === 'confirmed' ? 'confirm' : 'reject',
                }}
            undoLabel={undoVisible ? t('history.reviewUndo') : null}
            onUndo={undo}
            note={reviewStatus === 'saving'
              ? { text: t('history.reviewSaving'), tone: 'muted' }
              : reviewStatus === 'stale'
                ? { text: t('history.reviewStale'), tone: 'warn' }
                : reviewStatus === 'unknown'
                  ? { text: t('history.reviewUnknown'), tone: 'warn' }
                  : null}
            busy={reviewStatus === 'saving'}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>
