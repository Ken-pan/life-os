<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import TrackRow from '$lib/components/TrackRow.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import {
    getRecentTracks,
    getRecentlyAdded,
    getTopArtists,
    trackCount
  } from '$lib/db.js';
  import {
    playTracks,
    getCurrentTrack,
    player,
    restoreLastSession,
    resumeSession
  } from '$lib/player.svelte.js';
  import { markNowPlayingReturn } from '$lib/nav.js';

  let recent = $state([]);
  let recentAdded = $state([]);
  let topArtists = $state([]);
  let total = $state(0);
  /** @type {Awaited<ReturnType<typeof restoreLastSession>>} */
  let lastSession = $state(null);

  const spotlight = $derived(getCurrentTrack());

  onMount(async () => {
    [recent, recentAdded, topArtists, total, lastSession] = await Promise.all([
      getRecentTracks(8),
      getRecentlyAdded(6),
      getTopArtists(6),
      trackCount(),
      restoreLastSession()
    ]);
  });

  async function continuePlaying() {
    if (!lastSession) return;
    await resumeSession({
      tracks: lastSession.tracks,
      index: lastSession.index,
      currentTime: lastSession.currentTime,
      autoplay: true
    });
  }
</script>

<div class="wrap home-page">
  <section class="mood-hero mood-hero--compact">
    <div class="mood-hero-kicker">{t('home.kicker')}</div>
    <h2 class="mood-hero-title mood-hero-title--compact">{t('home.heroTitle').replace('\n', ' ')}</h2>
    {#if total > 0}
      <p class="mood-hero-desc">{t('home.heroDesc')}</p>
    {/if}
  </section>

  {#if lastSession?.tracks.length && !spotlight}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.continuePlaying')}</h3>
      </div>
      <button type="button" class="continue-card" onclick={continuePlaying}>
        <TrackArt
          artUrl={lastSession.tracks[lastSession.index]?.artUrl}
          seed={lastSession.tracks[lastSession.index]?.id}
          class="continue-card-art"
        />
        <div>
          <div class="track-row-title">{lastSession.tracks[lastSession.index]?.title}</div>
          <div class="track-row-sub">{t('home.continueHint')}</div>
        </div>
      </button>
    </section>
  {/if}

  {#if spotlight}
    <section class="spotlight">
      <a class="spotlight-card" href="/now-playing" onclick={() => markNowPlayingReturn('/')}>
        <TrackArt artUrl={spotlight.artUrl} seed={spotlight.id} class="spotlight-art" />
        <div class="spotlight-copy">
          <div class="spotlight-kicker">{player.playing ? t('nowPlaying.playing') : t('nowPlaying.paused')}</div>
          <div class="spotlight-title">{spotlight.title}</div>
          <div class="spotlight-sub">{spotlight.artist}</div>
        </div>
      </a>
    </section>
  {/if}

  {#if recentAdded.length}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.recentAdded')}</h3>
        <a href="/library">{t('nav.library')}</a>
      </div>
      {#each recentAdded as track, i (track.id)}
        <TrackRow {track} tracks={recentAdded} index={i} compactActions />
      {/each}
    </section>
  {/if}

  {#if recent.length}
    <section class="page-section">
      <div class="page-section-head">
        <h3 class="page-section-title">{t('home.recent')}</h3>
      </div>
      {#each recent as track, i (track.id)}
        <TrackRow {track} tracks={recent} index={i} compactActions />
      {/each}
    </section>
  {/if}

  {#if topArtists.length}
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
  .continue-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--card);
    text-align: left;
    color: inherit;
  }

  .continue-card :global(.continue-card-art) {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-md);
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
