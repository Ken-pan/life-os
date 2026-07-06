<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getLikedTracks } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';

  let tracks = $state([]);

  onMount(async () => {
    tracks = await getLikedTracks();
  });
</script>

<div class="wrap">
  {#if tracks.length}
    <div class="page-toolbar">
      <button class="btn-primary" type="button" onclick={() => playTracks(tracks, 0)}>{t('common.playAll')}</button>
    </div>
  {/if}
  {#each tracks as track, i (track.id)}
    <TrackRow {track} {tracks} index={i} />
  {/each}
</div>
