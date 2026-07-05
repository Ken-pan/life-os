<script>
  import { page } from '$app/state';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getTracksByAlbum } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';

  const albumKey = $derived(decodeURIComponent(page.params.id));
  let title = $state('');
  let artist = $state('');
  let tracks = $state([]);

  $effect(() => {
    (async () => {
      tracks = await getTracksByAlbum(albumKey);
      title = tracks[0]?.album || '专辑';
      artist = tracks[0]?.artist || '';
    })();
  });
</script>

<div class="wrap">
  <div class="page-section-head" style="margin-top:0">
    <div>
      <h2 class="page-title">{title}</h2>
      <p class="page-sub">{artist}</p>
    </div>
    {#if tracks.length}
      <button class="btn-primary" type="button" onclick={() => playTracks(tracks, 0)}>播放专辑</button>
    {/if}
  </div>
  {#each tracks as track, i (track.id)}
    <TrackRow {track} {tracks} index={i} />
  {/each}
</div>
