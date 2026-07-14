<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import DetailHero from '$lib/components/DetailHero.svelte';
  import { getTracksByAlbum } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { shuffleCopy } from '$lib/queueDisplay.js';
  import { librarySignals } from '$lib/state.svelte.js';
  import { setPageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js';

  const albumKey = $derived(decodeURIComponent(page.params.id));
  let title = $state('');
  let artist = $state('');
  let artistKey = $state('');
  let tracks = $state([]);

  const totalDuration = $derived(
    tracks.reduce((sum, tr) => sum + (tr.duration || 0), 0)
  );
  const heroArt = $derived(
    tracks[0]
      ? {
          seed: tracks[0].id,
          resolve: {
            albumKey,
            artist: tracks[0].artist || '',
            album: tracks[0].album || '',
            title: tracks[0].title || ''
          }
        }
      : undefined
  );

  async function loadAlbum() {
    tracks = await getTracksByAlbum(albumKey);
    title = tracks[0]?.album || '专辑';
    artist = tracks[0]?.artist || '';
    artistKey = tracks[0]?.artistKey || '';
  }

  $effect(() => {
    albumKey;
    void loadAlbum();
  });

  $effect(() => {
    void librarySignals.epoch;
    if (librarySignals.epoch > 0) void loadAlbum();
  });

  $effect(() => {
    setPageChrome({ title: title || null, subtitle: artist || null });
    return () => resetPageChrome();
  });
</script>

<div class="wrap">
  {#if tracks.length > 0}
    <DetailHero
      kicker={t('album.title')}
      title={title}
      subtitle={artist}
      subtitleHref={artistKey
        ? `/artist/${encodeURIComponent(artistKey)}`
        : ''}
      count={tracks.length}
      totalDuration={totalDuration}
      art={heroArt}
      onPlay={() => playTracks(tracks, 0)}
      onShuffle={() => playTracks(shuffleCopy(tracks), 0)}
    />
  {/if}

  {#each tracks as track, i (track.id)}
    <TrackRow {track} {tracks} index={i} subtitle="none" />
  {/each}
</div>
