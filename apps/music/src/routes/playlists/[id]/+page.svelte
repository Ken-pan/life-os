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
