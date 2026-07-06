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
    setPageChrome({
      title: name || null,
      action:
        tracks.length > 0
          ? { label: t('common.playAll'), onClick: () => playTracks(tracks, 0), variant: 'primary' }
          : null
    });
    return () => resetPageChrome();
  });
</script>

<div class="wrap">
  {#each tracks as track, i (track.id)}
    <TrackRow {track} {tracks} index={i} />
  {/each}
</div>
