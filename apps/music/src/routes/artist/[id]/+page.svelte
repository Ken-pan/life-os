<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import DetailHero from '$lib/components/DetailHero.svelte';
  import { getTracksByArtist } from '$lib/db.js';
  import { playTracks } from '$lib/player.svelte.js';
  import { shuffleCopy } from '$lib/queueDisplay.js';
  import { librarySignals } from '$lib/state.svelte.js';
  import { setPageChrome, resetPageChrome } from '$lib/pageChrome.svelte.js';

  const artistKey = $derived(decodeURIComponent(page.params.id));
  let name = $state('');
  let tracks = $state([]);

  const totalDuration = $derived(
    tracks.reduce((sum, tr) => sum + (tr.duration || 0), 0)
  );
  const monogram = $derived((name || '?').slice(0, 1));

  /** Tracks grouped by album, preserving first-seen order. */
  const albums = $derived.by(() => {
    /** @type {Map<string, { key: string, album: string, tracks: any[] }>} */
    const map = new Map();
    for (const tr of tracks) {
      const key = tr.albumKey || tr.album || '未知专辑';
      let group = map.get(key);
      if (!group) {
        group = { key, album: tr.album || '未知专辑', tracks: [] };
        map.set(key, group);
      }
      group.tracks.push(tr);
    }
    return [...map.values()];
  });

  async function loadArtist() {
    tracks = await getTracksByArtist(artistKey);
    name = tracks[0]?.artist || '艺术家';
  }

  $effect(() => {
    artistKey;
    void loadArtist();
  });

  $effect(() => {
    void librarySignals.epoch;
    if (librarySignals.epoch > 0) void loadArtist();
  });

  $effect(() => {
    setPageChrome({ title: name || null });
    return () => resetPageChrome();
  });
</script>

<div class="wrap">
  {#if tracks.length > 0}
    <DetailHero
      kicker={t('artist.title')}
      title={name}
      count={tracks.length}
      totalDuration={totalDuration}
      monogram={monogram}
      onPlay={() => playTracks(tracks, 0)}
      onShuffle={() => playTracks(shuffleCopy(tracks), 0)}
    />

    {#each albums as group (group.key)}
      <section class="artist-album-group">
        {#if albums.length > 1}
          <a
            class="artist-album-heading"
            href={`/album/${encodeURIComponent(group.key)}`}
          >
            {group.album}
          </a>
        {/if}
        {#each group.tracks as track, i (track.id)}
          <TrackRow
            {track}
            tracks={group.tracks}
            index={i}
            subtitle={albums.length > 1 ? 'none' : 'album'}
          />
        {/each}
      </section>
    {/each}
  {/if}
</div>

<style>
  .artist-album-group {
    margin-top: var(--space-4);
  }

  .artist-album-heading {
    display: inline-block;
    font-family: var(--disp, var(--font-brand));
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--t1, var(--text));
    text-decoration: none;
    margin: 0 0 var(--space-1) var(--space-1);
  }

  .artist-album-heading:hover {
    text-decoration: underline;
  }
</style>
