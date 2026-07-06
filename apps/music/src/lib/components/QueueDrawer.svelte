<script>
  import { queueDrawerOpen, closeQueueDrawer } from '$lib/ui.svelte.js';
  import {
    player,
    playTracks,
    reorderQueue,
    moveQueueItem,
    removeFromQueue,
    clearQueue
  } from '$lib/player.svelte.js';
  import TrackRow from './TrackRow.svelte';
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {number | null} */
  let dragFrom = $state(null);
  /** @type {number | null} */
  let touchFrom = $state(null);

  /** @param {DragEvent} e @param {number} index */
  function onDragStart(e, index) {
    dragFrom = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  /** @param {DragEvent} e @param {number} index */
  function onDrop(e, index) {
    e.preventDefault();
    if (dragFrom === null || dragFrom === index) return;
    reorderQueue(dragFrom, index);
    dragFrom = null;
  }

  /** @param {DragEvent} e */
  function onDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function onDragEnd() {
    dragFrom = null;
  }

  /** Touch reorder: drop onto the row under the finger. */
  /** @param {TouchEvent} e @param {number} index */
  function onTouchStart(e, index) {
    touchFrom = index;
  }

  /** @param {TouchEvent} e */
  function onTouchEnd(e) {
    if (touchFrom === null) return;
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const row = el?.closest?.('[data-queue-index]');
    if (row instanceof HTMLElement) {
      const to = Number(row.dataset.queueIndex);
      if (Number.isFinite(to)) reorderQueue(touchFrom, to);
    }
    touchFrom = null;
  }
</script>

{#if queueDrawerOpen.open}
  <button type="button" class="sheet-bg" style="display:block;background:rgba(0,0,0,.45)" aria-label={t('common.close')} onclick={closeQueueDrawer}></button>

  <div class="queue-drawer open" role="dialog" aria-modal="true" aria-label={t('nowPlaying.queue')}>
    <div class="queue-drawer-head">
      <strong>{t('nowPlaying.queue')}</strong>
      <div class="queue-drawer-actions">
        {#if player.queue.length}
          <button type="button" class="btn-ghost" onclick={clearQueue}>{t('nowPlaying.clearQueue')}</button>
        {/if}
        <button type="button" class="btn-ghost" onclick={closeQueueDrawer}>{t('common.close')}</button>
      </div>
    </div>
    <div class="queue-drawer-body" role="list">
      {#each player.queue as track, i (track.id)}
        <div
          class="queue-row"
          class:queue-row--current={i === player.index}
          class:queue-row--dragging={touchFrom === i || dragFrom === i}
          data-queue-index={i}
          role="listitem"
          ondragover={onDragOver}
          ondrop={(e) => onDrop(e, i)}
        >
          <button
            type="button"
            class="queue-drag-handle"
            draggable="true"
            aria-label={t('nowPlaying.reorder')}
            ondragstart={(e) => onDragStart(e, i)}
            ondragend={onDragEnd}
            ontouchstart={(e) => onTouchStart(e, i)}
            ontouchend={onTouchEnd}
          >⠿</button>

          <TrackRow {track} tracks={player.queue} index={i} showLike={false} />

          <div class="queue-move-controls">
            <button
              type="button"
              class="queue-move-btn"
              aria-label={t('nowPlaying.moveUp')}
              disabled={i === 0}
              onclick={() => moveQueueItem(i, -1)}
            >
              <Icon name="chevron-up" size={16} />
            </button>
            <button
              type="button"
              class="queue-move-btn"
              aria-label={t('nowPlaying.moveDown')}
              disabled={i === player.queue.length - 1}
              onclick={() => moveQueueItem(i, 1)}
            >
              <Icon name="chevron-down" size={16} />
            </button>
            <button
              type="button"
              class="queue-move-btn"
              aria-label={t('nowPlaying.remove')}
              onclick={() => removeFromQueue(i)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      {/each}
      {#if !player.queue.length}
        <p class="empty-state">{t('nowPlaying.queueEmpty')}</p>
      {/if}
    </div>
    {#if player.queue.length}
      <div style="padding: 12px 16px">
        <button
          class="btn-primary"
          type="button"
          style="width:100%"
          onclick={() => {
            playTracks(player.queue, player.index);
            closeQueueDrawer();
          }}
        >
          {t('nowPlaying.playFromCurrent')}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .queue-drawer-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .queue-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
  }

  .queue-row--dragging {
    opacity: 0.55;
  }

  .queue-row :global(.track-row) {
    flex: 1;
    min-width: 0;
  }

  .queue-row--current :global(.track-row-title) {
    color: var(--track-accent, var(--accent));
  }

  .queue-drag-handle {
    display: grid;
    place-items: center;
    width: 28px;
    flex-shrink: 0;
    color: var(--t3, var(--text-muted));
    cursor: grab;
    user-select: none;
    font-size: var(--text-sm);
    touch-action: none;
    background: none;
    border: none;
    padding: 0;
  }

  .queue-drag-handle:active {
    cursor: grabbing;
  }

  .queue-move-controls {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    flex-shrink: 0;
    padding-right: 2px;
  }

  .queue-move-btn {
    width: 28px;
    height: 24px;
    display: grid;
    place-items: center;
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--t3, var(--text-muted));
    padding: 0;
  }

  .queue-move-btn:disabled {
    opacity: 0.28;
  }

  .queue-move-btn:not(:disabled):active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--track-accent, var(--accent));
  }
</style>
