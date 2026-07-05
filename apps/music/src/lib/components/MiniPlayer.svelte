<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import TrackArt from './TrackArt.svelte';
  import { player, togglePlay } from '$lib/player.svelte.js';
  import { isMiniPlayerHidden, markNowPlayingReturn } from '$lib/nav.js';

  const hidden = $derived(isMiniPlayerHidden(page.url.pathname));
  const track = $derived(player.queue[player.index] ?? null);
  const visible = $derived(Boolean(track) && !hidden);
</script>

<div class="mini-player" class:show={visible} aria-hidden={!visible}>
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
  <div class="mini-player-actions">
    <button class="mini-player-btn play" type="button" aria-label={player.playing ? '暂停' : '播放'} onclick={togglePlay}>
      <Icon name={player.playing ? 'pause' : 'play'} size={20} strokeWidth={2} />
    </button>
  </div>
</div>
