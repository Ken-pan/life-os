<script>
  import { queueDrawerOpen, closeQueueDrawer } from '$lib/ui.svelte.js';
  import { player, playTracks } from '$lib/player.svelte.js';
  import TrackRow from './TrackRow.svelte';
  import { t } from '$lib/i18n/index.js';
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
        <TrackRow {track} tracks={player.queue} index={i} showLike={false} />
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
