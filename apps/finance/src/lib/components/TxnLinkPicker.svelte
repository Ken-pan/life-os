<script>
  // TxnLinkPicker from FutureCashflowView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { rankTxnCandidates } from '../../engine/timeline.js'
  import { signedMoney, depositDeltaClass } from '$lib/format.js'

  /** @type {{
   *   occ: import('../../engine/timeline.js').ExpectedOccurrence,
   *   txns: import('../../engine/transactions.js').Txn[],
   *   privacy: boolean,
   *   onPick: (txnId: string) => void,
   *   onCancel: () => void,
   * }} */
  let { occ, txns, privacy, onPick, onCancel } = $props()

  const candidates = $derived(rankTxnCandidates(occ, txns))
</script>

<div class="oneoff-link-picker">
  {#if candidates.length === 0}
    <p class="muted-note">{t('futureCashflow.noMatchingTxn')}</p>
  {:else}
    <div class="list">
      {#each candidates as txn (txn.id)}
        <button type="button" class="oneoff-link-row" onclick={() => txn.id && onPick(txn.id)}>
          <span class="grow">
            <span class="name">{txn.merchant || txn.category || t('futureCashflow.txnFallback')}</span>
            <span class="meta">{txn.date}</span>
          </span>
          <span class="amount {depositDeltaClass(txn.amount)}">
            {signedMoney(txn.amount, privacy)}
          </span>
        </button>
      {/each}
    </div>
  {/if}
  <button type="button" class="btn ghost mt-2" onclick={onCancel}>{t('futureCashflow.cancel')}</button>
</div>
