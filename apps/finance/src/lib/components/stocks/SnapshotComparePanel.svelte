<script>
  // Port of SnapshotComparePanel from src/components/stocks/SnapshotComparePanel.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { money, signedMoney, depositDeltaClass } from '$lib/format.js'
  import { quoteSafeToSpend } from '../../../copy/terminology'
  import { compareSnapshots, snapshotAsOfLabel } from '../../../engine/holdingsPortfolio'
  import {
    downloadTextFile,
    snapshotCompareFilename,
    snapshotCompareToCsv,
  } from '../../../engine/holdingsExport'

  /** @type {{
   *   snapshots: import('../../types.js').HoldingsSnapshot[],
   *   olderId: string | null,
   *   newerId: string | null,
   *   privacy: boolean,
   *   onOlderChange: (id: string) => void,
   *   onNewerChange: (id: string) => void,
   * }} */
  let { snapshots, olderId, newerId, privacy, onOlderChange, onNewerChange } = $props()

  const older = $derived(snapshots.find((s) => s.id === olderId) ?? snapshots[1])
  const newer = $derived(snapshots.find((s) => s.id === newerId) ?? snapshots[0])
  const diff = $derived(compareSnapshots(older, newer))
</script>

{#if snapshots.length >= 2}
  <div class="card">
    <div class="section-head">
      <h3 class="flush">{t('stocks.snapshot.compare.title')}</h3>
      <div class="flex-row-tight">
        <span class="tag">{t('stocks.snapshot.compare.tag')}</span>
        <button
          type="button"
          class="btn ghost"
          onclick={() => {
            const csv = snapshotCompareToCsv(diff, privacy)
            downloadTextFile(snapshotCompareFilename(diff), csv)
          }}
        >
          {t('stocks.snapshot.compare.exportCsv')}
        </button>
      </div>
    </div>
    <p class="muted-note">
      {t('stocks.snapshot.compare.note', { safeToSpend: quoteSafeToSpend() })}
    </p>
    <div class="grid cols-2 gap-3 mb-3">
      <label class="field">
        <span class="label">{t('stocks.snapshot.compare.olderLabel')}</span>
        <select
          value={older.id}
          onchange={(e) => onOlderChange(e.currentTarget.value)}
          aria-label={t('stocks.snapshot.compare.selectOlderAria')}
        >
          {#each snapshots as s (s.id)}
            <option value={s.id}>{snapshotAsOfLabel(s)}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="label">{t('stocks.snapshot.compare.newerLabel')}</span>
        <select
          value={newer.id}
          onchange={(e) => onNewerChange(e.currentTarget.value)}
          aria-label={t('stocks.snapshot.compare.selectNewerAria')}
        >
          {#each snapshots as s (s.id)}
            <option value={s.id}>{snapshotAsOfLabel(s)}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="list mb-3">
      <div class="kv">
        <span class="k">{diff.olderLabel}</span>
        <span>{money(diff.olderTotal, privacy)}</span>
      </div>
      <div class="kv">
        <span class="k">{diff.newerLabel}</span>
        <span>{money(diff.newerTotal, privacy)}</span>
      </div>
      <div class="kv">
        <span class="k">{t('stocks.snapshot.compare.marketValueChange')}</span>
        <span class={depositDeltaClass(diff.totalDelta)}>
          {signedMoney(diff.totalDelta, privacy)}
        </span>
      </div>
    </div>
    <div class="holdings-watchlist-table life-os-scroll-x">
      <table class="review-table">
        <thead>
          <tr>
            <th>{t('stocks.snapshot.compare.table.symbol')}</th>
            <th>{t('stocks.snapshot.compare.table.older')}</th>
            <th>{t('stocks.snapshot.compare.table.newer')}</th>
            <th>{t('stocks.snapshot.compare.table.delta')}</th>
          </tr>
        </thead>
        <tbody>
          {#each diff.rows as row (row.ticker)}
            <tr>
              <td>
                {row.ticker}
                {#if row.status !== 'both'}
                  <span class="tag warn inline-meta-tight">
                    {row.status === 'new-only'
                      ? t('stocks.snapshot.compare.table.newOnly')
                      : t('stocks.snapshot.compare.table.exited')}
                  </span>
                {/if}
              </td>
              <td>{money(row.olderValue, privacy)}</td>
              <td>{money(row.newerValue, privacy)}</td>
              <td class={depositDeltaClass(row.valueDelta)}>
                {signedMoney(row.valueDelta, privacy)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}
