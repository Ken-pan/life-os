<script>
  import Icon from './Icon.svelte';
  import TrackArt from './TrackArt.svelte';
  import { playTrack, playTracks } from '$lib/player.svelte.js';
  import { toggleLike } from '$lib/db.js';

  /** @type {{ track: import('$lib/types.js').Track, tracks?: import('$lib/types.js').Track[], index?: number, showLike?: boolean }} */
  let { track, tracks = [], index = 0, showLike = true } = $props();

  function onPlay() {
    if (tracks.length) playTracks(tracks, index);
    else playTrack(track);
  }

  async function onLike() {
    await toggleLike(track.id);
    track.liked = track.liked ? 0 : 1;
  }
</script>

<div class="track-row">
  <TrackArt artUrl={track.artUrl} seed={track.id} class="track-row-art" />
  <button type="button" class="track-row-body" onclick={onPlay}>
    <div class="track-row-title">{track.title}</div>
    <div class="track-row-sub">{track.artist} · {track.album}</div>
  </button>
  <div class="track-row-actions">
    {#if showLike}
      <button type="button" class="mini-player-btn" aria-label="喜欢" onclick={onLike}>
        <Icon name="heart" size={18} strokeWidth={track.liked ? 2.5 : 1.75} />
      </button>
    {/if}
    <button type="button" class="mini-player-btn play" aria-label="播放" onclick={onPlay}>
      <Icon name="play" size={16} strokeWidth={2} />
    </button>
  </div>
</div>

<style>
  .track-row-body {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    padding: 0;
    color: inherit;
  }
</style>
