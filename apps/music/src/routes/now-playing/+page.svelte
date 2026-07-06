<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import PlayerControls from '$lib/components/PlayerControls.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import LyricsPanel from '$lib/components/LyricsPanel.svelte';
  import { swipeDismiss, swipeTrack } from '$lib/gestures.js';
  import { consumeNowPlayingReturn, ensureNowPlayingReturn } from '$lib/nav.js';
  import { player, nextTrack, prevTrack, togglePlay, refreshQueueMetadata, seek } from '$lib/player.svelte.js';
  import { hasPlayableSource } from '$lib/cloudAudio.js';
  import { db } from '$lib/db.js';
  import { fetchLyricsForTrack } from '$lib/lyricsFetch.js';
  import { scheduleAutoCloudPush } from '$lib/sync.js';
  import { S, setImmersiveViewMode } from '$lib/state.svelte.js';

  const track = $derived(player.queue[player.index] ?? null);
  const immersiveMode = $derived(S.settings.immersiveViewMode === 'ambient' ? 'ambient' : 'lyrics');

  let lyricsFetching = $state(false);
  let controlsRevealed = $state(true);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let controlsIdleTimer;

  const singAlong = $derived(immersiveMode === 'lyrics' && player.playing);
  const ambientIdle = $derived(immersiveMode === 'ambient' && !controlsRevealed);

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
    }, immersiveMode === 'ambient' ? 2200 : 2800);
  }

  function revealControls() {
    controlsRevealed = true;
    scheduleControlsHide();
  }

  /** @param {'lyrics' | 'ambient'} mode */
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
  class:now-playing--ambient={immersiveMode === 'ambient'}
  class:now-playing--sing-along={singAlong}
  class:now-playing--listen-idle={immersiveMode === 'lyrics' && !player.playing}
  class:now-playing--controls-revealed={controlsRevealed}
  class:now-playing--ambient-idle={ambientIdle}
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
        class:active={immersiveMode === 'lyrics'}
        aria-selected={immersiveMode === 'lyrics'}
        onclick={() => setMode('lyrics')}
      >
        {t('nowPlaying.modeLyrics')}
      </button>
      <button
        type="button"
        role="tab"
        class="now-playing-mode-btn"
        class:active={immersiveMode === 'ambient'}
        aria-selected={immersiveMode === 'ambient'}
        onclick={() => setMode('ambient')}
      >
        {t('nowPlaying.modeAmbient')}
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

      <section class="now-playing-lyrics-stage" aria-label={t('nowPlaying.lyrics')}>
        <LyricsPanel
          stage
          singAlong={singAlong}
          lyrics={track.lyrics}
          currentTime={player.currentTime}
          fetching={lyricsFetching}
          seekable={seekable}
          onSeek={seek}
        />
      </section>
    </div>
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/library">{t('nav.library')}</a>
    </div>
  {/if}
</div>
