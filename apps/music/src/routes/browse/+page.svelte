<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import { getAlbumGroups, getArtistGroups, getAllTracks, getPlaylists } from '$lib/db.js';
  import { scheduleLibraryMaintenance } from '$lib/import.js';
  import { librarySignals } from '$lib/state.svelte.js';
  import { setPageChrome } from '$lib/pageChrome.svelte.js';

  let tab = $state('albums');
  let sort = $state('recent');
  let albums = $state([]);
  let artists = $state([]);
  let tracks = $state([]);
  let playlists = $state([]);

  async function loadBrowse() {
    scheduleLibraryMaintenance({ lyrics: false });
    [albums, artists, tracks, playlists] = await Promise.all([
      getAlbumGroups(),
      getArtistGroups(),
      getAllTracks(),
      getPlaylists()
    ]);
  }

  onMount(() => {
    loadBrowse();
  });

  $effect(() => {
    void librarySignals.epoch;
    if (librarySignals.epoch > 0) loadBrowse();
  });

  const sortedAlbums = $derived.by(() => {
    const list = [...albums];
    if (sort === 'alpha') list.sort((a, b) => a.album.localeCompare(b.album, 'zh'));
    return list;
  });

  const sortedArtists = $derived.by(() => {
    const list = [...artists];
    if (sort === 'alpha') list.sort((a, b) => a.artist.localeCompare(b.artist, 'zh'));
    return list;
  });

  const sortedTracks = $derived.by(() => {
    const list = [...tracks];
    if (sort === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    else list.sort((a, b) => b.addedAt - a.addedAt);
    return list;
  });

  $effect(() => {
    setPageChrome({
      actions: [
        {
          label: sort === 'alpha' ? t('browse.sortRecent') : t('browse.sortAlpha'),
          icon: 'arrow-up-down',
          variant: 'ghost',
          onClick: () => {
            sort = sort === 'alpha' ? 'recent' : 'alpha';
          }
        }
      ]
    });
  });
</script>

<div class="wrap browse-page">
  <div class="seg browse-scopes">
    <button type="button" class:active={tab === 'albums'} onclick={() => (tab = 'albums')}>{t('browse.albums')}</button>
    <button type="button" class:active={tab === 'artists'} onclick={() => (tab = 'artists')}>{t('browse.artists')}</button>
    <button type="button" class:active={tab === 'tracks'} onclick={() => (tab = 'tracks')}>{t('browse.tracks')}</button>
    <button type="button" class:active={tab === 'playlists'} onclick={() => (tab = 'playlists')}>{t('browse.playlists')}</button>
  </div>

  {#if tab === 'albums'}
    {#if sortedAlbums.length}
      <div class="life-os-grid life-os-grid--tiles album-grid browse-grid">
        {#each sortedAlbums as album (album.albumKey)}
          <a class="album-card" href={`/album/${encodeURIComponent(album.albumKey)}`}>
            <TrackArt
              artUrl={album.artUrl}
              seed={album.albumKey}
              class="album-card-art"
              lazy
              resolve={{ albumKey: album.albumKey, artist: album.artist, album: album.album }}
            />
            <div class="album-card-title">{album.album}</div>
            <div class="album-card-sub">{album.artist} · {album.trackCount} 首</div>
          </a>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <p class="empty-state-title">{t('common.empty')}</p>
        <p class="empty-state-hint">{t('common.emptyHint')}</p>
        <a class="btn-primary" href="/import">{t('common.import')}</a>
      </div>
    {/if}
  {:else if tab === 'artists'}
    {#if sortedArtists.length}
      <div class="artist-grid browse-grid">
        {#each sortedArtists as artist (artist.artistKey)}
          <a class="artist-grid-item" href={`/artist/${encodeURIComponent(artist.artistKey)}`}>
            <div class="artist-avatar artist-avatar--lg">{artist.artist.slice(0, 1)}</div>
            <div class="album-card-title">{artist.artist}</div>
            <div class="album-card-sub">{t('common.songs', { count: artist.trackCount })}</div>
          </a>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <p class="empty-state-title">{t('common.empty')}</p>
        <a class="btn-primary" href="/import">{t('common.import')}</a>
      </div>
    {/if}
  {:else if tab === 'tracks'}
    {#if sortedTracks.length}
      <div class="browse-track-list">
        {#each sortedTracks as track, i (track.id)}
          <TrackRow {track} tracks={sortedTracks} index={i} compactActions />
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <p class="empty-state-title">{t('common.empty')}</p>
        <a class="btn-primary" href="/import">{t('common.import')}</a>
      </div>
    {/if}
  {:else if playlists.length}
    <div class="life-os-grid life-os-grid--tiles album-grid browse-grid">
      {#each playlists as pl (pl.id)}
        <a class="album-card" href={`/playlists/${pl.id}`}>
          <div class="album-card-art placeholder">♪</div>
          <div class="album-card-title">{pl.name}</div>
        </a>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <p class="empty-state-title">{t('playlists.title')}</p>
      <p class="empty-state-hint">{t('playlists.emptyUserHint')}</p>
      <a class="btn-primary" href="/playlists">{t('playlists.create')}</a>
    </div>
  {/if}
</div>
