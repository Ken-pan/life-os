<script>
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

  let { compact = false } = $props();
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

  /** @param {TouchEvent} e @param {number} index */
  function onTouchStart(_e, index) {
    touchFrom = index;
  }

  /** @param {TouchEvent} e */
  function onTouchEnd(e) {
    if (touchFrom === null) return;
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest?.('[data-queue-index]');
    if (row instanceof HTMLElement) {
      const to = Number(row.dataset.queueIndex);
      if (Number.isFinite(to)) reorderQueue(touchFrom, to);
    }
    touchFrom = null;
  }
</script>

<div class="queue-list" class:queue-list--compact={compact} role="list">
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

      <TrackRow {track} tracks={player.queue} index={i} showLike={false} compactActions />

      <div class="queue-move-controls">
        <button type="button" class="queue-move-btn" aria-label={t('nowPlaying.moveUp')} disabled={i === 0} onclick={() => moveQueueItem(i, -1)}>
          <Icon name="chevron-up" size={16} />
        </button>
        <button type="button" class="queue-move-btn" aria-label={t('nowPlaying.moveDown')} disabled={i === player.queue.length - 1} onclick={() => moveQueueItem(i, 1)}>
          <Icon name="chevron-down" size={16} />
        </button>
        <button type="button" class="queue-move-btn" aria-label={t('nowPlaying.remove')} onclick={() => removeFromQueue(i)}>
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  {/each}
  {#if !player.queue.length}
    <p class="empty-state">{t('nowPlaying.queueEmpty')}</p>
  {/if}
</div>

{#if player.queue.length && !compact}
  <div class="queue-list-foot">
    <button class="btn-ghost" type="button" onclick={clearQueue}>{t('nowPlaying.clearQueue')}</button>
    <button
      class="btn-secondary queue-play-btn"
      type="button"
      onclick={() => playTracks(player.queue, player.index)}
    >
      {t('nowPlaying.playFromCurrent')}
    </button>
  </div>
{/if}

<style>
  .queue-list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-2) 0;
  }

  .queue-list-foot {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3) 0 0;
    border-top: 1px solid var(--border);
  }

  .queue-list-foot .queue-play-btn {
    flex: 1;
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
    width: var(--tap-min);
    height: var(--tap-min);
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

  .queue-move-controls {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--tap-spacing);
    flex-shrink: 0;
    padding-right: 2px;
  }

  .queue-move-btn {
    width: var(--tap-min);
    height: var(--tap-min);
    display: grid;
    place-items: center;
    background: none;
    border: none;
    border-radius: var(--radius-pill);
    color: var(--t3, var(--text-muted));
    padding: 0;
    touch-action: manipulation;
  }

  .queue-list--compact + .queue-list-foot,
  .queue-list--compact ~ .queue-list-foot {
    display: none;
  }

  .queue-list--compact .queue-move-controls {
    display: none;
  }
</style>
