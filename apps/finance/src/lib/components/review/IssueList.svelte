<script>
  import { t } from '$lib/i18n.svelte.js'
  import { signedMoney } from '$lib/format.js'
  import { truncate } from './reviewUtils.js'
  import MerchantLogo from '../MerchantLogo.svelte'

  /** @type {{ title: string, rows: import('$lib/engine/realityLoop').NormalizedTransactionDraft[], privacy: boolean }} */
  let { title, rows, privacy } = $props()
</script>

<div class="card card-compact">
  <h3>{title}</h3>
  {#if rows.length === 0}
    <p class="muted-note">{t('review.bucketNone')}</p>
  {:else}
    <div class="list">
      {#each rows as r (r.transactionFingerprint)}
        <div class="item">
          <MerchantLogo merchant={r.merchantName} size={24} />
          <div class="grow">
            <div class="name">{truncate(r.merchantName, 28)}</div>
            <div class="meta">
              {r.occurredOn} · {r.normalizedCategory}
            </div>
          </div>
          <div class="amount">
            {signedMoney(-r.budgetImpact, privacy)}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
