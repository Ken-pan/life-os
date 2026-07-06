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
  import { player, nextTrack, prevTrack, togglePlay, refreshQueueMetadata, seek } from '$lib/player.svelte.js';
  import { hasPlayableSource } from '$lib/cloudAudio.js';
  import { db } from '$lib/db.js';
  import { fetchLyricsForTrack } from '$lib/lyricsFetch.js';
  import { scheduleAutoCloudPush } from '$lib/sync.js';

  const track = $derived(player.queue[player.index] ?? null);
  let lyricsFetching = $state(false);

  $effect(() => {
    const tr = track;
    if (!tr?.id || tr.lyrics?.trim()) {
      lyricsFetching = false;
      return;
    }

    let cancelled = false;
    lyricsFetching = true;

    void (async () => {
      const fetched = await fetchLyricsForTrack(tr);
      if (cancelled) return;
      lyricsFetching = false;
      if (!fetched?.text) return;
      await db.tracks.update(tr.id, { lyrics: fetched.text });
      await refreshQueueMetadata();
      scheduleAutoCloudPush();
    })();

    return () => {
      cancelled = true;
      lyricsFetching = false;
    };
  });

  const seekable = $derived(Boolean(track && hasPlayableSource(track)));

  function dismiss() {
    goto(consumeNowPlayingReturn('/'));
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') dismiss();
    if (e.key === 'ArrowLeft') prevTrack();
    if (e.key === 'ArrowRight') nextTrack();
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    }
  }

  onMount(() => {
    ensureNowPlayingReturn('/');
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="now-playing">
  {#if track}
    <button class="now-playing-handle" type="button" aria-label={t('common.back')} onclick={dismiss}></button>

    <div class="now-playing-layout" use:swipeDismiss={{ onDismiss: dismiss }}>
      <div class="now-playing-art-col">
        <div class="now-playing-art-wrap" use:swipeTrack={{ onPrev: prevTrack, onNext: nextTrack }}>
          <TrackArt artUrl={track.artUrl} seed={track.id} class="now-playing-art" shared />
        </div>
      </div>

      <div class="now-playing-main-col">
        <div class="now-playing-copy">
          <h1 class="now-playing-title">{track.title}</h1>
          <p class="now-playing-artist">{track.artist}</p>
          <p class="now-playing-album">{track.album}</p>
        </div>

        <div class="now-playing-controls-stack">
          <AudioVisualizer />
          <PlayerControls large />
        </div>

        {#if player.statusHint}
          <p class="now-playing-status-hint" role="status">{player.statusHint}</p>
        {/if}

        <LyricsPanel
          lyrics={track.lyrics}
          currentTime={player.currentTime}
          fetching={lyricsFetching}
          seekable={seekable}
          onSeek={seek}
        />
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <p>{t('common.empty')}</p>
      <a class="btn-primary" href="/library">{t('nav.library')}</a>
    </div>
  {/if}
</div>
