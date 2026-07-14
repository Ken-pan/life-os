<script>
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '@life-os/platform-web/svelte/icon';
  import TrackArt from './TrackArt.svelte';
  import LikeButton from './LikeButton.svelte';
  import SeekBar from './SeekBar.svelte';
  import {
    player,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleMute
  } from '$lib/player.svelte.js';
  import { openUtilityPane, toggleUtilityPane, openQueueDrawer } from '$lib/ui.svelte.js';
  import { isMiniPlayerHidden, markNowPlayingReturn } from '$lib/nav.js';
  import { swipeTrack } from '$lib/gestures.js';
  import { setImmersiveViewMode } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';

  const hidden = $derived(isMiniPlayerHidden(page.url.pathname));
  const track = $derived(player.queue[player.index] ?? null);
  const visible = $derived(Boolean(track) && !hidden);
  const repeatIcon = $derived(player.repeat === 'one' ? 'repeat-1' : 'repeat');
  const volumeIcon = $derived(player.muted || player.volume === 0 ? 'volume-x' : 'volume-2');
  const statusHint = $derived(player.statusHint || '');

  let isDesktop = $state(browser && window.matchMedia('(min-width: 840px)').matches);

  onMount(() => {
    const mq = window.matchMedia('(min-width: 840px)');
    isDesktop = mq.matches;
    const onChange = () => {
      isDesktop = mq.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  /** @param {0 | 1} next */
  function onLikeChange(next) {
    if (track) track.liked = next;
  }

  /** @param {'player' | 'lyrics' | 'queue'} [mode] */
  function openNowPlaying(mode) {
    markNowPlayingReturn(page.url.pathname);
    if (mode) setImmersiveViewMode(mode);
    void goto('/now-playing');
  }
</script>

<div
  class="mini-player"
  class:show={visible}
  class:mini-player--expanded={visible && isDesktop}
  aria-hidden={!visible}
>
  {#if !isDesktop}
    <SeekBar variant="mini-top" />
  {/if}

  <div class="mini-player-body">
    <a
      class="mini-player-link"
      href="/now-playing"
      onclick={(e) => {
        e.preventDefault();
        openNowPlaying('player');
      }}
      use:swipeTrack={{
        onPrev: prevTrack,
        onNext: nextTrack,
        onSwipeUp: () => openNowPlaying('player'),
        touchOnly: true,
      }}
    >
      {#if track}
        <TrackArt artUrl={track.artUrl} seed={track.id} class="mini-player-art" shared />
      {/if}
      <div class="mini-player-meta">
        <div class="mini-player-title">{track?.title}</div>
        <div class="mini-player-artist">{track?.artist}</div>
        {#if statusHint}
          <p class="mini-player-status-hint" role="status">{statusHint}</p>
        {/if}
      </div>
    </a>

    <div class="mini-player-center">
      <div class="mini-player-controls">
        <button class="ctrl" class:on={player.shuffle} type="button" aria-label="随机" onclick={toggleShuffle}>
          <Icon name="shuffle" size={16} />
        </button>
        <button class="ctrl" type="button" aria-label="上一首" onclick={prevTrack}>
          <Icon name="skip-back" size={18} />
        </button>
        <button
          class="ctrl ctrl-main"
          type="button"
          aria-label={player.loading ? t('common.loading') : player.playing ? t('common.pause') : t('common.play')}
          aria-busy={player.loading}
          onclick={togglePlay}
        >
          {#if player.loading}
            <Icon name="loader-circle" size={20} strokeWidth={2} class="ctrl-main-spin" />
          {:else}
            <Icon name={player.playing ? 'pause' : 'play'} size={20} strokeWidth={2} />
          {/if}
        </button>
        <button class="ctrl" type="button" aria-label="下一首" onclick={nextTrack}>
          <Icon name="skip-forward" size={18} />
        </button>
        <button class="ctrl" class:on={player.repeat !== 'off'} type="button" aria-label="循环" onclick={cycleRepeat}>
          <Icon name={repeatIcon} size={16} />
        </button>
      </div>
      <SeekBar variant="mini-inline" showTimes />
    </div>

  <div class="mini-player-actions">
    {#if track}
      <LikeButton
        trackId={track.id}
        liked={track.liked}
        variant="mini"
        size={18}
        onChange={onLikeChange}
      />
    {/if}
    <button
      type="button"
      class="mini-player-btn mini-player-btn--lyrics-desktop"
      aria-label={t('nowPlaying.lyrics')}
      onclick={() => openUtilityPane('lyrics')}
    >
      <Icon name="mic" size={18} />
    </button>
    <a
      class="mini-player-btn mini-player-btn--lyrics-mobile"
      href="/now-playing"
      aria-label={t('nowPlaying.lyrics')}
      onclick={(e) => {
        e.preventDefault();
        openNowPlaying('lyrics');
      }}
    >
      <Icon name="mic" size={18} />
    </a>
    <button
      type="button"
      class="mini-player-btn"
      aria-label={t('nowPlaying.queue')}
      onclick={() => {
        if (window.matchMedia('(min-width: 840px)').matches) toggleUtilityPane('queue');
        else openNowPlaying('queue');
      }}
    >
      <Icon name="queue" size={18} />
    </button>
    <div class="mini-player-volume">
      <button type="button" class="mini-player-btn" aria-label={player.muted ? t('nowPlaying.unmute') : t('nowPlaying.mute')} onclick={toggleMute}>
        <Icon name={volumeIcon} size={18} />
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={player.muted ? 0 : player.volume}
        style={`--volume-pct: ${(player.muted ? 0 : player.volume) * 100}%`}
        aria-label={t('nowPlaying.volume')}
        oninput={(e) => setVolume(Number(e.currentTarget.value))}
      />
    </div>
    <button
      class="mini-player-btn play mini-player-btn--mobile-only"
      type="button"
      aria-label={player.loading ? t('common.loading') : player.playing ? t('common.pause') : t('common.play')}
      aria-busy={player.loading}
      onclick={togglePlay}
    >
      {#if player.loading}
        <Icon name="loader-circle" size={20} strokeWidth={2} class="ctrl-main-spin" />
      {:else}
        <Icon name={player.playing ? 'pause' : 'play'} size={20} strokeWidth={2} />
      {/if}
    </button>
  </div>
  </div>
</div>
