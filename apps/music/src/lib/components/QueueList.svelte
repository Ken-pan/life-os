<script>
  import { flip } from 'svelte/animate'
  import { dragHandleZone, dragHandle } from 'svelte-dnd-action'
  import {
    player,
    playTracks,
    setQueueOrder,
    moveQueueItem,
    removeFromQueue,
    clearQueue,
    getCurrentTrack,
  } from '$lib/player.svelte.js'
  import {
    appendSimilarToQueue,
    formatRecommendationTags,
  } from '$lib/recommendations.js'
  import { auth } from '$lib/auth.svelte.js'
  import TrackRow from './TrackRow.svelte'
  import Icon from './Icon.svelte'
  import { toast, recDebug, recommendationPreview } from '$lib/ui.svelte.js'
  import { t } from '$lib/i18n/index.js'

  let { compact = false, upNextOnly = false } = $props()

  const flipDurationMs = 200
  let continueLoading = $state(false)
  let dndDragging = $state(false)
  /** @type {HTMLDivElement | null} */
  let listEl = $state(null)

  /** @type {Array<{ id: string, track: import('$lib/types.js').Track, i: number }>} */
  let dndItems = $state([])

  const queueEntries = $derived(
    upNextOnly
      ? player.queue
          .map((track, i) => ({ track, i }))
          .filter(({ i }) => i > player.index)
      : player.queue.map((track, i) => ({ track, i })),
  )

  $effect(() => {
    if (dndDragging) return
    dndItems = queueEntries.map(({ track, i }) => ({
      id: `${track.id}:${i}`,
      track,
      i,
    }))
  })

  $effect(() => {
    if (!listEl || upNextOnly || !player.queue.length) return
    const row = listEl.querySelector('.queue-row--current')
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  /** @param {CustomEvent<{ items: typeof dndItems }>} e */
  function onDndConsider(e) {
    dndDragging = true
    dndItems = e.detail.items
  }

  /** @param {CustomEvent<{ items: typeof dndItems }>} e */
  function onDndFinalize(e) {
    dndDragging = false
    const items = e.detail.items
    dndItems = items
    setQueueOrder(items.map((item) => item.track))
  }

  /** @param {'same_vibe' | 'discovery'} mode */
  async function onContinueSimilar(mode = 'same_vibe') {
    if (continueLoading || !getCurrentTrack()) return
    if (!auth.user) {
      toast(t('nowPlaying.continueSimilarEmpty'), { error: true })
      return
    }
    continueLoading = true
    try {
      const { added } = await appendSimilarToQueue({ mode, limit: 15 })
      if (added > 0) {
        toast(t('nowPlaying.continueSimilarAdded', { count: added }))
      } else {
        recommendationPreview.length = 0
        toast(t('nowPlaying.continueSimilarEmpty'))
      }
    } catch {
      toast(t('nowPlaying.continueSimilarFailed'), { error: true })
    } finally {
      continueLoading = false
    }
  }

  /** @param {number} index @param {-1 | 1} delta */
  function onMoveKey(index, delta) {
    if (delta === -1 && index === 0) return
    if (delta === 1 && index >= player.queue.length - 1) return
    moveQueueItem(index, delta)
  }
</script>

<div
  class="queue-list-wrap"
  class:queue-list-wrap--compact={compact}
  class:queue-list-wrap--up-next={upNextOnly}
>
  <div
    bind:this={listEl}
    class="queue-list"
    class:queue-list--compact={compact}
    class:queue-list--up-next={upNextOnly}
    role="list"
    use:dragHandleZone={{
      items: dndItems,
      flipDurationMs,
      dropTargetStyle: { outline: 'none' },
      type: 'music-queue',
    }}
    onconsider={onDndConsider}
    onfinalize={onDndFinalize}
  >
    {#if upNextOnly}
      <h3 class="queue-section-label">{t('nowPlaying.queueUpNext')}</h3>
    {/if}

    {#each dndItems as item (item.id)}
      <div class="queue-list-entry" animate:flip={{ duration: flipDurationMs }}>
        {#if !upNextOnly && item.i === player.index}
          <h3 class="queue-section-label">{t('nowPlaying.queueNowPlaying')}</h3>
        {/if}
        {#if !upNextOnly && item.i === player.index + 1 && player.index < player.queue.length - 1}
          <h3 class="queue-section-label">{t('nowPlaying.queueUpNext')}</h3>
        {/if}

        <div
          class="queue-row"
          class:queue-row--current={!upNextOnly && item.i === player.index}
          data-queue-index={item.i}
          role="listitem"
        >
          <button
            type="button"
            class="queue-drag-handle"
            use:dragHandle
            aria-label={t('nowPlaying.reorder')}
          >
            <Icon name="grip-vertical" size={16} />
          </button>

          <TrackRow
            track={item.track}
            tracks={player.queue}
            index={item.i}
            showLike={false}
            queueMode
          />

          <div class="queue-move-controls">
            <button
              type="button"
              class="queue-move-btn"
              aria-label={t('nowPlaying.moveUp')}
              disabled={item.i === 0}
              onclick={() => moveQueueItem(item.i, -1)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onMoveKey(item.i, -1)
              }}
            >
              <Icon name="chevron-up" size={16} />
            </button>
            <button
              type="button"
              class="queue-move-btn"
              aria-label={t('nowPlaying.moveDown')}
              disabled={item.i === player.queue.length - 1}
              onclick={() => moveQueueItem(item.i, 1)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onMoveKey(item.i, 1)
              }}
            >
              <Icon name="chevron-down" size={16} />
            </button>
            <button
              type="button"
              class="queue-move-btn"
              aria-label={t('nowPlaying.remove')}
              onclick={() => removeFromQueue(item.i)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      </div>
    {/each}

    {#if upNextOnly && !queueEntries.length}
      <p class="queue-up-next-empty">{t('nowPlaying.queueUpNextEmpty')}</p>
    {:else if !player.queue.length}
      <p class="empty-state">{t('nowPlaying.queueEmpty')}</p>
    {/if}
  </div>

  {#if player.queue.length && !compact}
    <div class="queue-list-foot">
      <button
        class="btn-secondary queue-clear-btn"
        type="button"
        onclick={clearQueue}
      >
        {t('nowPlaying.clearQueue')}
      </button>
      <div class="queue-list-foot-actions">
        <button
          class="btn-secondary queue-continue-btn"
          type="button"
          disabled={continueLoading || !getCurrentTrack()}
          onclick={() => onContinueSimilar('same_vibe')}
          title={t('nowPlaying.continueSimilarHint')}
        >
          {continueLoading
            ? t('nowPlaying.continueSimilarLoading')
            : t('nowPlaying.continueSimilar')}
        </button>
        <button
          class="btn-secondary queue-play-btn"
          type="button"
          onclick={() => playTracks(player.queue, player.index)}
        >
          {t('nowPlaying.playFromCurrent')}
        </button>
      </div>
    </div>
  {/if}

  {#if recDebug.enabled && recommendationPreview.length && !compact}
    <section
      class="rec-preview"
      aria-label={t('nowPlaying.recDebugPreviewTitle')}
    >
      <h3 class="rec-preview-title">{t('nowPlaying.recDebugPreviewTitle')}</h3>
      <ul class="rec-preview-list">
        {#each recommendationPreview as pick (pick.track.id)}
          <li class="rec-preview-item">
            <span class="rec-preview-track"
              >{pick.track.title} — {pick.track.artist}</span
            >
            {#if pick.reasons?.length}
              <span class="rec-preview-reasons">{pick.reasons.join(' · ')}</span>
            {/if}
            {#if formatRecommendationTags(pick.matchedTags).length}
              <span class="rec-preview-tags"
                >{formatRecommendationTags(pick.matchedTags).join(' · ')}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .queue-list-wrap {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  .queue-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-2) 0;
  }

  .queue-section-label {
    margin: 0 0 var(--space-2);
    padding: var(--space-2) var(--space-1) 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--np-text-tertiary, var(--t3, var(--text-muted)));
  }

  .queue-section-label:not(:first-child) {
    margin-top: var(--space-3);
  }

  .queue-up-next-empty {
    margin: var(--space-4) 0 0;
    padding: var(--space-3) var(--space-1);
    font-size: var(--text-sm);
    color: var(--np-text-tertiary, var(--t3, var(--text-muted)));
    text-align: center;
  }

  .queue-list-foot {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    flex-shrink: 0;
    padding: var(--space-3) 0 0;
    border-top: 1px solid var(--border);
  }

  .queue-list-foot-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    width: 100%;
  }

  .queue-list-foot .queue-play-btn,
  .queue-list-foot .queue-continue-btn,
  .queue-list-foot .queue-clear-btn {
    min-height: var(--tap-min);
    min-width: 0;
    width: 100%;
  }

  .queue-list-entry {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .queue-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    position: relative;
    min-height: 56px;
    padding: var(--space-1) 0;
    padding-right: var(--space-1);
    border-radius: var(--radius-md);
  }

  .queue-row--current {
    background: color-mix(in srgb, var(--track-accent, var(--accent)) 10%, transparent);
  }

  .queue-row :global(.track-row) {
    min-width: 0;
    border-bottom: none;
    padding: 0;
    min-height: 0;
  }

  .queue-row--current :global(.track-row-title) {
    color: var(--track-accent, var(--accent));
    font-weight: 600;
  }

  .queue-drag-handle {
    display: grid;
    place-items: center;
    width: 28px;
    height: var(--tap-min);
    flex-shrink: 0;
    color: var(--t3, var(--text-muted));
    cursor: grab;
    user-select: none;
    touch-action: none;
    background: none;
    border: none;
    padding: 0;
    opacity: 0.42;
    transition: opacity 160ms ease;
  }

  .queue-row:hover .queue-drag-handle,
  .queue-row:focus-within .queue-drag-handle {
    opacity: 0.88;
  }

  .queue-move-controls {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: var(--space-6);
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--card) 72%, transparent) 28%,
      var(--card) 52%
    );
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }

  .queue-row:hover .queue-move-controls,
  .queue-row:focus-within .queue-move-controls {
    opacity: 1;
    pointer-events: auto;
  }

  .queue-move-btn {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    background: none;
    border: none;
    border-radius: var(--radius-pill);
    color: var(--t3, var(--text-muted));
    padding: 0;
    touch-action: manipulation;
  }

  @media (pointer: coarse) {
    .queue-move-controls {
      opacity: 1;
      pointer-events: auto;
    }
  }

  .queue-list-wrap--compact .queue-list-foot,
  .queue-list-wrap--compact .rec-preview {
    display: none;
  }

  .queue-list-wrap--compact .queue-move-controls {
    display: none;
  }

  .rec-preview {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px dashed var(--border);
    flex-shrink: 0;
  }

  .rec-preview-title {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--t3, var(--text-muted));
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
