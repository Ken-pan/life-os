<script>
  import { onMount, tick } from 'svelte'
  import NowPlayingScreen from './NowPlayingScreen.svelte'
  import NowPlayingAmbientBack from './NowPlayingAmbientBack.svelte'
  import { player } from '$lib/player.svelte.js'
  import { nowPlaying, finalizeCloseNowPlaying } from '$lib/ui.svelte.js'

  const track = $derived(player.queue[player.index] ?? null)
  const ambResolve = $derived(
    track
      ? {
          albumKey: track.albumKey,
          artist: track.artist,
          album: track.album,
          title: track.title,
        }
      : undefined,
  )

  /** Peak scrim opacity over the revealed page when the card is fully lifted. */
  const SCRIM_BASE = 0.5
  const EXIT_MS = 300

  /** @type {HTMLDivElement | null} */
  let overlayEl = $state(null)
  let shown = $state(false)
  let scrimOpacity = $state(SCRIM_BASE)
  let closing = false

  // Kick off the entrance once the overlay has mounted.
  $effect(() => {
    if (nowPlaying.open) {
      shown = false
      scrimOpacity = SCRIM_BASE
      closing = false
      void tick().then(() => requestAnimationFrame(() => (shown = true)))
    }
  })

  /** @param {number} p drag progress 0..1 — reveal the page as the card sinks. */
  function onDragProgress(p) {
    scrimOpacity = SCRIM_BASE * (1 - p)
  }

  /** @param {boolean} fromPopstate */
  function animateOutAndClose(fromPopstate) {
    if (closing) return
    closing = true
    const card = /** @type {HTMLElement | null} */ (
      overlayEl?.querySelector('.np-overlay-sheet') ?? null
    )
    if (card) {
      const h = (typeof window !== 'undefined' && window.innerHeight) || 800
      card.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.32, 0, 0.67, 0), opacity ${EXIT_MS}ms ease`
      // Force a reflow so the transition runs from the current (dragged) value.
      void card.offsetHeight
      card.style.transform = `translateY(${h}px)`
      card.style.opacity = '0'
    }
    scrimOpacity = 0
    setTimeout(() => finalizeCloseNowPlaying(fromPopstate), EXIT_MS + 20)
  }

  function requestClose() {
    animateOutAndClose(false)
  }

  onMount(() => {
    const onPop = () => {
      if (nowPlaying.open && !closing) animateOutAndClose(true)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })
</script>

{#if nowPlaying.open}
  <div
    class="np-overlay"
    class:np-overlay--shown={shown}
    bind:this={overlayEl}
    role="dialog"
    aria-modal="true"
  >
    <div class="np-overlay-scrim" style:opacity={scrimOpacity} aria-hidden="true"></div>
    <div class="np-overlay-sheet">
      {#if track}
        <NowPlayingAmbientBack artUrl={track.artUrl} resolve={ambResolve} inline />
      {/if}
      <NowPlayingScreen
        overlay
        onDismiss={requestClose}
        surfaceSelector=".np-overlay-sheet"
        {onDragProgress}
      />
    </div>
  </div>
{/if}

<style>
  .np-overlay {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-toast, 120) - 1);
    display: flex;
    isolation: isolate;
  }

  .np-overlay-scrim {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: #000;
    pointer-events: none;
    transition: opacity 140ms ease;
  }

  /* Entrance/exit + drag all ride on the padding-free sheet wrapper so its
     background, ambient and content move as one and reveal the page behind. */
  .np-overlay-sheet {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    min-height: 0;
    /* Opaque base behind the (semi-transparent) ambient art so the live page
       stays fully hidden when open; it slides away with the card on drag. */
    background: #0a0608;
    transform: translateY(100%);
    transition: transform 400ms var(--ease-emphasized, cubic-bezier(0.2, 0.9, 0.3, 1));
    will-change: transform;
  }

  .np-overlay--shown .np-overlay-sheet {
    transform: none;
  }

  /* Absolute (not fixed) so it reliably moves with the transformed sheet on
     iOS Safari — a fixed descendant of a transformed ancestor is not honoured
     there, which left the ambient pinned full-screen and hid the page. */
  .np-overlay-sheet :global(.np-ambient-back--inline) {
    position: absolute;
    z-index: 0;
  }

  .np-overlay-sheet :global(.now-playing) {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 100dvh;
  }

  @media (prefers-reduced-motion: reduce) {
    .np-overlay-sheet {
      transition: none;
    }
  }
</style>
