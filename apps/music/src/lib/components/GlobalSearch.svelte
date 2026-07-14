<script>
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import TrackArt from './TrackArt.svelte'
  import SearchHighlight from './SearchHighlight.svelte'
  import { getRecentSearches, addRecentSearch } from '$lib/db.js'
  import { playTrack, prewarmTrack } from '$lib/player.svelte.js'
  import { recordMusicInteraction } from '$lib/musicInteractions.js'
  import {
    searchState,
    setSearchDraft,
    setSearchQuery,
    fetchSuggestions,
    goToFullSearch,
    clearSearchQuery,
    dismissSuggestions,
    typeaheadMinLength,
    typeaheadCharsRemaining,
    searchShortcutLabel,
  } from '$lib/search.svelte.js'
  import { createImeGuard } from '@life-os/theme'

  /** @type {{ onNavigate?: () => void; inputRef?: HTMLInputElement | null }} */
  let { onNavigate, inputRef = $bindable(null) } = $props()

  const ime = createImeGuard()

  let open = $state(false)
  let activeIndex = $state(-1)
  /** @type {string} */
  let listboxId = $state(
    `search-suggestions-${Math.random().toString(36).slice(2, 9)}`,
  )

  const recent = $derived(getRecentSearches())
  const onSearchPage = $derived(page.url.pathname === '/search')
  const query = $derived(searchState.q)
  const results = $derived(searchState.suggestResults)
  const shortcutLabel = $derived(searchShortcutLabel())
  const charsRemaining = $derived(typeaheadCharsRemaining(query))

  const showPanel = $derived.by(() => {
    if (!open) return false
    if (query.trim().length < typeaheadMinLength()) {
      return recent.length > 0 || query.trim().length > 0
    }
    return Boolean(
      results ||
        searchState.suggestPending ||
        query.trim().length >= typeaheadMinLength(),
    )
  })

  const compactPanel = $derived(
    query.trim().length > 0 && query.trim().length < typeaheadMinLength(),
  )

  const overlayMode = $derived(showPanel && onSearchPage)

  $effect(() => {
    if (!browser) return
    const layerOpen = overlayMode
    document.body.classList.toggle('search-typeahead-open', layerOpen)
    if (!layerOpen) return

    const scrim = document.createElement('button')
    scrim.type = 'button'
    scrim.className = 'search-typeahead-scrim'
    scrim.setAttribute('aria-label', t('search.closeSuggestions'))
    scrim.tabIndex = -1
    /** @param {MouseEvent} e */
    const onDown = (e) => onScrimPointer(e)
    scrim.addEventListener('mousedown', onDown)
    document.body.appendChild(scrim)

    return () => {
      document.body.classList.remove('search-typeahead-open')
      scrim.removeEventListener('mousedown', onDown)
      scrim.remove()
    }
  })

  /** @type {{ id: string; kind: 'recent' | 'track' | 'album' | 'artist' | 'playlist'; label: string; sub?: string; href?: string; track?: import('$lib/types.js').Track }[]} */
  const flatItems = $derived.by(() => {
    /** @type {{ id: string; kind: 'recent' | 'track' | 'album' | 'artist' | 'playlist'; label: string; sub?: string; href?: string; track?: import('$lib/types.js').Track }[]} */
    const items = []
    if (query.trim().length < typeaheadMinLength() && recent.length) {
      for (const term of recent) {
        items.push({ id: `recent-${term}`, kind: 'recent', label: term })
      }
    }
    if (results) {
      for (const track of results.tracks) {
        items.push({
          id: `track-${track.id}`,
          kind: 'track',
          label: track.title,
          sub: track.artist,
          track,
        })
      }
      for (const album of results.albums) {
        items.push({
          id: `album-${album.albumKey}`,
          kind: 'album',
          label: album.album,
          sub: album.artist,
          href: `/album/${encodeURIComponent(album.albumKey)}`,
        })
      }
      for (const artist of results.artists) {
        items.push({
          id: `artist-${artist.artistKey}`,
          kind: 'artist',
          label: artist.artist,
          sub: t('common.songs', { count: artist.trackCount }),
          href: `/artist/${encodeURIComponent(artist.artistKey)}`,
        })
      }
      for (const pl of results.playlists) {
        items.push({
          id: `pl-${pl.id}`,
          kind: 'playlist',
          label: pl.name,
          sub:
            pl.trackCount != null
              ? t('search.playlistTrackCount', { count: pl.trackCount })
              : undefined,
          href: `/playlists/${pl.id}`,
        })
      }
    }
    return items
  })

  const activeOptionId = $derived(
    activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined,
  )

  function closePanel() {
    open = false
    activeIndex = -1
    dismissSuggestions()
  }

  /** @param {MouseEvent} e */
  function onScrimPointer(e) {
    e.preventDefault()
    closePanel()
    inputRef?.blur()
  }

  $effect(() => {
    page.url.pathname
    page.url.searchParams.get('q')
    closePanel()
  })

  function onInput(e) {
    const value = e.currentTarget.value
    // On /search the omnibox IS the page's search field: commit (debounced) so
    // the results panel tracks the query. Elsewhere keep draft-only (no navigate).
    if (onSearchPage) setSearchQuery(value, { debounce: true, navigate: true })
    else setSearchDraft(value)
    open = true
    activeIndex = -1
    if (ime.isComposing(/** @type {InputEvent} */ (e))) return
    fetchSuggestions(value)
  }

  /** @param {CompositionEvent} e */
  function onCompositionEnd(e) {
    ime.compositionend(e, (value) => {
      if (onSearchPage) setSearchQuery(value, { debounce: false, navigate: true })
      else setSearchDraft(value)
      fetchSuggestions(value)
    })
  }

  function onFocus() {
    open = true
    if (query.trim().length >= typeaheadMinLength()) fetchSuggestions(query)
  }

  function onBlur() {
    setTimeout(() => {
      if (ime.isComposing()) return
      open = false
      activeIndex = -1
    }, 180)
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'ArrowDown') {
      if (ime.isComposing(e)) return
      e.preventDefault()
      if (!open) open = true
      if (flatItems.length === 0) return
      activeIndex = activeIndex >= flatItems.length - 1 ? 0 : activeIndex + 1
      return
    }
    if (e.key === 'ArrowUp') {
      if (ime.isComposing(e)) return
      e.preventDefault()
      if (!open) open = true
      if (flatItems.length === 0) return
      activeIndex = activeIndex <= 0 ? flatItems.length - 1 : activeIndex - 1
      return
    }
    if (e.key === 'Enter') {
      if (ime.isComposing(e)) return
      e.preventDefault()
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        pickItem(flatItems[activeIndex])
        return
      }
      submitSearch()
      return
    }
    if (e.key === 'Escape') {
      closePanel()
      inputRef?.blur()
    }
  }

  function submitSearch() {
    const q = query.trim()
    if (q) addRecentSearch(q)
    closePanel()
    onNavigate?.()
    goToFullSearch(q)
  }

  /** @param {string} q */
  function pickRecent(q) {
    setSearchDraft(q)
    addRecentSearch(q)
    closePanel()
    onNavigate?.()
    goToFullSearch(q)
  }

  /** @param {import('$lib/types.js').Track} track */
  function pickTrack(track) {
    addRecentSearch(query.trim())
    closePanel()
    onNavigate?.()
    void recordMusicInteraction({
      entityType: 'track',
      entityId: track.id,
      action: 'play',
      source: 'search',
    })
    playTrack(track)
  }

  /** @param {{ id: string; kind: string; label: string; sub?: string; href?: string; track?: import('$lib/types.js').Track }} item */
  function pickItem(item) {
    if (item.kind === 'recent') pickRecent(item.label)
    else if (item.kind === 'track' && item.track) pickTrack(item.track)
    else if (item.href) {
      addRecentSearch(query.trim())
      closePanel()
      onNavigate?.()
      goto(item.href)
    }
  }

  /** @param {number} index */
  function rowClass(index) {
    return activeIndex === index
      ? 'search-suggestion-row is-active'
      : 'search-suggestion-row'
  }

  function clearQuery() {
    clearSearchQuery()
    open = false
    activeIndex = -1
    inputRef?.focus()
  }
</script>

<div
  class="appbar-search-wrap"
  class:appbar-search-wrap--results={onSearchPage}
  class:appbar-search-wrap--open={overlayMode}
>
  <div class="appbar-search">
    <Icon name="search" size={16} strokeWidth={1.75} />
    <input
      bind:this={inputRef}
      class="appbar-search-input"
      type="text"
      inputmode="search"
      enterkeyhint="search"
      placeholder={t('search.placeholder')}
      value={query}
      aria-label={t('search.title')}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showPanel}
      aria-controls={listboxId}
      aria-activedescendant={activeOptionId}
      autocomplete="off"
      oninput={onInput}
  oncompositionstart={ime.compositionstart}
  oncompositionend={onCompositionEnd}
  oncompositioncancel={ime.compositioncancel}
      onfocus={onFocus}
      onblur={onBlur}
      onkeydown={onKeydown}
    />
    {#if query.trim()}
      <button
        type="button"
        class="appbar-search-clear"
        aria-label={t('search.clearQuery')}
        onclick={clearQuery}
      >
        <Icon name="x" size={14} />
      </button>
    {:else}
      <kbd class="appbar-search-kbd" aria-hidden="true">{shortcutLabel}</kbd>
    {/if}
  </div>

  {#if showPanel}
    <div
      class="search-suggestions"
      class:search-suggestions--anchored={onSearchPage}
      class:search-suggestions--compact={compactPanel}
      id={listboxId}
      role="listbox"
      aria-label={t('search.suggestions')}
    >
      {#if query.trim().length < typeaheadMinLength() && recent.length}
        <p class="search-suggestions-label">{t('search.recent')}</p>
        {#each recent as term, i (term)}
          <button
            type="button"
            id="{listboxId}-opt-{i}"
            class={rowClass(i)}
            role="option"
            aria-selected={activeIndex === i}
            onclick={() => pickRecent(term)}
          >
            <Icon name="search" size={14} />
            <span>{term}</span>
          </button>
        {/each}
      {/if}

      {#if query.trim().length > 0 && query.trim().length < typeaheadMinLength()}
        <p class="search-suggestions-empty">
          {t('search.minCharsHint', { count: charsRemaining })}
        </p>
      {/if}

      {#if searchState.suggestPending}
        <p class="search-suggestions-empty">{t('search.loading')}</p>
      {/if}

      {#if results}
        {@const offset =
          query.trim().length < typeaheadMinLength() ? recent.length : 0}
        {#if results.tracks.length}
          <p class="search-suggestions-label">{t('search.scopeTracks')}</p>
          {#each results.tracks as track, ti (track.id)}
            {@const idx = offset + ti}
            <button
              type="button"
              id="{listboxId}-opt-{idx}"
              class={rowClass(idx)}
              role="option"
              aria-selected={activeIndex === idx}
              onpointerdown={() => prewarmTrack(track)}
              onclick={() => pickTrack(track)}
            >
              <TrackArt
                artUrl={track.artUrl}
                seed={track.id}
                class="search-suggestion-art"
              />
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">
                  <SearchHighlight text={track.title} {query} />
                </span>
                <span class="search-suggestion-sub">
                  <SearchHighlight text={track.artist} {query} />
                </span>
              </span>
            </button>
          {/each}
        {/if}

        {#if results.albums.length}
          <p class="search-suggestions-label">{t('search.scopeAlbums')}</p>
          {#each results.albums as album, ai (album.albumKey)}
            {@const idx = offset + results.tracks.length + ai}
            <a
              id="{listboxId}-opt-{idx}"
              class={rowClass(idx)}
              role="option"
              aria-selected={activeIndex === idx}
              href={`/album/${encodeURIComponent(album.albumKey)}`}
              onclick={() => {
                addRecentSearch(query.trim())
                closePanel()
                onNavigate?.()
              }}
            >
              <TrackArt
                artUrl={album.artUrl}
                seed={album.albumKey}
                class="search-suggestion-art"
              />
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">
                  <SearchHighlight text={album.album} {query} />
                </span>
                <span class="search-suggestion-sub">
                  <SearchHighlight text={album.artist} {query} />
                </span>
              </span>
            </a>
          {/each}
        {/if}

        {#if results.artists.length}
          <p class="search-suggestions-label">{t('search.scopeArtists')}</p>
          {#each results.artists as artist, ri (artist.artistKey)}
            {@const idx =
              offset + results.tracks.length + results.albums.length + ri}
            <a
              id="{listboxId}-opt-{idx}"
              class={rowClass(idx)}
              role="option"
              aria-selected={activeIndex === idx}
              href={`/artist/${encodeURIComponent(artist.artistKey)}`}
              onclick={() => {
                addRecentSearch(query.trim())
                closePanel()
                onNavigate?.()
              }}
            >
              <span class="search-suggestion-avatar"
                >{artist.artist.slice(0, 1)}</span
              >
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">
                  <SearchHighlight text={artist.artist} {query} />
                </span>
                <span class="search-suggestion-sub"
                  >{t('common.songs', { count: artist.trackCount })}</span
                >
              </span>
            </a>
          {/each}
        {/if}

        {#if results.playlists.length}
          <p class="search-suggestions-label">{t('search.scopePlaylists')}</p>
          {#each results.playlists as pl, pi (pl.id)}
            {@const idx =
              offset +
              results.tracks.length +
              results.albums.length +
              results.artists.length +
              pi}
            <a
              id="{listboxId}-opt-{idx}"
              class={rowClass(idx)}
              role="option"
              aria-selected={activeIndex === idx}
              href={`/playlists/${pl.id}`}
              onclick={() => {
                addRecentSearch(query.trim())
                closePanel()
                onNavigate?.()
              }}
            >
              <Icon name="list" size={16} />
              <span class="search-suggestion-copy">
                <span class="search-suggestion-title">
                  <SearchHighlight text={pl.name} {query} />
                </span>
                {#if pl.trackCount != null}
                  <span class="search-suggestion-sub"
                    >{t('search.playlistTrackCount', {
                      count: pl.trackCount,
                    })}</span
                  >
                {/if}
              </span>
            </a>
          {/each}
        {/if}

        {#if !results.tracks.length && !results.albums.length && !results.artists.length && !results.playlists.length && !searchState.suggestPending}
          <p class="search-suggestions-empty">{t('search.noResults')}</p>
        {/if}
      {/if}

      {#if query.trim().length >= typeaheadMinLength()}
        <button
          type="button"
          class="search-suggestions-all"
          onclick={submitSearch}
        >
          {t('search.viewAllForQuery', { query: query.trim() })} →
          {#if results?.total}
            <span class="search-suggestions-all-count">· {results.total}</span>
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>
