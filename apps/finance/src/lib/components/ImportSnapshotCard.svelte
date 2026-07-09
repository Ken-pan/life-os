<script>
  // Port of src/components/stocks/ImportSnapshotCard.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore } from '$lib/finance.svelte.js'
  import { money, signedMoney } from '$lib/format.js'
  import { parseHoldingsSnapshotJson } from '../../engine/holdings.js'
  import { quoteSafeToSpend } from '@life-os/finance-core/copy/terminology'

  /** @type {{
   *   accounts: import('../../types.js').Account[],
   *   privacy: boolean,
   *   brokerageAccounts: import('../../types.js').Account[],
   *   onImported?: (snapshot: import('../../types.js').HoldingsSnapshot) => void,
   *   compact?: boolean,
   * }} */
  let { accounts, privacy, brokerageAccounts, onImported, compact = false } = $props()

  const store = getFinanceStore()
  let error = $state(null)
  let warnings = $state([])
  /** @type {import('../../types.js').HoldingsSnapshot | null} */
  let preview = $state(null)

  /** @param {File | null} file */
  async function importFile(file) {
    if (!file) return
    error = null
    warnings = []
    preview = null
    try {
      const parsed = parseHoldingsSnapshotJson(await file.text(), accounts)
      preview = parsed.snapshot
      warnings = parsed.warnings
    } catch (e) {
      error = e instanceof Error ? e.message : t('stocks.import.parseError')
    }
  }

  function confirm() {
    if (!preview) return
    const linked = brokerageAccounts.find((a) => a.id === preview.accountId)
    const snapshot = {
      ...preview,
      accountId: linked?.id ?? preview.accountId,
      accountLabel: linked?.name ?? preview.accountLabel,
      needsUserConfirmation: false,
    }
    store.upsertHoldingsSnapshot(snapshot)
    onImported?.(snapshot)
    preview = null
  }
</script>

<div class="card{compact ? ' card-compact' : ''}">
  {#if !compact}<h3>{t('stocks.import.title')}</h3>{/if}
  <p class={compact ? 'muted-note' : 'muted-note mt-1-5'}>
    {t('stocks.import.note', { safeToSpend: quoteSafeToSpend() })}
  </p>
  <label class="field">
    <span>{t('stocks.import.selectJson')}</span>
    <input
      class="input"
      type="file"
      accept=".json,application/json"
      onchange={(e) => void importFile(e.currentTarget.files?.[0] ?? null)}
    />
  </label>
  {#if error}<div class="banner">{error}</div>{/if}
  {#if preview}
    <div class="grid gap-3 mt-3">
      <div class="grid kpi-row-4">
        <div class="item">
          <div class="grow">
            <div class="meta">{t('stocks.import.preview.marketValue')}</div>
            <div class="name">{money(preview.holdingsMarketValue, privacy)}</div>
          </div>
        </div>
        <div class="item">
          <div class="grow">
            <div class="meta">{t('stocks.import.preview.positionCount')}</div>
            <div class="name">{preview.positionCount}</div>
          </div>
        </div>
        <div class="item">
          <div class="grow">
            <div class="meta">{t('stocks.import.preview.unrealizedGain')}</div>
            <div class="name">{signedMoney(preview.unrealizedGain ?? 0, privacy)}</div>
          </div>
        </div>
        <div class="item">
          <div class="grow">
            <div class="meta">{t('stocks.import.preview.asOf')}</div>
            <div class="name">
              {preview.asOfDate}
              {preview.asOfTimeLocal
                ? `${t('stocks.import.preview.asOfTimeSeparator')}${preview.asOfTimeLocal}`
                : ''}
            </div>
          </div>
        </div>
      </div>
      <label class="field">
        <span>{t('stocks.import.linkAccount')}</span>
        <select
          class="input"
          value={preview.accountId ?? ''}
          onchange={(e) => {
            preview = { ...preview, accountId: e.currentTarget.value || undefined }
          }}
        >
          <option value="">{t('stocks.import.notLinked')}</option>
          {#each brokerageAccounts as a (a.id)}
            <option value={a.id}>{a.name}</option>
          {/each}
        </select>
      </label>
      {#if warnings.length > 0}
        <ul class="muted-note">
          {#each warnings as w (w)}<li>{w}</li>{/each}
        </ul>
      {/if}
      <div class="row">
        <button type="button" class="btn ghost" onclick={() => (preview = null)}>
          {t('stocks.import.cancel')}
        </button>
        <button type="button" class="btn" onclick={confirm}>{t('stocks.import.confirm')}</button>
      </div>
    </div>
  {/if}
</div>
