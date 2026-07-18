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
