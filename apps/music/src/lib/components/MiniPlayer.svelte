<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import TrackArt from './TrackArt.svelte';
  import {
    player,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeat,
    seek,
    formatTime,
    getProgressPct,
    setVolume,
    toggleMute
  } from '$lib/player.svelte.js';
  import { openUtilityPane, toggleUtilityPane, openQueueDrawer } from '$lib/ui.svelte.js';
  import { isMiniPlayerHidden, markNowPlayingReturn } from '$lib/nav.js';
  import { t } from '$lib/i18n/index.js';

  const hidden = $derived(isMiniPlayerHidden(page.url.pathname));
  const track = $derived(player.queue[player.index] ?? null);
  const visible = $derived(Boolean(track) && !hidden);
  const repeatIcon = $derived(player.repeat === 'one' ? 'repeat-1' : 'repeat');
  const volumeIcon = $derived(player.muted || player.volume === 0 ? 'volume-x' : 'volume-2');
</script>

<div class="mini-player" class:show={visible} class:mini-player--expanded={visible} aria-hidden={!visible}>
  <a
    class="mini-player-link"
    href="/now-playing"
    onclick={() => markNowPlayingReturn(page.url.pathname)}
  >
    {#if track}
      <TrackArt artUrl={track.artUrl} seed={track.id} class="mini-player-art" shared />
    {/if}
    <div class="mini-player-meta">
      <div class="mini-player-title">{track?.title}</div>
      <div class="mini-player-artist">{track?.artist}</div>
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
      <button class="ctrl ctrl-main" type="button" aria-label={player.playing ? t('common.pause') : t('common.play')} onclick={togglePlay}>
        <Icon name={player.playing ? 'pause' : 'play'} size={20} strokeWidth={2} />
      </button>
      <button class="ctrl" type="button" aria-label="下一首" onclick={nextTrack}>
        <Icon name="skip-forward" size={18} />
      </button>
      <button class="ctrl" class:on={player.repeat !== 'off'} type="button" aria-label="循环" onclick={cycleRepeat}>
        <Icon name={repeatIcon} size={16} />
      </button>
    </div>
    <div class="mini-player-progress">
      <span class="mini-player-time">{formatTime(player.currentTime)}</span>
      <input
        type="range"
        min="0"
        max={player.duration || 1}
        step="0.1"
        value={player.currentTime}
        style={`--progress-pct: ${getProgressPct()}`}
        aria-label="进度"
        oninput={(e) => seek(Number(e.currentTarget.value))}
      />
      <span class="mini-player-time">{formatTime(player.duration)}</span>
    </div>
  </div>

  <div class="mini-player-actions">
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
      onclick={() => markNowPlayingReturn(page.url.pathname)}
    >
      <Icon name="mic" size={18} />
    </a>
    <button
      type="button"
      class="mini-player-btn"
      aria-label={t('nowPlaying.queue')}
      onclick={() => {
        if (window.matchMedia('(min-width: 861px)').matches) toggleUtilityPane('queue');
        else openQueueDrawer();
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
        aria-label={t('nowPlaying.volume')}
        oninput={(e) => setVolume(Number(e.currentTarget.value))}
      />
    </div>
    <button class="mini-player-btn play mini-player-btn--mobile-only" type="button" aria-label={player.playing ? t('common.pause') : t('common.play')} onclick={togglePlay}>
      <Icon name={player.playing ? 'pause' : 'play'} size={20} strokeWidth={2} />
    </button>
  </div>
</div>
