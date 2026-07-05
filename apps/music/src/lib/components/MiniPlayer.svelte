<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import { player, togglePlay } from '$lib/player.svelte.js';
  import { isMiniPlayerHidden } from '$lib/nav.js';

  const hidden = $derived(isMiniPlayerHidden(page.url.pathname));
  const track = $derived(player.queue[player.index] ?? null);
  const visible = $derived(Boolean(track) && !hidden);
</script>

<div class="mini-player" class:show={visible} aria-hidden={!visible}>
  <a class="mini-player-link" href="/now-playing">
    {#if track?.artUrl}
      <img class="mini-player-art" src={track.artUrl} alt="" />
    {:else}
      <div class="mini-player-art placeholder">♪</div>
    {/if}
    <div class="mini-player-meta">
      <div class="mini-player-title">{track?.title}</div>
      <div class="mini-player-artist">{track?.artist}</div>
    </div>
  </a>
  <div class="mini-player-actions">
    <button class="mini-player-btn play" type="button" aria-label={player.playing ? '暂停' : '播放'} onclick={togglePlay}>
      <Icon name={player.playing ? 'pause' : 'play'} size={20} strokeWidth={2} />
    </button>
  </div>
</div>
