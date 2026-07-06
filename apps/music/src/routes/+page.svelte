<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import SpeedDial from '$lib/components/SpeedDial.svelte';
  import {
    getRecentTracks,
    getRecentlyAdded,
    getTopArtists,
    getLikedTracks,
    trackCount
  } from '$lib/db.js';
  import { getSpeedDialPages, speedDialTrackIds } from '$lib/speedDial.js';
  import { getQuickPicks } from '$lib/quickPicks.js';
  import {
    HOME_FILTERS,
    shouldShowSection,
    filterTracks,
    filterQuickPicks,
    filterSpeedDialPages
  } from '$lib/homeFilter.js';
  import { db } from '$lib/db.js';
  import {
    playTracks,
    getCurrentTrack,
    player,
    restoreLastSession,
    resumeSession
  } from '$lib/player.svelte.js';
  import { markNowPlayingReturn } from '$lib/nav.js';
  import { openUtilityPane } from '$lib/ui.svelte.js';

  let recent = $state([]);
  let recentAdded = $state([]);
  let topArtists = $state([]);
  let likedTracks = $state([]);
  let total = $state(0);
  /** @type {import('$lib/speedDial.js').SpeedDialPage[]} */
  let speedDialPages = $state([]);
  /** @type {import('$lib/types.js').Track[]} */
  let quickPicks = $state([]);
  /** @type {import('$lib/homeFilter.js').HomeFilter} */
  let homeFilter = $state('all');
  /** @type {Awaited<ReturnType<typeof restoreLastSession>>} */
  let lastSession = $state(null);
  let hasOfflineTracks = $state(false);

  const spotlight = $derived(getCurrentTrack());

  const visibleFilters = $derived(
    hasOfflineTracks ? HOME_FILTERS : HOME_FILTERS.filter((f) => f !== 'offline')
  );
  const filteredSpeedDialPages = $derived(filterSpeedDialPages(speedDialPages, homeFilter));
  const filteredQuickPicks = $derived(filterQuickPicks(quickPicks, homeFilter, recent));
  const filteredRecent = $derived(filterTracks(recent, homeFilter));
  const filteredRecentAdded = $derived(filterTracks(recentAdded, homeFilter));

  const filterLabels = $derived({
    all: t('home.filterAll'),
    recent: t('home.filterRecent'),
    liked: t('home.filterLiked'),
    chinese: t('home.filterChinese'),
    lateNight: t('home.filterLateNight'),
    offline: t('home.filterOffline')
  });

  onMount(async () => {
    hasOfflineTracks =
      (await db.tracks.filter((t) => t.audioBlob instanceof Blob).count()) > 0;
    await reloadHome();
  });

  async function reloadHome() {
    const fatigueId = getCurrentTrack()?.id ?? null;
    [recent, recentAdded, topArtists, likedTracks, total, lastSession, speedDialPages] =
      await Promise.all([
        getRecentTracks(8),
        getRecentlyAdded(6),
        getTopArtists(6),
        getLikedTracks(),
        trackCount(),
        restoreLastSession(),
        getSpeedDialPages(fatigueId)
      ]);
    quickPicks = await getQuickPicks(speedDialTrackIds(speedDialPages), 6);
  }

  async function onSpeedDialChange() {
    const fatigueId = getCurrentTrack()?.id ?? null;
    speedDialPages = await getSpeedDialPages(fatigueId);
    quickPicks = await getQuickPicks(speedDialTrackIds(speedDialPages), 6);
  }

  async function continuePlaying() {
    if (!lastSession) return;
    await resumeSession({
      tracks: lastSession.tracks,
      index: lastSession.index,
      currentTime: lastSession.currentTime,
      autoplay: true
    });
  }

  function shuffleLiked() {
    if (!likedTracks.length) return;
    const shuffled = [...likedTracks].sort(() => Math.random() - 0.5);
    playTracks(shuffled, 0, 'home', { entityType: 'collection', entityId: 'liked' });
  }

  function playAllQuickPicks() {
    if (!filteredQuickPicks.length) return;
    playTracks(filteredQuickPicks, 0, 'quick_picks', {
      entityType: 'collection',
      entityId: 'quick_picks'
    });
  }

  function openLyrics() {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches) {
      openUtilityPane('lyrics');
      return;
    }
    markNowPlayingReturn('/');
    void goto('/now-playing');
  }
</script>

<div class="wrap home-page">
  {#if total > 0}
    <div class="home-filters-wrap">
      <div class="seg seg-chips home-filters" role="tablist" aria-label={t('common.filter')}>
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
  {/if}

  {#if shouldShowSection(homeFilter, 'now')}
    <section class="now-card" class:now-card--playing={Boolean(spotlight)}>
      {#if spotlight}
        <div class="now-card-kicker">{t('home.title')}</div>
        <div class="now-card-main">
          <TrackArt artUrl={spotlight.artUrl} seed={spotlight.id} class="now-card-art" />
          <div class="now-card-copy">
            <div class="now-card-status">
              {player.playing ? t('nowPlaying.playing') : t('nowPlaying.paused')}
            </div>
            <h2 class="now-card-title">{spotlight.title}</h2>
            <p class="now-card-sub">{spotlight.artist}</p>
          </div>
        </div>
        <div class="now-card-actions">
          <a class="btn-primary" href="/now-playing" onclick={() => markNowPlayingReturn('/')}>
            {t('home.continueImmersion')}
          </a>
          <button type="button" class="btn-secondary" onclick={openLyrics}>
            {t('home.openLyrics')}
          </button>
        </div>
      {:else if lastSession?.tracks.length}
        <div class="now-card-kicker">{t('home.title')}</div>
        <button type="button" class="now-card-resume" onclick={continuePlaying}>
          <TrackArt
            artUrl={lastSession.tracks[lastSession.index]?.artUrl}
            seed={lastSession.tracks[lastSession.index]?.id}
            class="now-card-art"
          />
          <div class="now-card-copy">
            <div class="now-card-status">{t('home.continuePlaying')}</div>
            <h2 class="now-card-title">{lastSession.tracks[lastSession.index]?.title}</h2>
            <p class="now-card-sub">{t('home.continueHint')}</p>
          </div>
        </button>
      {:else}
        <div class="now-card-kicker">{t('home.title')}</div>
        <h2 class="now-card-title now-card-title--solo">{t('home.greeting')}</h2>
        <p class="now-card-sub now-card-sub--solo">{t('home.greetingHint')}</p>
        <div class="now-card-actions">
          {#if likedTracks.length}
            <button type="button" class="btn-primary" onclick={shuffleLiked}>
              {t('home.shuffleLiked')}
            </button>
          {/if}
          <a class="btn-secondary" href="/import">{t('home.import')}</a>
        </div>
      {/if}
    </section>
  {/if}

  {#if shouldShowSection(homeFilter, 'speedDial') && filteredSpeedDialPages.length}
    <div class="page-section speed-dial-section">
      <SpeedDial pages={filteredSpeedDialPages} onChange={onSpeedDialChange} />
    </div>
  {/if}

  {#if shouldShowSection(homeFilter, 'quickPicks') && filteredQuickPicks.length}
    <section class="page-section quick-picks-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.quickPicks')}</h3>
        <button type="button" class="quick-picks-play-all" onclick={playAllQuickPicks}>
          {t('home.quickPicksPlayAll')}
        </button>
      </div>
      {#each filteredQuickPicks as track, i (track.id)}
        <TrackRow
          {track}
          tracks={filteredQuickPicks}
          index={i}
          compactActions
          playSource="quick_picks"
        />
      {/each}
    </section>
  {/if}

  {#if shouldShowSection(homeFilter, 'recentAdded') && filteredRecentAdded.length}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.recentAdded')}</h3>
        <a href="/library">{t('nav.library')}</a>
      </div>
      {#each filteredRecentAdded as track, i (track.id)}
        <TrackRow {track} tracks={filteredRecentAdded} index={i} compactActions />
      {/each}
    </section>
  {/if}

  {#if shouldShowSection(homeFilter, 'recent') && filteredRecent.length}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.continueListening')}</h3>
      </div>
      {#each filteredRecent as track, i (track.id)}
        <TrackRow {track} tracks={filteredRecent} index={i} compactActions playSource="home" />
      {/each}
    </section>
  {/if}

  {#if shouldShowSection(homeFilter, 'topArtists') && topArtists.length}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.topArtists')}</h3>
        <a href="/browse">{t('nav.browse')}</a>
      </div>
      <div class="artist-grid home-artist-grid">
        {#each topArtists as artist (artist.artistKey)}
          <a class="artist-grid-item" href={`/artist/${encodeURIComponent(artist.artistKey)}`}>
            <div class="artist-avatar artist-avatar--lg">{artist.artist.slice(0, 1)}</div>
            <div class="album-card-title">{artist.artist}</div>
            <div class="album-card-sub">{t('common.songs', { count: artist.trackCount })}</div>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if !total}
    <section class="empty-state empty-state--rich">
      <p class="empty-state-title">{t('common.empty')}</p>
      <p class="empty-state-hint">{t('common.emptyHint')}</p>
      <div class="import-drop-hint import-drop-hint--desktop">{t('home.dropHint')}</div>
      <div class="mood-hero-actions">
        <a class="btn-primary" href="/import">{t('home.emptyAction')}</a>
      </div>
    </section>
  {/if}
</div>

<style>
  .home-filters-wrap {
    margin-bottom: var(--space-4);
  }

  .home-filters {
    --seg-track-bg: transparent;
    --seg-track-border: none;
    --seg-track-padding: 0;
    --seg-gap: 8px;
    --seg-btn-bg: color-mix(in srgb, var(--t1) 4%, var(--card));
    --seg-btn-border: 1px solid var(--border);
    --seg-btn-color: var(--t2, var(--text-secondary));
    --seg-active-bg-token: color-mix(in srgb, var(--accent) 14%, var(--card));
    --seg-active-fg-token: var(--accent);
    --seg-active-border-token: color-mix(in srgb, var(--accent) 28%, var(--border));
    flex-wrap: wrap;
    row-gap: var(--space-2);
  }

  .home-filters button {
    min-height: 36px;
    padding-inline: 16px;
    font-size: var(--text-sm);
  }

  .now-card {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    min-height: 120px;
    max-width: min(760px, 100%);
    border: 1px solid var(--border);
    background:
      radial-gradient(
        ellipse 120% 80% at 80% -20%,
        color-mix(in srgb, var(--player-glow) 28%, transparent),
        transparent 55%
      ),
      linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--bg)), var(--card));
  }

  .now-card--playing {
    border-color: color-mix(in srgb, var(--track-accent, var(--accent)) 22%, var(--border));
  }

  .now-card-kicker {
    font-family: var(--mono);
    font-size: var(--text-xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--track-accent, var(--accent));
    margin-bottom: var(--space-3);
  }

  .now-card-main,
  .now-card-resume {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    text-align: left;
    color: inherit;
  }

  .now-card-resume {
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .now-card :global(.now-card-art) {
    width: 64px;
    height: 64px;
    border-radius: 12px;
    flex-shrink: 0;
    box-shadow: var(--shadow-soft);
  }

  .now-card-copy {
    min-width: 0;
  }

  .now-card-status {
    font-family: var(--mono);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--track-accent, var(--accent));
    margin-bottom: var(--space-1);
  }

  .now-card-title {
    margin: 0;
    font-size: clamp(22px, 2.4vw, 28px);
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
    font-size: var(--text-sm);
    color: var(--t2, var(--text-secondary));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .now-card-sub--solo {
    white-space: normal;
    max-width: 36ch;
    line-height: 1.5;
  }

  .now-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .speed-dial-section {
    padding-top: 0;
  }

  .quick-picks-play-all {
    border: none;
    background: transparent;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
    cursor: pointer;
    padding: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .quick-picks-play-all:hover {
      color: var(--t1, var(--text));
    }
  }

  @media (--life-os-mobile) {
    .now-card {
      padding: var(--space-3) var(--space-4);
    }

    .home-filters button {
      min-height: var(--tap-min);
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
