<script>
  import {
    player,
    playTracks,
    reorderQueue,
    moveQueueItem,
    removeFromQueue,
    clearQueue,
    getCurrentTrack
  } from '$lib/player.svelte.js';
  import { appendSimilarToQueue, formatRecommendationTags } from '$lib/recommendations.js';
  import { recommendationPreview } from '$lib/ui.svelte.js';
  import { auth } from '$lib/auth.svelte.js';
  import TrackRow from './TrackRow.svelte';
  import Icon from './Icon.svelte';
  import { toast } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';

  let { compact = false } = $props();
  let dragFrom = $state(null);
  /** @type {number | null} */
  let touchFrom = $state(null);
  let continueLoading = $state(false);

  /** @param {'same_vibe' | 'discovery'} mode */
  async function onContinueSimilar(mode = 'same_vibe') {
    if (continueLoading || !getCurrentTrack()) return;
    if (!auth.user) {
      toast(t('nowPlaying.continueSimilarEmpty'), { error: true });
      return;
    }
    continueLoading = true;
    try {
      const { added } = await appendSimilarToQueue({ mode, limit: 15 });
      if (added > 0) {
        toast(t('nowPlaying.continueSimilarAdded', { count: added }));
      } else {
        recommendationPreview.length = 0;
        toast(t('nowPlaying.continueSimilarEmpty'));
      }
    } catch {
      toast(t('nowPlaying.continueSimilarFailed'), { error: true });
    } finally {
      continueLoading = false;
    }
  }

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
      class="btn-secondary queue-continue-btn"
      type="button"
      disabled={continueLoading || !getCurrentTrack()}
      onclick={() => onContinueSimilar('same_vibe')}
      title={t('nowPlaying.continueSimilarHint')}
    >
      {continueLoading ? t('nowPlaying.continueSimilarLoading') : t('nowPlaying.continueSimilar')}
    </button>
    <button
      class="btn-secondary queue-play-btn"
      type="button"
      onclick={() => playTracks(player.queue, player.index)}
    >
      {t('nowPlaying.playFromCurrent')}
    </button>
  </div>
{/if}

{#if recommendationPreview.length && !compact}
  <section class="rec-preview" aria-label={t('nowPlaying.recPreviewTitle')}>
    <h3 class="rec-preview-title">{t('nowPlaying.recPreviewTitle')}</h3>
    <ul class="rec-preview-list">
      {#each recommendationPreview as pick (pick.track.id)}
        <li class="rec-preview-item">
          <span class="rec-preview-track">{pick.track.title} — {pick.track.artist}</span>
          {#if pick.reasons?.length}
            <span class="rec-preview-reasons">{pick.reasons.join(' · ')}</span>
          {/if}
          {#if formatRecommendationTags(pick.matchedTags).length}
            <span class="rec-preview-tags">{formatRecommendationTags(pick.matchedTags).join(' · ')}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
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
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) 0 0;
    border-top: 1px solid var(--border);
  }

  .queue-list-foot .queue-play-btn,
  .queue-list-foot .queue-continue-btn {
    flex: 1;
    min-width: 7rem;
  }

  .queue-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    position: relative;
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
    opacity: 0.35;
    transition: opacity 160ms ease;
  }

  .queue-row:hover .queue-drag-handle,
  .queue-row:focus-within .queue-drag-handle {
    opacity: 0.72;
  }

  .queue-move-controls {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--tap-spacing);
    flex-shrink: 0;
    padding-right: 2px;
    opacity: 0;
    transition: opacity 160ms ease;
  }

  .queue-row:hover .queue-move-controls,
  .queue-row:focus-within .queue-move-controls {
    opacity: 1;
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

  .rec-preview {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .rec-preview-title {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--t2, var(--text-muted));
  }

  .rec-preview-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .rec-preview-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--text-sm);
  }

  .rec-preview-track {
    color: var(--text);
    font-weight: 500;
  }

  .rec-preview-reasons {
    color: var(--track-accent, var(--accent));
    font-size: var(--text-xs);
  }

  .rec-preview-tags {
    color: var(--t3, var(--text-muted));
    font-size: var(--text-xs);
  }
</style>
