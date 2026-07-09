<script>
  // Port of SnapshotPicker from src/components/stocks/SnapshotPicker.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { money } from '$lib/format.js'
  import { snapshotAsOfLabel } from '../../../engine/holdingsPortfolio'

  /** @type {{
   *   snapshots: import('../../types.js').HoldingsSnapshot[],
   *   activeId: string | null,
   *   privacy: boolean,
   *   onSelect: (id: string) => void,
   *   onDelete?: (id: string) => void,
   * }} */
  let { snapshots, activeId, privacy, onSelect, onDelete } = $props()

  const active = $derived(snapshots.find((s) => s.id === activeId) ?? snapshots[0])
  const canDelete = $derived(snapshots.length > 1)
</script>

{#if snapshots.length > 0}
  <div class="card">
    <div class="section-head">
      <h3 class="flush">{t('stocks.snapshot.historyTitle')}</h3>
      {#if onDelete && active}
        <button
          class="btn ghost"
          disabled={!canDelete}
          title={canDelete ? t('stocks.snapshot.deleteTitle') : t('stocks.snapshot.keepOneTitle')}
          onclick={() => {
            if (!canDelete) return
            if (!window.confirm(t('stocks.snapshot.deleteConfirm'))) return
            onDelete(active.id)
          }}
        >
          {t('stocks.snapshot.deleteCurrent')}
        </button>
      {/if}
    </div>
    <div class="seg wrap">
      {#each snapshots as s (s.id)}
        <button
          class={active?.id === s.id ? 'active' : ''}
          onclick={() => onSelect(s.id)}
        >
          {snapshotAsOfLabel(s)}
        </button>
      {/each}
    </div>
    {#if active}
      <p class="muted-note mb-0">
        {active.accountLabel} · {money(active.holdingsMarketValue, privacy)} · {active.positionCount}
        {t('stocks.snapshot.positionsSuffix')} · {t('stocks.snapshot.readOnlyNote')}
      </p>
    {/if}
  </div>
{/if}
