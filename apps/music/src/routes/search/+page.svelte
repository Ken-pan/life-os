<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import { searchAll, addRecentSearch } from '$lib/db.js';

  let q = $state(page.url.searchParams.get('q') ?? '');
  let scope = $state('all');
  /** @type {Awaited<ReturnType<typeof searchAll>> | null} */
  let results = $state(null);
  let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

  async function runSearch() {
    results = await searchAll(q, { limit: 50 });
    if (q.trim()) addRecentSearch(q.trim());
  }

  $effect(() => {
    page.url.searchParams.get('q');
    q = page.url.searchParams.get('q') ?? q;
    runSearch();
  });

  function onInput(e) {
    q = e.currentTarget.value;
    clearTimeout(timer);
    timer = setTimeout(runSearch, 200);
  }

  const scopes = [
    ['all', 'search.scopeAll'],
    ['tracks', 'search.scopeTracks'],
    ['albums', 'search.scopeAlbums'],
    ['artists', 'search.scopeArtists'],
    ['playlists', 'search.scopePlaylists']
  ];
</script>

<div class="wrap search-page">
  <input
    class="search-input search-page-input"
    type="search"
    placeholder={t('search.placeholder')}
    value={q}
    oninput={onInput}
  />

  <div class="seg search-scopes">
    {#each scopes as [key, labelKey] (key)}
      <button type="button" class:active={scope === key} onclick={() => (scope = key)}>{t(labelKey)}</button>
    {/each}
  </div>

  {#if results}
    {#if (scope === 'all' || scope === 'tracks') && results.tracks.length}
      <section class="page-section">
        <h3 class="page-section-title">{t('search.scopeTracks')}</h3>
        {#each results.tracks as track, i (track.id)}
          <TrackRow {track} tracks={results.tracks} index={i} compactActions />
        {/each}
      </section>
    {/if}

    {#if (scope === 'all' || scope === 'albums') && results.albums.length}
      <section class="page-section">
        <h3 class="page-section-title">{t('search.scopeAlbums')}</h3>
        <div class="album-grid">
          {#each results.albums as album (album.albumKey)}
            <a class="album-card" href={`/album/${encodeURIComponent(album.albumKey)}`}>
              <TrackArt artUrl={album.artUrl} seed={album.albumKey} class="album-card-art" />
              <div class="album-card-title">{album.album}</div>
              <div class="album-card-sub">{album.artist}</div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if (scope === 'all' || scope === 'artists') && results.artists.length}
      <section class="page-section">
        <h3 class="page-section-title">{t('search.scopeArtists')}</h3>
        {#each results.artists as artist (artist.artistKey)}
          <a class="artist-list-item" href={`/artist/${encodeURIComponent(artist.artistKey)}`}>
            <div class="artist-avatar">{artist.artist.slice(0, 1)}</div>
            <div>
              <div class="track-row-title">{artist.artist}</div>
              <div class="track-row-sub">{t('common.songs', { count: artist.trackCount })}</div>
            </div>
          </a>
        {/each}
      </section>
    {/if}

    {#if (scope === 'all' || scope === 'playlists') && results.playlists.length}
      <section class="page-section">
        <h3 class="page-section-title">{t('search.scopePlaylists')}</h3>
        {#each results.playlists as pl (pl.id)}
          <a class="artist-list-item" href={`/playlists/${pl.id}`}>
            <div class="artist-avatar">♪</div>
            <div>
              <div class="track-row-title">{pl.name}</div>
            </div>
          </a>
        {/each}
      </section>
    {/if}

    {#if !results.tracks.length && !results.albums.length && !results.artists.length && !results.playlists.length && q.trim()}
      <p class="empty-state">{t('search.noResults')}</p>
    {/if}
  {/if}
</div>
