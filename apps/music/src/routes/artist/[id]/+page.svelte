<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getTracksByArtist } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { setPageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js';

  const artistKey = $derived(decodeURIComponent(page.params.id));
  let name = $state('');
  let tracks = $state([]);

  $effect(() => {
    (async () => {
      tracks = await getTracksByArtist(artistKey);
      name = tracks[0]?.artist || '艺术家';
    })();
  });

  $effect(() => {
    setPageChrome({ title: name || null });
    return () => resetPageChrome();
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
