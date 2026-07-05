<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import { getAlbumGroups, getArtistGroups } from '$lib/db.js';

  let tab = $state('albums');
  let albums = $state([]);
  let artists = $state([]);

  onMount(async () => {
    albums = await getAlbumGroups();
    artists = await getArtistGroups();
  });
</script>

<div class="wrap">
  <h2 class="page-title">{t('browse.title')}</h2>
  <div class="seg" style="margin: 16px 0">
    <button type="button" class:active={tab === 'albums'} onclick={() => (tab = 'albums')}>{t('browse.albums')}</button>
    <button type="button" class:active={tab === 'artists'} onclick={() => (tab = 'artists')}>{t('browse.artists')}</button>
  </div>

  {#if tab === 'albums'}
    <div class="album-grid">
      {#each albums as album (album.albumKey)}
        <a class="album-card" href={`/album/${encodeURIComponent(album.albumKey)}`}>
          <TrackArt artUrl={album.artUrl} seed={album.albumKey} class="album-card-art" />
          <div class="album-card-title">{album.album}</div>
          <div class="album-card-sub">{album.artist} · {album.trackCount} 首</div>
        </a>
      {/each}
    </div>
  {:else}
    {#each artists as artist (artist.artistKey)}
      <a class="artist-list-item" href={`/artist/${encodeURIComponent(artist.artistKey)}`}>
        <div class="artist-avatar">{artist.artist.slice(0, 1)}</div>
        <div>
          <div class="track-row-title">{artist.artist}</div>
          <div class="track-row-sub">{t('common.songs', { count: artist.trackCount })}</div>
        </div>
      </a>
    {/each}
  {/if}
</div>
