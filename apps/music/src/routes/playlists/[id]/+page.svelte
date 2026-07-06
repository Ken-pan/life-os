<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { db, getPlaylistTracks } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { setPageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js';

  const id = $derived(page.params.id);
  let name = $state('');
  let tracks = $state([]);

  $effect(() => {
    if (!id) return;
    (async () => {
      const pl = await db.playlists.get(id);
      name = pl?.name || '歌单';
      tracks = await getPlaylistTracks(id);
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
