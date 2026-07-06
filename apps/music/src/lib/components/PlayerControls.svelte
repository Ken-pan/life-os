<script>
  import Icon from './Icon.svelte';
  import {
    player,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeat,
    seek,
    formatTime,
    getProgressPct
  } from '$lib/player.svelte.js';
  import { openQueueDrawer } from '$lib/ui.svelte.js';

  let { large = false, quiet = false, minimal = false, hideProgress = false, apple = false } = $props();

  const repeatIcon = $derived(player.repeat === 'one' ? 'repeat-1' : 'repeat');
</script>

<div
  class="player-controls"
  class:player-controls--large={large}
  class:player-controls--quiet={quiet}
  class:player-controls--minimal={minimal}
  class:player-controls--apple={apple}
>
  {#if !minimal}
    <button class="ctrl" class:on={player.shuffle} type="button" aria-label="随机" onclick={toggleShuffle}>
      <Icon name="shuffle" size={18} />
    </button>
  {/if}
  <button class="ctrl" type="button" aria-label="上一首" onclick={prevTrack}>
    <Icon name="skip-back" size={minimal ? 20 : 22} strokeWidth={apple ? 2.25 : 1.75} />
  </button>
  <button class="ctrl ctrl-main" type="button" aria-label={player.playing ? '暂停' : '播放'} onclick={togglePlay}>
    <Icon name={player.playing ? 'pause' : 'play'} size={minimal ? 24 : 28} strokeWidth={apple ? 2.5 : 2} />
  </button>
  <button class="ctrl" type="button" aria-label="下一首" onclick={nextTrack}>
    <Icon name="skip-forward" size={minimal ? 20 : 22} strokeWidth={apple ? 2.25 : 1.75} />
  </button>
  {#if !minimal}
    <button class="ctrl" class:on={player.repeat !== 'off'} type="button" aria-label="循环" onclick={cycleRepeat}>
      <Icon name={repeatIcon} size={18} />
    </button>
  {/if}
</div>

{#if !hideProgress}
  <div class="player-progress" class:player-progress--quiet={quiet}>
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
    <div class="player-progress-times">
      <span>{formatTime(player.currentTime)}</span>
      <span>{formatTime(player.duration)}</span>
    </div>
  </div>
{/if}

{#if large && !minimal}
  <button class="now-playing-queue-btn" type="button" onclick={openQueueDrawer}>
    播放队列 · {player.queue.length} 首
  </button>
{/if}
