<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getLikedTracks } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { librarySignals } from '$lib/state.svelte.js';
  import { setPageChrome } from '$lib/pageChrome.svelte.js';

  let tracks = $state([]);

  async function loadLiked() {
    tracks = await getLikedTracks();
  }

  onMount(() => {
    loadLiked();
  });

  $effect(() => {
    void librarySignals.epoch;
    if (librarySignals.epoch > 0) loadLiked();
  });

  $effect(() => {
    setPageChrome({
      action:
        tracks.length > 0
          ? { label: t('common.playAll'), onClick: () => playTracks(tracks, 0), variant: 'primary' }
          : null
    });
  });
</script>

<div class="wrap">
  {#if tracks.length}
    {#each tracks as track, i (track.id)}
      <TrackRow {track} {tracks} index={i} />
    {/each}
  {:else}
    <div class="empty-state">
      <p class="empty-state-title">{t('liked.empty')}</p>
      <p class="empty-state-hint">{t('liked.emptyHint')}</p>
    </div>
  {/if}
</div>
