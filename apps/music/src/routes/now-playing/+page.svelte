<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import Icon from '$lib/components/Icon.svelte';
  import PlayerControls from '$lib/components/PlayerControls.svelte';
  import NowPlayingMobileChrome from '$lib/components/NowPlayingMobileChrome.svelte';
  import NowPlayingAmbientBack from '$lib/components/NowPlayingAmbientBack.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import LyricsPanel from '$lib/components/LyricsPanel.svelte';
  import QueueList from '$lib/components/QueueList.svelte';
  import { swipeDismiss, swipeTrack } from '$lib/gestures.js';
  import { consumeNowPlayingReturn, ensureNowPlayingReturn } from '$lib/nav.js';
  import { player, nextTrack, prevTrack, togglePlay, refreshQueueMetadata, seek, restoreLastSession, resumeSession } from '$lib/player.svelte.js';
  import { hasPlayableSource } from '$lib/cloudAudio.js';
  import { db, toggleLike } from '$lib/db.js';
  import { fetchLyricsForTrack } from '$lib/lyricsFetch.js';
  import { scheduleAutoCloudPush } from '$lib/sync.js';
  import { S, setImmersiveViewMode } from '$lib/state.svelte.js';

  const track = $derived(player.queue[player.index] ?? null);
  const viewMode = $derived(S.settings.immersiveViewMode);
  const panelMode = $derived(
    viewMode === 'queue' ? 'queue' : viewMode === 'player' ? 'player' : 'lyrics'
  );
  const desktopPanelMode = $derived(panelMode === 'queue' ? 'queue' : 'lyrics');

  let lyricsFetching = $state(false);
  let controlsRevealed = $state(true);
  let isMobile = $state(false);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let controlsIdleTimer;

  const singAlong = $derived(desktopPanelMode === 'lyrics' && player.playing);
  const mobileSingAlong = $derived(panelMode === 'lyrics' && player.playing);

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

  /** @param {'player' | 'lyrics' | 'queue'} mode */
  function setMode(mode) {
    setImmersiveViewMode(mode);
    revealControls();
  }

  async function onToggleLike() {
    if (!track) return;
    await toggleLike(track.id);
    track.liked = track.liked ? 0 : 1;
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
    void (async () => {
      if (!player.queue.length) {
        const session = await restoreLastSession();
        if (session?.tracks.length) {
          await resumeSession({
            tracks: session.tracks,
            index: session.index,
            currentTime: session.currentTime,
            autoplay: false
          });
        }
      }
    })();
    const mq = window.matchMedia('(max-width: 860px)');
    isMobile = mq.matches;
    const onChange = () => {
      isMobile = mq.matches;
    };
    mq.addEventListener('change', onChange);
    return () => {
      clearTimeout(controlsIdleTimer);
      mq.removeEventListener('change', onChange);
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="now-playing now-playing--immersive"
  class:now-playing--apple-mobile={isMobile}
  class:now-playing--player={isMobile && panelMode === 'player'}
  class:now-playing--queue={isMobile ? panelMode === 'queue' : desktopPanelMode === 'queue'}
  class:now-playing--lyrics-mode={!isMobile && desktopPanelMode === 'lyrics'}
  class:now-playing--desktop={!isMobile}
  class:now-playing--sing-along={isMobile ? mobileSingAlong : singAlong}
  class:now-playing--listen-idle={(isMobile ? panelMode : desktopPanelMode) === 'lyrics' && !player.playing}
  class:now-playing--controls-revealed={controlsRevealed}
  role="region"
  aria-label={t('nowPlaying.title')}
  onpointermove={revealControls}
  onpointerdown={revealControls}
>
  {#if track}
    <NowPlayingAmbientBack artUrl={track.artUrl} />

    <button class="now-playing-handle" type="button" aria-label={t('common.back')} onclick={dismiss}></button>

    {#if isMobile}
      <div class="np-mobile-shell" use:swipeDismiss={{ onDismiss: dismiss }}>
        {#if panelMode === 'player'}
          <div
            class="np-mobile-cover-stage"
            use:swipeTrack={{ onPrev: prevTrack, onNext: nextTrack }}
          >
            <div class="np-mobile-art-wrap">
              <div class="now-playing-art-aura" aria-hidden="true"></div>
              <TrackArt
                artUrl={track.artUrl}
                seed={track.id}
                class="now-playing-art np-mobile-art"
                shared
                priority="high"
              />
            </div>

            <div class="np-mobile-meta-row">
              <div class="np-mobile-meta-copy">
                <h1 class="now-playing-title">{track.title}</h1>
                <p class="now-playing-artist">{track.artist}</p>
              </div>
              <div class="np-mobile-meta-actions">
                <button
                  type="button"
                  class="np-mobile-action-btn"
                  class:is-liked={track.liked === 1}
                  aria-label={track.liked === 1 ? t('liked.title') : t('nav.liked')}
                  aria-pressed={track.liked === 1}
                  onclick={onToggleLike}
                >
                  <Icon name="heart" size={18} strokeWidth={track.liked ? 2.5 : 1.75} />
                </button>
              </div>
            </div>
          </div>
        {:else}
          <header class="np-mobile-compact-head">
            <button
              type="button"
              class="np-mobile-compact-main"
              aria-label={t('nowPlaying.modeCover')}
              onclick={() => setMode('player')}
            >
              <TrackArt
                artUrl={track.artUrl}
                seed={track.id}
                class="np-mobile-compact-art"
                shared
                priority="high"
              />
              <div class="np-mobile-compact-copy">
                <div class="now-playing-title">{track.title}</div>
                <div class="now-playing-artist">{track.artist}</div>
              </div>
            </button>
            <div class="np-mobile-meta-actions">
              <button
                type="button"
                class="np-mobile-action-btn"
                class:is-liked={track.liked === 1}
                aria-label={track.liked === 1 ? t('liked.title') : t('nav.liked')}
                aria-pressed={track.liked === 1}
                onclick={onToggleLike}
              >
                <Icon name="heart" size={18} strokeWidth={track.liked ? 2.5 : 1.75} />
              </button>
            </div>
          </header>

          <section
            class="np-mobile-stage"
            class:np-mobile-stage--queue={panelMode === 'queue'}
            aria-label={panelMode === 'lyrics' ? t('nowPlaying.lyrics') : t('nowPlaying.queue')}
          >
            {#if panelMode === 'lyrics'}
              <LyricsPanel
                stage
                singAlong={mobileSingAlong}
                lyrics={track.lyrics}
                currentTime={player.currentTime}
                fetching={lyricsFetching}
                seekable={seekable}
                onSeek={seek}
              />
            {:else}
              <div class="now-playing-queue-wrap np-mobile-queue-wrap">
                <QueueList compact />
              </div>
            {/if}
          </section>
        {/if}

        {#if player.statusHint}
          <p class="now-playing-status-hint np-mobile-status-hint" role="status">{player.statusHint}</p>
        {/if}

        <NowPlayingMobileChrome viewMode={panelMode} onMode={setMode} />
      </div>
    {:else}
      <button
        type="button"
        class="now-playing-close"
        aria-label={t('common.back')}
        onclick={dismiss}
      >
        <Icon name="chevron-down" size={18} />
      </button>

      <div class="now-playing-mode-toggle" role="tablist" aria-label={t('nowPlaying.modeLabel')}>
        <button
          type="button"
          role="tab"
          class="now-playing-mode-btn"
          class:active={desktopPanelMode === 'lyrics'}
          aria-selected={desktopPanelMode === 'lyrics'}
          onclick={() => setMode('lyrics')}
        >
          {t('nowPlaying.modeLyrics')}
        </button>
        <button
          type="button"
          role="tab"
          class="now-playing-mode-btn"
          class:active={desktopPanelMode === 'queue'}
          aria-selected={desktopPanelMode === 'queue'}
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
              <TrackArt
                artUrl={track.artUrl}
                seed={track.id}
                class="now-playing-art"
                shared
                priority="high"
              />
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
          class:now-playing-queue-stage={desktopPanelMode === 'queue'}
          aria-label={desktopPanelMode === 'lyrics' ? t('nowPlaying.lyrics') : t('nowPlaying.queue')}
        >
          {#if desktopPanelMode === 'lyrics'}
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
    {/if}
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

  .np-mobile-queue-wrap :global(.queue-list) {
    min-height: 0;
    padding-top: 0;
  }

  @media (min-width: 900px) {
    .now-playing-queue-wrap :global(.queue-list) {
      min-height: min(58dvh, 640px);
    }
  }
</style>
