<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import Icon from './Icon.svelte';
  import TrackArt from './TrackArt.svelte';
  import { searchAll, getRecentSearches, addRecentSearch } from '$lib/db.js';
  import { playTrack } from '$lib/player.svelte.js';

  /** @type {{ query?: string; onNavigate?: () => void; inputRef?: HTMLInputElement | null }} */
  let { query = $bindable(''), onNavigate, inputRef = $bindable(null) } = $props();

  let open = $state(false);
  /** @type {Awaited<ReturnType<typeof searchAll>> | null} */
  let results = $state(null);
  let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  const recent = $derived(getRecentSearches());

  async function fetchSuggestions(q) {
    if (q.trim().length < 2) {
      results = null;
      return;
    }
    results = await searchAll(q, { limit: 5 });
  }

  function onInput(e) {
    query = e.currentTarget.value;
    open = true;
    clearTimeout(timer);
    timer = setTimeout(() => fetchSuggestions(query), 150);
  }

  function onFocus() {
    open = true;
    if (query.trim().length >= 2) fetchSuggestions(query);
  }

  function onBlur() {
    setTimeout(() => {
      open = false;
    }, 180);
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      goFullSearch();
    } else if (e.key === 'Escape') {
      open = false;
      inputRef?.blur();
    }
  }

  function goFullSearch() {
    const q = query.trim();
    if (q) addRecentSearch(q);
    open = false;
    onNavigate?.();
    goto(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  /** @param {string} q */
  function pickRecent(q) {
    query = q;
    addRecentSearch(q);
    open = false;
    onNavigate?.();
    goto(`/search?q=${encodeURIComponent(q)}`);
  }

  /** @param {import('$lib/types.js').Track} track */
  function pickTrack(track) {
    addRecentSearch(query.trim());
    open = false;
    onNavigate?.();
    playTrack(track);
  }
</script>

<div class="appbar-search-wrap">
  <div class="appbar-search">
    <Icon name="search" size={16} strokeWidth={1.75} />
    <input
      bind:this={inputRef}
      class="appbar-search-input"
      type="search"
      placeholder={t('search.placeholder')}
      value={query}
      aria-label={t('search.title')}
      aria-haspopup="listbox"
      autocomplete="off"
      oninput={onInput}
      onfocus={onFocus}
      onblur={onBlur}
      onkeydown={onKeydown}
    />
    <kbd class="appbar-search-kbd" aria-hidden="true">⌘K</kbd>
  </div>

  {#if open && (results || (recent.length && query.trim().length < 2))}
    <div class="search-suggestions" role="listbox">
      {#if query.trim().length < 2 && recent.length}
        <p class="search-suggestions-label">{t('search.recent')}</p>
        {#each recent as term (term)}
          <button type="button" class="search-suggestion-row" onclick={() => pickRecent(term)}>
            <Icon name="search" size={14} />
            <span>{term}</span>
          </button>
        {/each}
      {/if}

      {#if results}
        {#if results.tracks.length}
          <p class="search-suggestions-label">{t('search.scopeTracks')}</p>
          {#each results.tracks as track (track.id)}
            <button type="button" class="search-suggestion-row" onclick={() => pickTrack(track)}>
              <TrackArt artUrl={track.artUrl} seed={track.id} class="search-suggestion-art" />
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">{track.title}</span>
                <span class="search-suggestion-sub">{track.artist}</span>
              </span>
            </button>
          {/each}
        {/if}

        {#if results.albums.length}
          <p class="search-suggestions-label">{t('search.scopeAlbums')}</p>
          {#each results.albums as album (album.albumKey)}
            <a
              class="search-suggestion-row"
              href={`/album/${encodeURIComponent(album.albumKey)}`}
              onclick={() => {
                addRecentSearch(query.trim());
                open = false;
                onNavigate?.();
              }}
            >
              <TrackArt artUrl={album.artUrl} seed={album.albumKey} class="search-suggestion-art" />
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">{album.album}</span>
                <span class="search-suggestion-sub">{album.artist}</span>
              </span>
            </a>
          {/each}
        {/if}

        {#if results.artists.length}
          <p class="search-suggestions-label">{t('search.scopeArtists')}</p>
          {#each results.artists as artist (artist.artistKey)}
            <a
              class="search-suggestion-row"
              href={`/artist/${encodeURIComponent(artist.artistKey)}`}
              onclick={() => {
                addRecentSearch(query.trim());
                open = false;
                onNavigate?.();
              }}
            >
              <span class="search-suggestion-avatar">{artist.artist.slice(0, 1)}</span>
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">{artist.artist}</span>
                <span class="search-suggestion-sub">{t('common.songs', { count: artist.trackCount })}</span>
              </span>
            </a>
          {/each}
        {/if}

        {#if results.playlists.length}
          <p class="search-suggestions-label">{t('search.scopePlaylists')}</p>
          {#each results.playlists as pl (pl.id)}
            <a
              class="search-suggestion-row"
              href={`/playlists/${pl.id}`}
              onclick={() => {
                addRecentSearch(query.trim());
                open = false;
                onNavigate?.();
              }}
            >
              <Icon name="list" size={16} />
              <span class="search-suggestion-title">{pl.name}</span>
            </a>
          {/each}
        {/if}

        {#if !results.tracks.length && !results.albums.length && !results.artists.length && !results.playlists.length}
          <p class="search-suggestions-empty">{t('search.noResults')}</p>
        {/if}

        <button type="button" class="search-suggestions-all" onclick={goFullSearch}>
          {t('search.title')}「{query.trim()}」→
        </button>
      {/if}
    </div>
  {/if}
</div>
