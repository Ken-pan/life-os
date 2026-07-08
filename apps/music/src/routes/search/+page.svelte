<script>
  import { onMount, tick } from 'svelte'
  import { page } from '$app/state'
  import { t } from '$lib/i18n/index.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import TrackRow from '$lib/components/TrackRow.svelte'
  import TrackArt from '$lib/components/TrackArt.svelte'
  import SearchHighlight from '$lib/components/SearchHighlight.svelte'
  import {
    getRecentSearches,
    clearRecentSearches,
    getTopArtists,
  } from '$lib/db.js'
  import { suggestAlternatives } from '$lib/searchEngine.js'
  import {
    searchState,
    syncSearchFromUrl,
    setSearchDraft,
    setSearchQuery,
    setSearchScope,
    setSearchSort,
    clearSearchQuery,
    sortTracks,
  } from '$lib/search.svelte.js'
  import { createImeGuard } from '@life-os/theme'

  const ime = createImeGuard()

  const PREVIEW_LIMIT = 5

  /** @type {HTMLInputElement | null} */
  let pageInput = $state(null)
  /** @type {HTMLDivElement | null} */
  let scopeTabsEl = $state(null)

  const recent = $derived(getRecentSearches())
  const recentLower = $derived(
    new Set(recent.map((term) => term.toLowerCase())),
  )
  const filteredTopArtists = $derived(
    topArtists.filter((a) => !recentLower.has(a.artist.toLowerCase())),
  )

  onMount(async () => {
    topArtists = await getTopArtists(6)
    if (window.matchMedia('(max-width: 839px)').matches) {
      pageInput?.focus()
    }
  })

  /** @type {{ artist: string, artistKey: string, trackCount: number, playCount: number }[]} */
  let topArtists = $state([])

  const q = $derived(searchState.q)
  const scope = $derived(searchState.scope)
  const sort = $derived(searchState.sort)
  const results = $derived(searchState.results)
  const counts = $derived(
    results?.counts ?? { tracks: 0, albums: 0, artists: 0, playlists: 0 },
  )
  const total = $derived(results?.total ?? 0)
  const hasQuery = $derived(q.trim().length > 0)

  const scopes = [
    ['all', 'search.scopeAll'],
    ['tracks', 'search.scopeTracks'],
    ['albums', 'search.scopeAlbums'],
    ['artists', 'search.scopeArtists'],
    ['playlists', 'search.scopePlaylists'],
  ]

  const scopeLabel = $derived(
    /** @type {Record<string, string>} */ ({
      all: t('search.scopeAll'),
      tracks: t('search.scopeTracks'),
      albums: t('search.scopeAlbums'),
      artists: t('search.scopeArtists'),
      playlists: t('search.scopePlaylists'),
    })[scope] ?? scope,
  )

  const scopeCount = $derived(
    /** @type {Record<string, number>} */ ({
      all: total,
      tracks: counts.tracks,
      albums: counts.albums,
      artists: counts.artists,
      playlists: counts.playlists,
    })[scope] ?? 0,
  )

  const displayTracks = $derived(
    results ? sortTracks(results.tracks, sort) : [],
  )

  const previewTracks = $derived(
    scope === 'all' ? displayTracks.slice(0, PREVIEW_LIMIT) : displayTracks,
  )
  const previewAlbums = $derived(
    results
      ? scope === 'all'
        ? results.albums.slice(0, PREVIEW_LIMIT)
        : results.albums
      : [],
  )
  const previewArtists = $derived(
    results
      ? scope === 'all'
        ? results.artists.slice(0, PREVIEW_LIMIT)
        : results.artists
      : [],
  )
  const previewPlaylists = $derived(
    results
      ? scope === 'all'
        ? results.playlists.slice(0, PREVIEW_LIMIT)
        : results.playlists
      : [],
  )

  const showTracks = $derived(
    (scope === 'all' || scope === 'tracks') && previewTracks.length > 0,
  )
  const showAlbums = $derived(
    (scope === 'all' || scope === 'albums') && previewAlbums.length > 0,
  )
  const showArtists = $derived(
    (scope === 'all' || scope === 'artists') && previewArtists.length > 0,
  )
  const showPlaylists = $derived(
    (scope === 'all' || scope === 'playlists') && previewPlaylists.length > 0,
  )

  const scopedEmpty = $derived.by(() => {
    if (!hasQuery || !results || searchState.pending) return false
    if (scope === 'tracks') return counts.tracks === 0
    if (scope === 'albums') return counts.albums === 0
    if (scope === 'artists') return counts.artists === 0
    if (scope === 'playlists') return counts.playlists === 0
    return total === 0
  })

  const suggestions = $derived.by(() => {
    if (!hasQuery) return []
    const pool = [
      ...recent,
      ...topArtists.map((a) => a.artist),
      ...getRecentSearches(),
    ]
    return suggestAlternatives(q, [...new Set(pool)]).filter(
      (term) => term.toLowerCase() !== q.trim().toLowerCase(),
    )
  })

  $effect(() => {
    page.url.searchParams.get('q')
    page.url.searchParams.get('scope')
    page.url.searchParams.get('sort')
    void syncSearchFromUrl(page.url)
  })

  $effect(() => {
    scope
    if (!scopeTabsEl) return
    void tick().then(() => {
      scopeTabsEl
        ?.querySelector('[role="tab"][aria-selected="true"]')
        ?.scrollIntoView({
          inline: 'nearest',
          block: 'nearest',
          behavior: 'smooth',
        })
    })
  })

  /** @param {Event & { currentTarget: HTMLInputElement }} e */
  function onInput(e) {
    const value = e.currentTarget.value
    if (ime.isComposing(/** @type {InputEvent} */ (e))) {
      setSearchDraft(value)
      return
    }
    setSearchQuery(value, { debounce: true, navigate: true })
  }

  /** @param {CompositionEvent} e */
  function onCompositionEnd(e) {
    ime.compositionend(e, (value) => {
      setSearchQuery(value, { debounce: false, navigate: true })
    })
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Enter' && ime.isComposing(e)) return
  }

  /** @param {string} term */
  function pickTerm(term) {
    setSearchQuery(term, { debounce: false, navigate: true })
  }

  /** @param {import('$lib/search.svelte.js').SearchScope} next */
  function viewAllInScope(next) {
    setSearchScope(next)
  }
</script>

<div class="wrap search-page" class:search-page--loading={searchState.pending}>
  <div class="search-page-shell">
    <div class="search-page-toolbar">
      <div class="search-page-input-wrap">
        <Icon name="search" size={18} strokeWidth={1.75} />
        <input
          bind:this={pageInput}
          class="search-input search-page-input"
          type="text"
          inputmode="search"
          enterkeyhint="search"
          placeholder={t('search.placeholder')}
          aria-label={t('search.title')}
          value={q}
          oninput={onInput}
          oncompositionstart={ime.compositionstart}
          oncompositionend={onCompositionEnd}
          oncompositioncancel={ime.compositioncancel}
          onkeydown={onKeydown}
        />
        {#if hasQuery}
          <button
            type="button"
            class="search-page-clear"
            aria-label={t('search.clearQuery')}
            onclick={clearSearchQuery}
          >
            <Icon name="x" size={16} />
          </button>
        {/if}
      </div>
    </div>

    {#if hasQuery}
      <div class="search-page-summary" aria-live="polite">
        {#if searchState.pending}
          <span>{t('search.resultSummaryPending', { query: q.trim() })}</span>
        {:else if scope === 'all'}
          <span
            >{t('search.resultSummary', {
              query: q.trim(),
              count: scopeCount,
            })}</span
          >
        {:else}
          <span>
            {t('search.resultSummaryScoped', {
              query: q.trim(),
              scope: scopeLabel,
              count: scopeCount,
            })}
            {#if total !== scopeCount}
              <span class="search-page-summary-hint">
                {t('search.resultSummaryAllHint', { total })}
              </span>
            {/if}
          </span>
        {/if}
      </div>
    {/if}

    {#if hasQuery}
      <div class="search-scopes-wrap">
        <div class="search-scopes-scroll">
          <div
            class="seg search-scopes"
            bind:this={scopeTabsEl}
            role="tablist"
            aria-label={t('search.title')}
          >
            {#each scopes as [key, labelKey] (key)}
              {@const count = /** @type {Record<string, number>} */ ({
                all: total,
                tracks: counts.tracks,
                albums: counts.albums,
                artists: counts.artists,
                playlists: counts.playlists,
              })[key]}
              <button
                type="button"
                role="tab"
                aria-selected={scope === key}
                class:active={scope === key}
                onclick={() =>
                  setSearchScope(
                    /** @type {import('$lib/search.svelte.js').SearchScope} */ (
                      key
                    ),
                  )}
              >
                {t(labelKey)}
                {#if !searchState.pending}
                  <span
                    class="search-scope-count"
                    class:search-scope-count--zero={count === 0}>{count}</span
                  >
                {/if}
              </button>
            {/each}
          </div>
        </div>

        {#if scope === 'tracks' && displayTracks.length > 0}
          <div
            class="search-page-sort seg"
            role="group"
            aria-label={t('search.sortLabel')}
          >
            <button
              type="button"
              class:active={sort === 'relevance'}
              onclick={() => setSearchSort('relevance')}
            >
              {t('search.sortRelevance')}
            </button>
            <button
              type="button"
              class:active={sort === 'title'}
              onclick={() => setSearchSort('title')}
            >
              {t('search.sortTitle')}
            </button>
            <button
              type="button"
              class:active={sort === 'recent'}
              onclick={() => setSearchSort('recent')}
            >
              {t('search.sortRecent')}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if searchState.pending && hasQuery}
      <div class="search-page-skeleton" aria-hidden="true">
        {#each Array(4) as _, i (i)}
          <div class="search-skeleton-row"></div>
        {/each}
      </div>
    {:else if !hasQuery}
      <section class="search-page-zero">
        <p class="search-page-zero-hint">{t('search.emptyHint')}</p>

        {#if recent.length}
          <div class="search-page-block">
            <div class="search-page-block-head">
              <h3 class="page-section-title">{t('search.recent')}</h3>
              <button
                type="button"
                class="btn-ghost search-page-recent-clear"
                onclick={clearRecentSearches}
              >
                {t('search.clearRecent')}
              </button>
            </div>
            <div class="search-page-chip-list">
              {#each recent as term (term)}
                <button
                  type="button"
                  class="search-page-chip"
                  onclick={() => pickTerm(term)}
                >
                  <Icon name="search" size={14} />
                  <span>{term}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if filteredTopArtists.length}
          <div class="search-page-block">
            <h3 class="page-section-title">{t('search.popularArtists')}</h3>
            <div class="search-page-chip-list">
              {#each filteredTopArtists as artist (artist.artistKey)}
                <button
                  type="button"
                  class="search-page-chip"
                  onclick={() => pickTerm(artist.artist)}
                >
                  <span class="search-page-chip-avatar"
                    >{artist.artist.slice(0, 1)}</span
                  >
                  <span>{artist.artist}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {:else if results}
      {#if showTracks}
        <section class="page-section search-page-section">
          <div class="search-page-section-head">
            <h3 class="page-section-title">{t('search.scopeTracks')}</h3>
            {#if scope === 'all' && counts.tracks > PREVIEW_LIMIT}
              <button
                type="button"
                class="btn-ghost search-page-more"
                onclick={() => viewAllInScope('tracks')}
              >
                {t('search.viewAllInScope', {
                  count: counts.tracks,
                  scope: t('search.scopeTracks'),
                })}
              </button>
            {/if}
          </div>
          {#each previewTracks as track, i (track.id)}
            <TrackRow
              {track}
              tracks={displayTracks}
              index={i}
              playSource="search"
              richActions
            />
          {/each}
        </section>
      {/if}

      {#if showAlbums}
        <section class="page-section search-page-section">
          <div class="search-page-section-head">
            <h3 class="page-section-title">{t('search.scopeAlbums')}</h3>
            {#if scope === 'all' && counts.albums > PREVIEW_LIMIT}
              <button
                type="button"
                class="btn-ghost search-page-more"
                onclick={() => viewAllInScope('albums')}
              >
                {t('search.viewAllInScope', {
                  count: counts.albums,
                  scope: t('search.scopeAlbums'),
                })}
              </button>
            {/if}
          </div>
          <div class="album-grid">
            {#each previewAlbums as album (album.albumKey)}
              <a
                class="album-card"
                href={`/album/${encodeURIComponent(album.albumKey)}`}
              >
                <TrackArt
                  artUrl={album.artUrl}
                  seed={album.albumKey}
                  class="album-card-art"
                />
                <div class="album-card-title">
                  <SearchHighlight text={album.album} query={q} />
                </div>
                <div class="album-card-sub">
                  <SearchHighlight text={album.artist} query={q} />
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      {#if showArtists}
        <section class="page-section search-page-section">
          <div class="search-page-section-head">
            <h3 class="page-section-title">{t('search.scopeArtists')}</h3>
            {#if scope === 'all' && counts.artists > PREVIEW_LIMIT}
              <button
                type="button"
                class="btn-ghost search-page-more"
                onclick={() => viewAllInScope('artists')}
              >
                {t('search.viewAllInScope', {
                  count: counts.artists,
                  scope: t('search.scopeArtists'),
                })}
              </button>
            {/if}
          </div>
          {#each previewArtists as artist (artist.artistKey)}
            <a
              class="artist-list-item"
              href={`/artist/${encodeURIComponent(artist.artistKey)}`}
            >
              <div class="artist-avatar">{artist.artist.slice(0, 1)}</div>
              <div>
                <div class="track-row-title">
                  <SearchHighlight text={artist.artist} query={q} />
                </div>
                <div class="track-row-sub">
                  {t('common.songs', { count: artist.trackCount })}
                </div>
              </div>
            </a>
          {/each}
        </section>
      {/if}

      {#if showPlaylists}
        <section class="page-section search-page-section">
          <div class="search-page-section-head">
            <h3 class="page-section-title">{t('search.scopePlaylists')}</h3>
            {#if scope === 'all' && counts.playlists > PREVIEW_LIMIT}
              <button
                type="button"
                class="btn-ghost search-page-more"
                onclick={() => viewAllInScope('playlists')}
              >
                {t('search.viewAllInScope', {
                  count: counts.playlists,
                  scope: t('search.scopePlaylists'),
                })}
              </button>
            {/if}
          </div>
          {#each previewPlaylists as pl (pl.id)}
            <a class="artist-list-item" href={`/playlists/${pl.id}`}>
              <div class="artist-avatar">♪</div>
              <div>
                <div class="track-row-title">
                  <SearchHighlight text={pl.name} query={q} />
                </div>
                {#if pl.trackCount != null}
                  <div class="track-row-sub">
                    {t('search.playlistTrackCount', { count: pl.trackCount })}
                  </div>
                {/if}
              </div>
            </a>
          {/each}
        </section>
      {/if}

      {#if scopedEmpty}
        <div class="search-page-empty">
          <p class="search-page-empty-title">
            {scope === 'all'
              ? t('search.noResultsFor', { query: q.trim() })
              : t('search.noResultsInScopeFor', {
                  query: q.trim(),
                  scope: scopeLabel,
                })}
          </p>

          {#if suggestions.length}
            <div class="search-page-empty-suggestions">
              <p class="search-page-empty-label">{t('search.tryInstead')}</p>
              <div class="search-page-chip-list">
                {#each suggestions as term (term)}
                  <button
                    type="button"
                    class="search-page-chip"
                    onclick={() => pickTerm(term)}
                  >
                    <Icon name="search" size={14} />
                    <span>{term}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <div class="search-page-empty-actions">
            {#if scope !== 'all'}
              <button
                type="button"
                class="btn-secondary"
                onclick={() => viewAllInScope('all')}
              >
                {t('search.broadenScope')}
              </button>
            {/if}
            <button
              type="button"
              class="btn-secondary"
              onclick={clearSearchQuery}
            >
              {t('search.clearQuery')}
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .search-page {
    width: 100%;
  }

  .search-page-shell {
    max-width: 880px;
    width: 100%;
    margin-right: auto;
  }

  @media (min-width: 840px) {
    .search-page-shell {
      margin-left: 64px;
    }
  }

  .search-page-toolbar {
    margin-bottom: var(--space-3);
  }

  .search-page-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .search-page-input-wrap :global(svg) {
    position: absolute;
    left: var(--space-4);
    color: var(--t3, var(--text-muted));
    pointer-events: none;
  }

  .search-page-input-wrap .search-page-input {
    padding-left: calc(var(--space-4) + 24px);
    padding-right: calc(var(--space-4) + 28px);
  }

  .search-page-clear {
    position: absolute;
    right: var(--space-2);
    display: grid;
    place-items: center;
    width: var(--tap-min);
    height: var(--tap-min);
    border-radius: var(--radius-pill);
    color: var(--t3, var(--text-muted));
  }

  .search-page-summary {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--t2, var(--text-secondary));
  }

  .search-page-summary-hint {
    margin-left: var(--space-1);
    color: var(--t3, var(--text-muted));
  }

  .search-scopes-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    overflow: hidden;
  }

  @media (max-width: 839px) {
    .search-scopes-wrap {
      margin-inline: calc(-1 * var(--page-gutter, var(--space-4)));
    }
  }

  .search-scopes-scroll {
    position: relative;
    overflow: hidden;
  }

  .search-scopes-scroll::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 32px;
    pointer-events: none;
    background: linear-gradient(
      to right,
      transparent 0%,
      var(--bg, var(--page-bg, #fff)) 88%
    );
  }

  @media (max-width: 839px) {
    .search-scopes {
      padding: 4px var(--page-gutter, var(--space-4));
      scroll-padding-inline: var(--page-gutter, var(--space-4));
    }
  }

  .search-scopes {
    display: flex;
    overflow-x: auto;
    flex-wrap: nowrap;
    width: 100%;
    gap: 4px;
    padding: 4px 0;
    scroll-padding-inline: 0;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .search-scopes::-webkit-scrollbar {
    display: none;
  }

  .search-scopes button {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    white-space: nowrap;
  }

  .search-scope-count {
    min-width: 1.1rem;
    padding: 0 4px;
    font-size: var(--text-2xs);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    font-size: var(--text-2xs);
    font-weight: 600;
    line-height: 1.6;
  }

  .search-scopes button.active .search-scope-count {
    background: color-mix(in srgb, var(--on-accent, #fff) 22%, transparent);
  }

  .search-scope-count--zero {
    opacity: 0.65;
    background: color-mix(
      in srgb,
      var(--t3, var(--text-muted)) 14%,
      transparent
    );
  }

  .search-page-sort {
    align-self: flex-start;
  }

  .search-page-sort button {
    min-height: var(--tap-min);
    padding: var(--space-1) var(--space-3);
    white-space: nowrap;
    font-size: var(--text-sm);
  }

  .search-page-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .search-page-more {
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .search-page-zero {
    margin-top: var(--space-2);
  }

  .search-page-zero-hint {
    margin: 0 0 var(--space-4);
    color: var(--t3, var(--text-muted));
  }

  .search-page-block {
    margin-bottom: var(--space-5);
  }

  .search-page-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .search-page-recent-clear {
    min-height: var(--tap-min);
    font-size: var(--text-sm);
  }

  .search-page-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .search-page-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--card);
    color: inherit;
    touch-action: manipulation;
  }

  .search-page-chip:focus-visible,
  .search-page-clear:focus-visible {
    box-shadow: var(--btn-focus-ring);
  }

  .search-page-chip-avatar {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-pill);
    display: grid;
    place-items: center;
    background: var(--accent-bg);
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .search-page-skeleton {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .search-skeleton-row {
    height: 56px;
    border-radius: var(--radius-md);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--border) 60%, transparent) 0%,
      color-mix(in srgb, var(--border) 30%, transparent) 50%,
      color-mix(in srgb, var(--border) 60%, transparent) 100%
    );
    background-size: 200% 100%;
    animation: search-shimmer 1.2s ease-in-out infinite;
  }

  @keyframes search-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .search-page-empty {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    margin-top: var(--space-6);
    padding: var(--space-5) var(--space-4);
    text-align: center;
  }

  .search-page-empty-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--t1, var(--text));
  }

  .search-page-empty-label {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--t2, var(--text-secondary));
  }

  .search-page-empty-suggestions {
    width: 100%;
    max-width: 28rem;
  }

  .search-page-empty-suggestions .search-page-chip-list {
    justify-content: center;
  }

  .search-page-empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }

  .search-page :global(.album-card-sub) {
    color: var(--t2, var(--text-secondary));
  }
</style>
