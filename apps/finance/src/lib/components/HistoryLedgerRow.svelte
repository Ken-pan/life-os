<script>
  // LedgerRow from HistoryView.tsx.
  import { Pencil, Trash2, MoreHorizontal } from '@lucide/svelte'
  import { t } from '$lib/i18n.svelte.js'
  import {
    signedMoneyPrecise,
    depositDeltaClass,
  } from '$lib/format.js'
  import { toTxnPayload } from '$lib/txnPayload.js'
  import { classifyPurchaseDisplayState } from '../../engine/purchaseEnrichmentDisplay.js'
  import { ledgerAccountColumn, ledgerMetaLine, ledgerTitle } from '../../engine/ledgerDisplay.js'
  import PurchaseEnrichmentBlock from './PurchaseEnrichmentBlock.svelte'
  import LedgerProductStrip from './LedgerProductStrip.svelte'
  import MerchantLogo from './MerchantLogo.svelte'

  const RETAIL_MERCHANT_ONLY_HINT =
    /shopping|grocer|dining|retail|store|market|amazon|target|best\s*buy|walmart|costco|safeway|merchant/i

  /** @param {import('../../engine/transactions.js').Txn} txn @param {string} purchaseState */
  function showMerchantOnlyDetailHint(txn, purchaseState) {
    if (purchaseState !== 'merchant_only') return false
    if (!txn.inSpending || txn.flow !== 'expense') return false
    const hay = `${txn.category} ${txn.merchant}`
    return RETAIL_MERCHANT_ONLY_HINT.test(hay)
  }

  /** @param {(key: string) => string} tl */
  function flowOptions(tl) {
    return [
      { id: 'expense', label: tl('history.flowExpense') },
      { id: 'income', label: tl('history.flowIncome') },
      { id: 'credit_card_payment', label: tl('history.flowCcPayment') },
      { id: 'internal_transfer', label: tl('history.flowTransfer') },
      { id: 'refund_or_reversal', label: tl('history.flowRefund') },
      { id: 'reconcile_adjustment', label: tl('history.flowReconcile') },
    ]
  }

  /** @type {{
   *   txn: import('../../engine/transactions.js').Txn,
   *   privacy: boolean,
   *   purchaseDisplayContext: import('../../engine/purchaseEnrichmentDisplay.js').PurchaseDisplayContext,
   *   purchaseDebugMode: boolean,
   *   editing: boolean,
   *   busy: boolean,
   *   onStartEdit: () => void,
   *   onCancelEdit: () => void,
   *   onSaveEdit: (t: import('../../engine/transactions.js').Txn) => Promise<void>,
   *   onDelete: () => Promise<void>,
   * }} */
  let {
    txn,
    privacy,
    purchaseDisplayContext,
    purchaseDebugMode,
    editing,
    busy,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
  } = $props()

  let merchant = $state(txn.merchant)
  let category = $state(txn.category)
  let account = $state(txn.account)
  /** @type {import('../../engine/transactions.js').FlowType} */
  let flow = $state(txn.flow)
  let amount = $state(String(Math.abs(txn.amount)))
  let date = $state(txn.date)
  let enrichmentOpen = $state(false)
  /** @type {HTMLDialogElement | null} */
  let actionSheetRef = $state(null)

  $effect(() => {
    merchant = txn.merchant
    category = txn.category
    account = txn.account
    flow = txn.flow
    amount = String(Math.abs(txn.amount))
    date = txn.date
  })

  const flowOpts = $derived(flowOptions(t))
  const spend = $derived(txn.inSpending ? -txn.budgetImpact : 0)
  const income = $derived(txn.flow === 'income' ? Math.abs(txn.amount) : 0)
  const signed = $derived(income !== 0 ? income : -spend)
  const dim = $derived(!txn.inSpending && txn.flow !== 'income')
  const display = $derived(classifyPurchaseDisplayState(txn, purchaseDisplayContext))
  const purchaseState = $derived(display.state)
  // FINC.PURCHASE.6.a — show "what I bought" for every linked purchase that has
  // line items, not just high-confidence `clean_enriched`. Uncertain matches
  // (`matched_review`) still surface their products; the review badge + expandable
  // Confirm/Reject let the user resolve the match.
  const hasEnrichmentItems = $derived(
    (txn.purchaseEnrichment?.lineItems?.length ?? 0) > 0,
  )
  const showsProducts = $derived(
    purchaseState === 'clean_enriched' ||
      purchaseState === 'matched_review' ||
      purchaseState === 'return_refund',
  )
  const showProductStrip = $derived(showsProducts && hasEnrichmentItems)
  const showStateBadge = $derived(
    purchaseState === 'matched_review' ||
      purchaseState === 'return_refund' ||
      purchaseState === 'unsupported_source',
  )
  const showEnrichmentBlock = $derived(
    showsProducts ||
      (purchaseDebugMode && Boolean(txn.purchaseEnrichment)),
  )
  const showEnrichmentUi = $derived(showProductStrip || showStateBadge || showEnrichmentBlock)
  const stateBadgeLabel = $derived(t(`history.purchaseState.${purchaseState}`))
  const showMerchantOnlyHint = $derived(showMerchantOnlyDetailHint(txn, purchaseState))
  const title = $derived(ledgerTitle(txn))
  const metaLine = $derived(
    ledgerMetaLine(txn, {
      viaImport: (source) => t('history.ledgerViaImport', { source }),
    }),
  )
  const accountCol = $derived(ledgerAccountColumn(txn))

  async function submitEdit() {
    const payload = toTxnPayload({
      date,
      merchant: merchant.trim() || txn.merchant,
      category: category.trim() || 'Uncategorized',
      account: account.trim() || 'Manual',
      flow,
      amount: Number(amount) || 0,
    })
    await onSaveEdit({
      ...txn,
      ...payload,
      month: payload.date.slice(0, 7),
    })
  }
</script>

<div
  class="ledger-row{dim ? ' is-dim' : ''}{showEnrichmentUi ? ' has-enrichment' : ''}"
  role="listitem"
  data-purchase-state={purchaseState}
>
  {#if editing}
    <div class="ledger-row-edit">
      <input class="input" type="date" bind:value={date} />
      <input class="input" bind:value={merchant} />
      <input class="input" bind:value={category} />
      <input class="input" bind:value={account} />
      <select class="input" bind:value={flow}>
        {#each flowOpts as o (o.id)}
          <option value={o.id}>{o.label}</option>
        {/each}
      </select>
      <input class="input" type="number" step="0.01" min="0" bind:value={amount} />
      <div class="flex-row-tight">
        <button type="button" class="btn ghost" disabled={busy} onclick={() => void submitEdit()}>
          {t('history.save')}
        </button>
        <button type="button" class="btn ghost" disabled={busy} onclick={onCancelEdit}>
          {t('history.cancel')}
        </button>
      </div>
    </div>
  {:else}
    <span class="lr-date">{txn.date.slice(5)}</span>
    <MerchantLogo merchant={txn.merchant} />
    <div class="lr-main">
      <div class="lr-main-head">
        <span class="lr-title">{title}</span>
        <span class="lr-amt lr-amt--inline {depositDeltaClass(signed)}">
          {signed === 0 ? '—' : signedMoneyPrecise(signed, privacy)}
        </span>
      </div>
      {#if metaLine}<span class="lr-meta">{metaLine}</span>{/if}
      {#if showMerchantOnlyHint}
        <span class="lr-merchant-only-hint muted-note text-sm">{t('history.merchantOnlyNoDetail')}</span>
      {/if}
      {#if showEnrichmentUi && txn.purchaseEnrichment}
        {#if showStateBadge}
          <span class="purchase-state-badge purchase-state-badge--{purchaseState}">
            {stateBadgeLabel}
            {#if purchaseDebugMode && purchaseState === 'matched_review' && txn.purchaseEnrichment.matchConfidence}
              <span class="purchase-state-confidence">{txn.purchaseEnrichment.matchConfidence}</span>
            {/if}
          </span>
        {/if}
        {#if showProductStrip && !enrichmentOpen}
          <LedgerProductStrip enrichment={txn.purchaseEnrichment} {privacy} />
        {/if}
        {#if showEnrichmentBlock}
          <PurchaseEnrichmentBlock
            enrichment={txn.purchaseEnrichment}
            {privacy}
            chargeDate={txn.date}
            compact
            displayState={purchaseState}
            showLineItemsInBody={false}
            debugMode={purchaseDebugMode}
            transactionId={txn.id}
            reviewEnabled={purchaseState === 'matched_review'}
            onOpenChange={(v) => (enrichmentOpen = v)}
          />
        {/if}
      {/if}
    </div>
    {#if accountCol}
      <span class="lr-acct text-muted">{accountCol}</span>
    {:else}
      <span class="lr-acct lr-acct--empty" aria-hidden="true"></span>
    {/if}
    <div class="lr-right">
      <span class="lr-amt lr-amt--stacked {depositDeltaClass(signed)}">
        {signed === 0 ? '—' : signedMoneyPrecise(signed, privacy)}
      </span>
      {#if txn.id}
        <span class="lr-actions lr-actions--desktop">
          <button
            type="button"
            class="icon-btn ledger-icon-btn"
            disabled={busy}
            onclick={onStartEdit}
            aria-label={t('history.edit')}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-btn ledger-icon-btn ledger-icon-btn--danger"
            disabled={busy}
            onclick={() => void onDelete()}
            aria-label={t('history.delete')}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </span>
        <button
          type="button"
          class="icon-btn ledger-icon-btn lr-actions-trigger"
          disabled={busy}
          aria-label={t('history.rowActions')}
          aria-haspopup="dialog"
          onclick={() => actionSheetRef?.showModal()}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
        <dialog
          bind:this={actionSheetRef}
          class="ledger-action-sheet"
          onclick={(e) => {
            if (e.target === actionSheetRef) actionSheetRef?.close()
          }}
        >
          <div class="ledger-action-sheet-panel" role="document">
            <button
              type="button"
              class="ledger-action-sheet-item"
              disabled={busy}
              onclick={() => {
                actionSheetRef?.close()
                onStartEdit()
              }}
            >
              {t('history.edit')}
            </button>
            <button
              type="button"
              class="ledger-action-sheet-item ledger-action-sheet-item--danger"
              disabled={busy}
              onclick={() => {
                actionSheetRef?.close()
                void onDelete()
              }}
            >
              {t('history.delete')}
            </button>
            <button
              type="button"
              class="ledger-action-sheet-item ledger-action-sheet-item--cancel"
              onclick={() => actionSheetRef?.close()}
            >
              {t('history.cancel')}
            </button>
          </div>
        </dialog>
      {/if}
    </div>
  {/if}
</div>
