<script>
  import Icon from './Icon.svelte';
  import PlayerControls from './PlayerControls.svelte';
  import {
    player,
    seek,
    formatTime,
    formatTimeRemaining,
    getProgressPct
  } from '$lib/player.svelte.js';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ viewMode: 'player' | 'lyrics' | 'queue', onMode: (mode: 'player' | 'lyrics' | 'queue') => void }} */
  let { viewMode, onMode } = $props();
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

  <nav class="np-mobile-dock" aria-label={t('nowPlaying.modeLabel')}>
    <button
      type="button"
      class="np-mobile-dock-btn"
      class:active={viewMode === 'lyrics'}
      aria-label={t('nowPlaying.modeLyrics')}
      aria-pressed={viewMode === 'lyrics'}
      onclick={() => onMode('lyrics')}
    >
      <Icon name="mic" size={22} strokeWidth={2.25} />
    </button>
    <button
      type="button"
      class="np-mobile-dock-btn np-mobile-dock-btn--center"
      class:active={viewMode === 'player'}
      aria-label={t('nowPlaying.modeCover')}
      aria-pressed={viewMode === 'player'}
      onclick={() => onMode('player')}
    >
      <Icon name="headphones" size={23} strokeWidth={2.25} />
    </button>
    <button
      type="button"
      class="np-mobile-dock-btn"
      class:active={viewMode === 'queue'}
      aria-label={t('nowPlaying.modeQueue')}
      aria-pressed={viewMode === 'queue'}
      onclick={() => onMode('queue')}
    >
      <Icon name="layout-list" size={22} strokeWidth={2.25} />
    </button>
  </nav>
</footer>
