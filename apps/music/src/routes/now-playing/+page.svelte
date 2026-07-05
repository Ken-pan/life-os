<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import PlayerControls from '$lib/components/PlayerControls.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import { swipeDismiss, swipeTrack } from '$lib/gestures.js';
  import { consumeNowPlayingReturn } from '$lib/nav.js';
  import { player, nextTrack, prevTrack } from '$lib/player.svelte.js';

  const track = $derived(player.queue[player.index] ?? null);

  function dismiss() {
    goto(consumeNowPlayingReturn('/'));
  }
</script>

<div class="now-playing">
  {#if track}
    <button class="now-playing-handle" type="button" aria-label={t('common.back')} onclick={dismiss}></button>

    <div class="now-playing-swipe-zone" use:swipeDismiss={{ onDismiss: dismiss }}>
      <div class="now-playing-art-wrap" use:swipeTrack={{ onPrev: prevTrack, onNext: nextTrack }}>
        <TrackArt artUrl={track.artUrl} seed={track.id} class="now-playing-art" shared />
      </div>
      <div class="now-playing-copy">
        <h1 class="now-playing-title">{track.title}</h1>
        <p class="now-playing-artist">{track.artist}</p>
        <p class="now-playing-album">{track.album}</p>
      </div>
    </div>

    <PlayerControls large />
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/library">去资料库</a>
    </div>
  {/if}
</div>
