<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { t } from '$lib/i18n/index.js'
  import TrackRow from '$lib/components/TrackRow.svelte'
  import TrackArt from '$lib/components/TrackArt.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import SpeedDial from '$lib/components/SpeedDial.svelte'
  import {
    getRecentTracks,
    getRecentlyAdded,
    getTopArtists,
    getLikedTracks,
    trackCount,
  } from '$lib/db.js'
  import { getSpeedDialPages, speedDialTrackIds } from '$lib/speedDial.js'
  import { getQuickPicks } from '$lib/quickPicks.js'
  import {
    HOME_FILTERS,
    shouldShowSection,
    filterTracks,
    filterQuickPicks,
    filterSpeedDialPages,
  } from '$lib/homeFilter.js'
  import { db } from '$lib/db.js'
  import { scheduleLibraryMaintenance } from '$lib/import.js'
  import { librarySignals } from '$lib/state.svelte.js'
  import {
    playTracks,
    playTrack,
    prewarmTrack,
    togglePlay,
    getCurrentTrack,
    player,
    restoreLastSession,
    resumeSession,
  } from '$lib/player.svelte.js'
  import { markNowPlayingReturn } from '$lib/nav.js'
  import { openUtilityPane } from '$lib/ui.svelte.js'
  import { prefetchTracksAudio } from '$lib/cloudAudio.js'

  let recent = $state([])
  let recentAdded = $state([])
  let topArtists = $state([])
  let likedTracks = $state([])
  let total = $state(0)
  /** @type {import('$lib/speedDial.js').SpeedDialPage[]} */
  let speedDialPages = $state([])
  /** @type {import('$lib/types.js').Track[]} */
  let quickPicks = $state([])
  /** @type {import('$lib/homeFilter.js').HomeFilter} */
  let homeFilter = $state('all')
  /** @type {Awaited<ReturnType<typeof restoreLastSession>>} */
  let lastSession = $state(null)
  let hasOfflineTracks = $state(false)

  const spotlight = $derived(getCurrentTrack())

  const visibleFilters = $derived(
    hasOfflineTracks
      ? HOME_FILTERS
      : HOME_FILTERS.filter((f) => f !== 'offline'),
  )
  const filteredSpeedDialPages = $derived(
    filterSpeedDialPages(speedDialPages, homeFilter),
  )
  const filteredQuickPicks = $derived(
    filterQuickPicks(quickPicks, homeFilter, recent),
  )
  const filteredRecent = $derived(filterTracks(recent, homeFilter))
  const filteredRecentAdded = $derived(filterTracks(recentAdded, homeFilter))

  const filterLabels = $derived({
    all: t('home.filterAll'),
    recent: t('home.filterRecent'),
    liked: t('home.filterLiked'),
    chinese: t('home.filterChinese'),
    lateNight: t('home.filterLateNight'),
    offline: t('home.filterOffline'),
  })

  onMount(async () => {
    hasOfflineTracks =
      (await db.tracks.filter((t) => t.audioBlob instanceof Blob).count()) > 0
    scheduleLibraryMaintenance({ lyrics: false })
    await reloadHome()
  })

  $effect(() => {
    void librarySignals.epoch
    if (librarySignals.epoch > 0) reloadHome()
  })

  async function reloadHome() {
    const fatigueId = getCurrentTrack()?.id ?? null
    ;[
      recent,
      recentAdded,
      topArtists,
      likedTracks,
      total,
      lastSession,
      speedDialPages,
    ] = await Promise.all([
      getRecentTracks(8),
      getRecentlyAdded(6),
      getTopArtists(6),
      getLikedTracks(),
      trackCount(),
      restoreLastSession(),
      getSpeedDialPages(fatigueId),
    ])
    quickPicks = await getQuickPicks(speedDialTrackIds(speedDialPages), 6)
    void prefetchTracksAudio(
      [...recent, ...recentAdded, ...quickPicks],
      24,
    )
  }

  async function onSpeedDialChange() {
    const fatigueId = getCurrentTrack()?.id ?? null
    speedDialPages = await getSpeedDialPages(fatigueId)
    quickPicks = await getQuickPicks(speedDialTrackIds(speedDialPages), 6)
  }

  async function continuePlaying() {
    if (!lastSession) return
    await resumeSession({
      tracks: lastSession.tracks,
      index: lastSession.index,
      currentTime: lastSession.currentTime,
      autoplay: true,
    })
  }

  function shuffleLiked() {
    if (!likedTracks.length) return
    const shuffled = [...likedTracks].sort(() => Math.random() - 0.5)
    playTracks(shuffled, 0, 'home', {
      entityType: 'collection',
      entityId: 'liked',
    })
  }

  function playAllQuickPicks() {
    if (!filteredQuickPicks.length) return
    playTracks(filteredQuickPicks, 0, 'quick_picks', {
      entityType: 'collection',
      entityId: 'quick_picks',
    })
  }

  function openLyrics() {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1200px)').matches
    ) {
      openUtilityPane('lyrics')
      return
    }
    markNowPlayingReturn('/')
    void goto('/now-playing')
  }
</script>

<div class="wrap home-page">
  <div class="home-stack">
    {#if total > 0}
      <div class="home-section home-filters-wrap">
        <div
          class="seg seg-chips home-filters"
          role="tablist"
          aria-label={t('common.filter')}
        >
          {#each visibleFilters as filter (filter)}
            <button
              type="button"
              role="tab"
              class:active={homeFilter === filter}
              aria-selected={homeFilter === filter}
              onclick={() => (homeFilter = filter)}
            >
              {filterLabels[filter]}
            </button>
          {/each}
        </div>
      </div>

      {#if shouldShowSection(homeFilter, 'now')}
        <section
          class="home-section now-card"
          class:now-card--playing={Boolean(spotlight)}
        >
          {#if spotlight}
            <div class="now-card-body">
              <TrackArt
                artUrl={spotlight.artUrl}
                seed={spotlight.id}
                class="now-card-art"
              />
              <div class="now-card-copy">
                <span class="now-card-kicker">{t('home.title')}</span>
                <div class="now-card-status">
                  {player.playing
                    ? t('nowPlaying.playing')
                    : t('nowPlaying.paused')}
                </div>
                <h2 class="now-card-title">{spotlight.title}</h2>
                <p class="now-card-sub">{spotlight.artist}</p>
              </div>
              <button
                type="button"
                class="now-card-play"
                aria-label={player.playing
                  ? t('common.pause')
                  : t('common.play')}
                onclick={() => togglePlay()}
              >
                <Icon name={player.playing ? 'pause' : 'play'} size={22} />
              </button>
            </div>
            <div class="now-card-foot">
              <a
                class="btn-secondary now-card-foot-btn"
                href="/now-playing"
                onclick={() => markNowPlayingReturn('/')}
              >
                {t('home.continueImmersion')}
              </a>
              <button
                type="button"
                class="btn-ghost now-card-foot-btn"
                onclick={openLyrics}
              >
                {t('home.openLyrics')}
              </button>
            </div>
          {:else if lastSession?.tracks.length}
            <div class="now-card-body">
              <button
                type="button"
                class="now-card-resume-hit"
                onclick={continuePlaying}
              >
                <TrackArt
                  artUrl={lastSession.tracks[lastSession.index]?.artUrl}
                  seed={lastSession.tracks[lastSession.index]?.id}
                  class="now-card-art"
                />
                <div class="now-card-copy">
                  <span class="now-card-kicker">{t('home.title')}</span>
                  <div class="now-card-status">{t('home.continuePlaying')}</div>
                  <h2 class="now-card-title">
                    {lastSession.tracks[lastSession.index]?.title}
                  </h2>
                  <p class="now-card-sub">{t('home.continueHint')}</p>
                </div>
              </button>
              <button
                type="button"
                class="now-card-play"
                aria-label={t('home.continuePlaying')}
                onclick={continuePlaying}
              >
                <Icon name="play" size={22} />
              </button>
            </div>
          {:else}
            <div class="now-card-body now-card-body--solo">
              <div class="now-card-copy">
                <span class="now-card-kicker">{t('home.title')}</span>
                <h2 class="now-card-title now-card-title--solo">
                  {t('home.greeting')}
                </h2>
                <p class="now-card-sub now-card-sub--solo">
                  {t('home.greetingHint')}
                </p>
              </div>
            </div>
            <div class="now-card-foot">
              {#if likedTracks.length}
                <button
                  type="button"
                  class="btn-primary now-card-foot-btn"
                  onclick={shuffleLiked}
                >
                  {t('home.shuffleLiked')}
                </button>
              {/if}
              <a class="btn-secondary now-card-foot-btn" href="/import"
                >{t('home.import')}</a
              >
            </div>
          {/if}
        </section>
      {/if}

      {#if shouldShowSection(homeFilter, 'speedDial') && filteredSpeedDialPages.length}
        <div class="home-section home-speed-dial">
          <SpeedDial
            pages={filteredSpeedDialPages}
            onChange={onSpeedDialChange}
          />
        </div>
      {/if}

      {#if shouldShowSection(homeFilter, 'quickPicks') && filteredQuickPicks.length}
        <section class="page-section home-section quick-picks-section">
          <div class="page-section-head">
            <h3 class="page-section-title">{t('home.quickPicks')}</h3>
            <button
              type="button"
              class="section-action"
              onclick={playAllQuickPicks}
            >
              {t('home.quickPicksPlayAll')}
            </button>
          </div>
          <div class="quick-picks-grid">
            {#each filteredQuickPicks as track (track.id)}
              <button
                type="button"
                class="quick-pick-card"
                onpointerdown={() => prewarmTrack(track)}
                onclick={() => playTrack(track, 'quick_picks')}
              >
                <TrackArt
                  artUrl={track.artUrl}
                  seed={track.id}
                  class="quick-pick-art"
                  lazy
                  resolve={{
                    albumKey: track.albumKey,
                    artist: track.artist,
                    album: track.album,
                    title: track.title,
                  }}
                />
                <span class="quick-pick-copy">
                  <span class="quick-pick-title">{track.title}</span>
                  <span class="quick-pick-artist">{track.artist}</span>
                </span>
                <span class="quick-pick-play" aria-hidden="true">
                  <Icon name="play" size={16} />
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if shouldShowSection(homeFilter, 'recentAdded') && filteredRecentAdded.length}
        <section class="page-section home-section">
          <div class="page-section-head">
            <h3 class="page-section-title">{t('home.recentAdded')}</h3>
            <a class="section-action section-action--link" href="/library"
              >{t('nav.library')}</a
            >
          </div>
          <div class="home-track-list">
            {#each filteredRecentAdded as track, i (track.id)}
              <TrackRow
                {track}
                tracks={filteredRecentAdded}
                index={i}
                compactActions
              />
            {/each}
          </div>
        </section>
      {/if}

      {#if shouldShowSection(homeFilter, 'recent') && filteredRecent.length}
        <section class="page-section home-section">
          <div class="page-section-head">
            <h3 class="page-section-title">{t('home.continueListening')}</h3>
          </div>
          <div class="home-track-list">
            {#each filteredRecent as track, i (track.id)}
              <TrackRow
                {track}
                tracks={filteredRecent}
                index={i}
                compactActions
                playSource="home"
              />
            {/each}
          </div>
        </section>
      {/if}

      {#if shouldShowSection(homeFilter, 'topArtists') && topArtists.length}
        <section class="page-section home-section">
          <div class="page-section-head">
            <h3 class="page-section-title">{t('home.topArtists')}</h3>
            <a class="section-action section-action--link" href="/browse"
              >{t('nav.browse')}</a
            >
          </div>
          <div class="artist-grid home-artist-grid">
            {#each topArtists as artist (artist.artistKey)}
              <a
                class="artist-grid-item"
                href={`/artist/${encodeURIComponent(artist.artistKey)}`}
              >
                <div class="artist-avatar artist-avatar--lg">
                  {artist.artist.slice(0, 1)}
                </div>
                <div class="album-card-title">{artist.artist}</div>
                <div class="album-card-sub">
                  {t('common.songs', { count: artist.trackCount })}
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {:else}
      <section class="empty-state empty-state--rich">
        <p class="empty-state-title">{t('common.empty')}</p>
        <p class="empty-state-hint">{t('common.emptyHint')}</p>
        <div class="import-drop-hint import-drop-hint--desktop">
          {t('home.dropHint')}
        </div>
        <div class="mood-hero-actions">
          <a class="btn-primary" href="/import">{t('home.emptyAction')}</a>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .home-stack {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  .home-section {
    width: 100%;
    min-width: 0;
  }

  .home-section + .home-section,
  .home-section + .page-section.home-section {
    margin-top: var(--space-5);
  }

  .home-stack > .page-section.home-section {
    margin-top: var(--space-5);
  }

  .home-stack > .page-section {
    margin-top: var(--space-5);
  }

  .home-filters-wrap {
    margin-bottom: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .home-filters-wrap::-webkit-scrollbar {
    display: none;
  }

  .home-filters {
    --seg-track-bg: transparent;
    --seg-track-border: none;
    --seg-track-padding: 0;
    --seg-gap: 8px;
    --seg-btn-bg: color-mix(in srgb, var(--t1) 4%, var(--card));
    --seg-btn-border: 1px solid var(--border);
    --seg-btn-color: var(--t2, var(--text-secondary));
    --seg-active-bg-token: color-mix(in srgb, var(--accent) 12%, var(--card));
    --seg-active-fg-token: var(--accent);
    --seg-active-border-token: color-mix(
      in srgb,
      var(--accent) 24%,
      var(--border)
    );
    flex-wrap: nowrap;
    width: max-content;
    min-width: 100%;
  }

  .home-filters button {
    min-height: 32px;
    padding-inline: var(--btn-pad-x-md);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .now-card {
    position: relative;
    overflow: hidden;
    border-radius: 18px;
    padding: var(--space-4);
    width: 100%;
    border: 1px solid var(--border);
    background: radial-gradient(
        ellipse 100% 90% at 100% 0%,
        color-mix(in srgb, var(--player-glow) 12%, transparent),
        transparent 58%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--card) 96%, var(--bg)),
        var(--card)
      );
    transition:
      border-color var(--dur-fast) var(--ease-standard),
      transform var(--dur-fast) var(--ease-standard);
  }

  @media (hover: hover) and (pointer: fine) {
    .now-card:hover {
      border-color: color-mix(in srgb, var(--t1) 12%, var(--border));
      transform: translateY(-1px);
    }
  }

  .now-card--playing {
    border-color: color-mix(
      in srgb,
      var(--track-accent, var(--accent)) 22%,
      var(--border)
    );
  }

  .now-card-body {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    min-height: 80px;
  }

  .now-card-body--solo {
    min-height: 0;
  }

  .now-card-resume-hit {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .now-card :global(.now-card-art) {
    width: 80px;
    height: 80px;
    border-radius: 14px;
    flex-shrink: 0;
    box-shadow: var(--shadow-soft);
  }

  .now-card-copy {
    flex: 1;
    min-width: 0;
  }

  .now-card-kicker {
    display: block;
    font-family: var(--mono);
    font-size: var(--text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--t2, var(--text-secondary));
    margin-bottom: var(--space-1);
  }

  .now-card-status {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--t2, var(--text-secondary));
    margin-bottom: var(--space-1);
  }

  .now-card-title {
    margin: 0;
    font-size: clamp(22px, 2.2vw, 26px);
    font-weight: 600;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .now-card-title--solo {
    white-space: normal;
  }

  .now-card-sub {
    margin: var(--space-1) 0 0;
    font-size: var(--text-md);
    color: color-mix(in srgb, var(--t2, var(--text-secondary)) 88%, var(--t1));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .now-card-sub--solo {
    white-space: normal;
    max-width: 36ch;
    line-height: 1.5;
  }

  .now-card-play {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 32%, transparent);
    touch-action: manipulation;
  }

  .now-card-foot {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding-left: calc(80px + var(--space-4));
  }

  .now-card-body--solo + .now-card-foot {
    padding-left: 0;
  }

  .now-card-foot-btn {
    min-height: 36px;
    padding-inline: var(--btn-pad-x-md);
    font-size: var(--text-sm);
  }

  .home-speed-dial {
    width: 100%;
  }

  .quick-picks-section.page-section {
    margin-top: var(--space-5);
  }

  .home-track-list {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .home-track-list :global(.track-row) {
    border-bottom-color: color-mix(in srgb, var(--border) 65%, transparent);
  }

  .section-action--link {
    text-decoration: none;
    color: var(--accent);
  }

  .section-action {
    border: none;
    background: transparent;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: var(--radius-pill);
    touch-action: manipulation;
  }

  @media (hover: hover) and (pointer: fine) {
    .section-action:hover {
      color: var(--t1, var(--text));
      background: color-mix(in srgb, var(--t1) 6%, transparent);
    }
  }

  .quick-picks-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .quick-pick-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 68px;
    padding: var(--space-2) var(--space-3);
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--card);
    color: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      border-color var(--dur-fast) var(--ease-standard),
      background var(--dur-fast) var(--ease-standard);
  }

  @media (hover: hover) and (pointer: fine) {
    .quick-pick-card:hover {
      border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
      background: color-mix(in srgb, var(--card) 92%, var(--accent) 8%);
    }

    .quick-pick-card:hover .quick-pick-play {
      opacity: 1;
    }
  }

  .quick-pick-card :global(.quick-pick-art) {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .quick-pick-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .quick-pick-title {
    font-size: var(--text-md);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-pick-artist {
    font-size: var(--text-sm);
    color: var(--t2, var(--text-secondary));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-pick-play {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--t1) 8%, transparent);
    color: var(--t1, var(--text));
    opacity: 0.72;
  }

  @media (--life-os-mobile) {
    .home-filters button {
      min-height: var(--tap-min);
    }

    .now-card-foot {
      padding-left: 0;
    }

    .quick-picks-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (--life-os-narrow) {
    .home-filters button {
      padding-inline: var(--space-3);
      font-size: var(--text-xs);
    }
  }

  .home-artist-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-3);
  }

  .home-artist-grid .artist-grid-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
    text-decoration: none;
    color: inherit;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--card);
  }

  .import-drop-hint {
    margin: var(--space-2) 0 var(--space-4);
    color: var(--t3, var(--text-muted));
    font-size: var(--text-sm);
  }
</style>
