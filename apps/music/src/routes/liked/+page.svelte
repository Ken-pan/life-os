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
  <div class="page-section-head" style="margin-top:0">
    <h2 class="page-title">{t('liked.title')}</h2>
    {#if tracks.length}
      <button class="btn-primary" type="button" onclick={() => playTracks(tracks, 0)}>播放全部</button>
    {/if}
  </div>
  {#each tracks as track, i (track.id)}
    <TrackRow {track} {tracks} index={i} />
  {/each}
</div>
