<script>
  import Icon from './Icon.svelte'
  import PlayerControls from './PlayerControls.svelte'
  import SeekBar from './SeekBar.svelte'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ viewMode: 'player' | 'lyrics' | 'queue', onMode: (mode: 'player' | 'lyrics' | 'queue') => void }} */
  let { viewMode, onMode } = $props()
</script>

<footer class="np-mobile-chrome">
  <SeekBar variant="mobile" showTimes />

  <div class="np-mobile-transport" aria-label={t('nowPlaying.title')}>
    <PlayerControls quiet minimal hideProgress apple />
  </div>

  <div class="np-mobile-dock-capsule">
    <nav class="np-mobile-dock" aria-label={t('nowPlaying.modeLabel')}>
      <button
        type="button"
        class="np-mobile-dock-btn"
        class:active={viewMode === 'lyrics'}
        aria-label={t('nowPlaying.modeLyrics')}
        aria-pressed={viewMode === 'lyrics'}
        onclick={() => onMode('lyrics')}
      >
        <Icon name="mic" size={20} strokeWidth={2.1} />
      </button>
      <button
        type="button"
        class="np-mobile-dock-btn"
        class:active={viewMode === 'player'}
        aria-label={t('nowPlaying.modeCover')}
        aria-pressed={viewMode === 'player'}
        onclick={() => onMode('player')}
      >
        <Icon name="headphones" size={20} strokeWidth={2.1} />
      </button>
      <button
        type="button"
        class="np-mobile-dock-btn"
        class:active={viewMode === 'queue'}
        aria-label={t('nowPlaying.modeQueue')}
        aria-pressed={viewMode === 'queue'}
        onclick={() => onMode('queue')}
      >
        <Icon name="layout-list" size={20} strokeWidth={2.1} />
      </button>
    </nav>
  </div>
</footer>
