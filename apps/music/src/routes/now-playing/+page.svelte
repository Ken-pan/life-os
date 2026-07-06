<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import PlayerControls from '$lib/components/PlayerControls.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import LyricsPanel from '$lib/components/LyricsPanel.svelte';
  import QueueList from '$lib/components/QueueList.svelte';
  import { swipeDismiss, swipeTrack } from '$lib/gestures.js';
  import { consumeNowPlayingReturn, ensureNowPlayingReturn } from '$lib/nav.js';
  import { player, nextTrack, prevTrack, togglePlay, refreshQueueMetadata, seek } from '$lib/player.svelte.js';
  import { hasPlayableSource } from '$lib/cloudAudio.js';
  import { db } from '$lib/db.js';
  import { fetchLyricsForTrack } from '$lib/lyricsFetch.js';
  import { scheduleAutoCloudPush } from '$lib/sync.js';
  import { S, setImmersiveViewMode } from '$lib/state.svelte.js';

  const track = $derived(player.queue[player.index] ?? null);
  const panelMode = $derived(S.settings.immersiveViewMode === 'queue' ? 'queue' : 'lyrics');

  let lyricsFetching = $state(false);
  let controlsRevealed = $state(true);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let controlsIdleTimer;

  const singAlong = $derived(panelMode === 'lyrics' && player.playing);

  $effect(() => {
    const tr = track;
    if (!tr?.id || tr.lyrics?.trim()) {
      lyricsFetching = false;
      return;
    }

    let cancelled = false;
    lyricsFetching = true;

    void (async () => {
      const fetched = await fetchLyricsForTrack(tr);
      if (cancelled) return;
      lyricsFetching = false;
      if (!fetched?.text) return;
      await db.tracks.update(tr.id, { lyrics: fetched.text });
      await refreshQueueMetadata();
      scheduleAutoCloudPush();
    })();

    return () => {
      cancelled = true;
      lyricsFetching = false;
    };
  });

  const seekable = $derived(Boolean(track && hasPlayableSource(track)));

  function dismiss() {
    goto(consumeNowPlayingReturn('/'));
  }

  function scheduleControlsHide() {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      controlsRevealed = true;
      return;
    }
    clearTimeout(controlsIdleTimer);
    controlsIdleTimer = setTimeout(() => {
      controlsRevealed = false;
    }, 2800);
  }

  function revealControls() {
    controlsRevealed = true;
    scheduleControlsHide();
  }

  /** @param {'lyrics' | 'queue'} mode */
  function setMode(mode) {
    setImmersiveViewMode(mode);
    revealControls();
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    revealControls();
    const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') dismiss();
    if (e.key === 'ArrowLeft') prevTrack();
    if (e.key === 'ArrowRight') nextTrack();
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    }
  }

  onMount(() => {
    ensureNowPlayingReturn('/');
    scheduleControlsHide();
    return () => clearTimeout(controlsIdleTimer);
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="now-playing now-playing--immersive"
  class:now-playing--queue={panelMode === 'queue'}
  class:now-playing--sing-along={singAlong}
  class:now-playing--listen-idle={panelMode === 'lyrics' && !player.playing}
  class:now-playing--controls-revealed={controlsRevealed}
  role="region"
  aria-label={t('nowPlaying.title')}
  onpointermove={revealControls}
  onpointerdown={revealControls}
>
  {#if track}
    <button class="now-playing-handle" type="button" aria-label={t('common.back')} onclick={dismiss}></button>

    <div class="now-playing-mode-toggle" role="tablist" aria-label={t('nowPlaying.modeLabel')}>
      <button
        type="button"
        role="tab"
        class="now-playing-mode-btn"
        class:active={panelMode === 'lyrics'}
        aria-selected={panelMode === 'lyrics'}
        onclick={() => setMode('lyrics')}
      >
        {t('nowPlaying.modeLyrics')}
      </button>
      <button
        type="button"
        role="tab"
        class="now-playing-mode-btn"
        class:active={panelMode === 'queue'}
        aria-selected={panelMode === 'queue'}
        onclick={() => setMode('queue')}
      >
        {t('nowPlaying.modeQueue')}
      </button>
    </div>

    <div class="now-playing-layout" use:swipeDismiss={{ onDismiss: dismiss }}>
      <header class="now-playing-hero">
        <div
          class="now-playing-hero-art"
          use:swipeTrack={{ onPrev: prevTrack, onNext: nextTrack }}
        >
          <div class="now-playing-art-aura" aria-hidden="true"></div>
          <div class="now-playing-art-wrap">
            <TrackArt artUrl={track.artUrl} seed={track.id} class="now-playing-art" shared />
          </div>
        </div>

        <div class="now-playing-hero-meta">
          <div class="now-playing-copy">
            <h1 class="now-playing-title">{track.title}</h1>
            <p class="now-playing-artist">{track.artist}</p>
            <p class="now-playing-album">{track.album}</p>
          </div>

          <div class="now-playing-dock">
            <PlayerControls quiet minimal />
          </div>

          {#if player.statusHint}
            <p class="now-playing-status-hint" role="status">{player.statusHint}</p>
          {/if}
        </div>
      </header>

      <section
        class="now-playing-lyrics-stage"
        class:now-playing-queue-stage={panelMode === 'queue'}
        aria-label={panelMode === 'lyrics' ? t('nowPlaying.lyrics') : t('nowPlaying.queue')}
      >
        {#if panelMode === 'lyrics'}
          <LyricsPanel
            stage
            singAlong={singAlong}
            lyrics={track.lyrics}
            currentTime={player.currentTime}
            fetching={lyricsFetching}
            seekable={seekable}
            onSeek={seek}
          />
        {:else}
          <div class="now-playing-queue-wrap">
            <QueueList />
          </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/library">{t('nav.library')}</a>
    </div>
  {/if}
</div>

<style>
  .now-playing-queue-wrap :global(.queue-list) {
    flex: 1 1 auto;
    min-height: min(52dvh, 520px);
    padding: var(--space-1) 0;
    max-width: none;
  }

  .now-playing-queue-wrap :global(.queue-list-foot) {
    flex-shrink: 0;
    padding-bottom: var(--space-2);
  }

  @media (min-width: 900px) {
    .now-playing-queue-wrap :global(.queue-list) {
      min-height: min(58dvh, 640px);
    }
  }
</style>
