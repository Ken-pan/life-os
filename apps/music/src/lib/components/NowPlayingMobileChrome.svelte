<script>
  import Icon from './Icon.svelte';
  import PlayerControls from './PlayerControls.svelte';
  import {
    player,
    seek,
    formatTime,
    formatTimeRemaining,
    getProgressPct,
    setVolume,
    toggleMute
  } from '$lib/player.svelte.js';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ viewMode: 'player' | 'lyrics' | 'queue', onMode: (mode: 'player' | 'lyrics' | 'queue') => void }} */
  let { viewMode, onMode } = $props();

  const volumeIcon = $derived(player.muted || player.volume === 0 ? 'volume-x' : 'volume-2');
</script>

<footer class="np-mobile-chrome">
  <div class="np-mobile-progress">
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
    <div class="np-mobile-progress-times">
      <span>{formatTime(player.currentTime)}</span>
      <span>{formatTimeRemaining(player.currentTime, player.duration)}</span>
    </div>
  </div>

  <PlayerControls quiet minimal hideProgress apple />

  <div class="np-mobile-volume">
    <Icon name="volume-1" size={16} class="np-mobile-volume-icon np-mobile-volume-icon--low" />
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
    <button
      type="button"
      class="np-mobile-volume-btn"
      aria-label={player.muted ? t('nowPlaying.unmute') : t('nowPlaying.mute')}
      onclick={toggleMute}
    >
      <Icon name={volumeIcon} size={18} />
    </button>
  </div>

  <nav class="np-mobile-dock" aria-label={t('nowPlaying.modeLabel')}>
    <button
      type="button"
      class="np-mobile-dock-btn"
      class:active={viewMode === 'lyrics'}
      aria-label={t('nowPlaying.modeLyrics')}
      aria-pressed={viewMode === 'lyrics'}
      onclick={() => onMode('lyrics')}
    >
      <Icon name="mic" size={22} strokeWidth={1.75} />
    </button>
    <span class="np-mobile-dock-spacer" aria-hidden="true"></span>
    <button
      type="button"
      class="np-mobile-dock-btn"
      class:active={viewMode === 'queue'}
      aria-label={t('nowPlaying.modeQueue')}
      aria-pressed={viewMode === 'queue'}
      onclick={() => onMode('queue')}
    >
      <Icon name="layout-list" size={22} strokeWidth={1.75} />
    </button>
  </nav>
</footer>
