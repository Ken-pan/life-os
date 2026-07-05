<script>
  import { page } from '$app/state';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getTracksByArtist } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';

  const artistKey = $derived(decodeURIComponent(page.params.id));
  let name = $state('');
  let tracks = $state([]);

  $effect(() => {
    (async () => {
      tracks = await getTracksByArtist(artistKey);
      name = tracks[0]?.artist || '艺术家';
    })();
  });
</script>

<div class="wrap">
  <div class="page-section-head" style="margin-top:0">
    <h2 class="page-title">{name}</h2>
    {#if tracks.length}
      <button class="btn-primary" type="button" onclick={() => playTracks(tracks, 0)}>播放全部</button>
    {/if}
  </div>
  {#each tracks as track, i (track.id)}
    <TrackRow {track} {tracks} index={i} />
  {/each}
</div>
