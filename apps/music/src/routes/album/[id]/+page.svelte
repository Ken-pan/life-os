<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getTracksByAlbum } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { setPageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js';

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

  $effect(() => {
    setPageChrome({
      title: title || null,
      subtitle: artist || null,
      action:
        tracks.length > 0
          ? { label: t('common.playAlbum'), onClick: () => playTracks(tracks, 0), variant: 'primary' }
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
