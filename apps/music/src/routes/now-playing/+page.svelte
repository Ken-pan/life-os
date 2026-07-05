<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import PlayerControls from '$lib/components/PlayerControls.svelte';
  import TrackArt from '$lib/components/TrackArt.svelte';
  import AudioVisualizer from '$lib/components/AudioVisualizer.svelte';
  import LyricsPanel from '$lib/components/LyricsPanel.svelte';
  import { swipeDismiss, swipeTrack } from '$lib/gestures.js';
  import { consumeNowPlayingReturn, ensureNowPlayingReturn } from '$lib/nav.js';
  import { player, nextTrack, prevTrack } from '$lib/player.svelte.js';

  const track = $derived(player.queue[player.index] ?? null);

  function dismiss() {
    goto(consumeNowPlayingReturn('/'));
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') dismiss();
    if (e.key === 'ArrowLeft') prevTrack();
    if (e.key === 'ArrowRight') nextTrack();
  }

  onMount(() => {
    ensureNowPlayingReturn('/');
  });
</script>

<svelte:window onkeydown={onKeydown} />

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

    <AudioVisualizer />
    <PlayerControls large />
    <LyricsPanel lyrics={track.lyrics} />
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/library">{t('nav.library')}</a>
    </div>
  {/if}
</div>
