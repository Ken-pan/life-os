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

  let { large = false } = $props();

  const repeatIcon = $derived(player.repeat === 'one' ? 'repeat-1' : 'repeat');
</script>

<div class="player-controls" class:player-controls--large={large}>
  <button class="ctrl" class:on={player.shuffle} type="button" aria-label="随机" onclick={toggleShuffle}>
    <Icon name="shuffle" size={18} />
  </button>
  <button class="ctrl" type="button" aria-label="上一首" onclick={prevTrack}>
    <Icon name="skip-back" size={22} />
  </button>
  <button class="ctrl ctrl-main" type="button" aria-label={player.playing ? '暂停' : '播放'} onclick={togglePlay}>
    <Icon name={player.playing ? 'pause' : 'play'} size={28} strokeWidth={2} />
  </button>
  <button class="ctrl" type="button" aria-label="下一首" onclick={nextTrack}>
    <Icon name="skip-forward" size={22} />
  </button>
  <button class="ctrl" class:on={player.repeat !== 'off'} type="button" aria-label="循环" onclick={cycleRepeat}>
    <Icon name={repeatIcon} size={18} />
  </button>
</div>

<div class="player-progress">
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

{#if large}
  <button class="btn-secondary" type="button" style="margin-top: 12px" onclick={openQueueDrawer}>
    播放队列 · {player.queue.length} 首
  </button>
{/if}
