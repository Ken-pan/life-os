<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { getSpeedDialEditCells, speedDialReasonKey } from '$lib/speedDial.js';
  import {
    saveSpeedDialBoardOrder,
    unpinSpeedDialItem,
    hideSpeedDialItem,
    pinSpeedDialItem
  } from '$lib/speedDialStore.js';
  import { setPageChrome } from '$lib/pageChrome.svelte.js';

  /** @type {import('$lib/speedDial.js').SpeedDialCell[]} */
  let cells = $state([]);

  onMount(async () => {
    cells = await getSpeedDialEditCells();
  });

  $effect(() => {
    setPageChrome({
      actions: [
        {
          label: t('home.speedDialAdd'),
          href: '/search',
          variant: 'primary'
        }
      ]
    });
  });

  async function reload() {
    cells = await getSpeedDialEditCells();
  }

  /** @param {number} index @param {-1 | 1} delta */
  async function move(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= cells.length) return;
    const copy = [...cells];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    cells = copy;
    await saveSpeedDialBoardOrder(copy);
  }

  /** @param {import('$lib/speedDial.js').SpeedDialCell} cell @param {number} index */
  async function onPin(cell, index) {
    await pinSpeedDialItem(cell.entityType, cell.entityId, index);
    await reload();
  }

  /** @param {import('$lib/speedDial.js').SpeedDialCell} cell */
  async function onRemove(cell) {
    if (cell.pinned) await unpinSpeedDialItem(cell.id);
    else await hideSpeedDialItem(cell.id);
    await reload();
  }

  /** @param {string | undefined} reason */
  function reasonLabel(reason) {
    const key = speedDialReasonKey(reason);
    return key ? t(key) : '';
  }
</script>

<div class="wrap speed-dial-edit-page">
  <p class="speed-dial-edit-hint">{t('home.speedDialEditHint')}</p>

  <ol class="speed-dial-edit-list">
    {#each cells as cell, index (cell.id)}
      <li class="speed-dial-edit-row">
        <span class="speed-dial-edit-pos">{index + 1}</span>
        <TrackArt artUrl={cell.coverUrls[0]} seed={cell.coverSeeds[0] || cell.id} class="speed-dial-edit-art" />
        <div class="speed-dial-edit-copy">
          <div class="speed-dial-edit-title">{cell.title}</div>
          <div class="speed-dial-edit-sub">
            {cell.subtitle}
            {#if reasonLabel(cell.reason)}
              <span class="speed-dial-edit-reason">· {reasonLabel(cell.reason)}</span>
            {/if}
          </div>
        </div>
        <div class="speed-dial-edit-actions">
          <button type="button" class="speed-dial-edit-btn" aria-label={t('nowPlaying.moveUp')} disabled={index === 0} onclick={() => move(index, -1)}>
            <Icon name="chevron-up" size={16} />
          </button>
          <button type="button" class="speed-dial-edit-btn" aria-label={t('nowPlaying.moveDown')} disabled={index >= cells.length - 1} onclick={() => move(index, 1)}>
            <Icon name="chevron-down" size={16} />
          </button>
          {#if !cell.pinned}
            <button type="button" class="speed-dial-edit-btn" onclick={() => onPin(cell, index)}>{t('home.speedDialPin')}</button>
          {/if}
          <button type="button" class="speed-dial-edit-btn speed-dial-edit-btn--danger" onclick={() => onRemove(cell)}>{t('home.speedDialRemove')}</button>
        </div>
      </li>
    {/each}
  </ol>
</div>

<style>
  .speed-dial-edit-hint {
    margin: 0 0 var(--space-4);
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .speed-dial-edit-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .speed-dial-edit-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--card);
  }

  .speed-dial-edit-pos {
    width: 20px;
    text-align: center;
    font-family: var(--mono);
    font-size: var(--text-sm);
    color: var(--t3, var(--text-muted));
  }

  .speed-dial-edit-row :global(.speed-dial-edit-art) {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .speed-dial-edit-copy {
    flex: 1;
    min-width: 0;
  }

  .speed-dial-edit-title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .speed-dial-edit-sub {
    font-size: var(--text-sm);
    color: var(--t3, var(--text-muted));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .speed-dial-edit-reason {
    color: var(--t2, var(--text-secondary));
  }

  .speed-dial-edit-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .speed-dial-edit-btn {
    border: 1px solid var(--border);
    background: transparent;
    color: inherit;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .speed-dial-edit-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .speed-dial-edit-btn--danger {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  }
  @media (--life-os-mobile) {
    .speed-dial-edit-row {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .speed-dial-edit-actions {
      width: 100%;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  }
</style>
