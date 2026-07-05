<script>
  import { queueDrawerOpen, closeQueueDrawer } from '$lib/ui.svelte.js';
  import { player, playTracks, reorderQueue } from '$lib/player.svelte.js';
  import TrackRow from './TrackRow.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {number | null} */
  let dragFrom = $state(null);

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
</script>

{#if queueDrawerOpen.open}
  <button type="button" class="sheet-bg" style="display:block;background:rgba(0,0,0,.45)" aria-label={t('common.close')} onclick={closeQueueDrawer}></button>

  <div class="queue-drawer open" role="dialog" aria-modal="true" aria-label={t('nowPlaying.queue')}>
    <div class="queue-drawer-head">
      <strong>{t('nowPlaying.queue')}</strong>
      <button type="button" class="btn-ghost" onclick={closeQueueDrawer}>{t('common.close')}</button>
    </div>
    <div class="queue-drawer-body">
      {#each player.queue as track, i (track.id)}
        <div
          class="queue-row"
          class:queue-row--current={i === player.index}
          draggable="true"
          role="listitem"
          ondragstart={(e) => onDragStart(e, i)}
          ondragover={onDragOver}
          ondrop={(e) => onDrop(e, i)}
        >
          <span class="queue-drag-handle" aria-hidden="true">⠿</span>
          <TrackRow {track} tracks={player.queue} index={i} showLike={false} />
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
  .queue-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
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
  }

  .queue-row:active .queue-drag-handle {
    cursor: grabbing;
  }
</style>
