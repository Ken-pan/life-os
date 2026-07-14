<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import SpeedDialCell from './SpeedDialCell.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { getCurrentTrack } from '$lib/player.svelte.js'
  import { playTracks } from '$lib/player.svelte.js'
  import { speedDialAllTracks } from '$lib/speedDial.js'

  /** @type {{ pages: import('$lib/speedDial.js').SpeedDialPage[], onChange?: () => void }} */
  let { pages = [], onChange } = $props()

  let carouselEl = $state(null)
  let activePage = $state(0)

  const spotlight = $derived(getCurrentTrack())
  const playableTracks = $derived(speedDialAllTracks(pages))

  onMount(() => {
    if (!carouselEl) return
    // Cache page width (only changes on resize) and coalesce active-page
    // updates to one per frame — the raw scroll event fires far faster and
    // reading clientWidth on each one thrashes layout mid-swipe.
    let pageWidth = carouselEl.clientWidth
    let ticking = false
    const measure = () => {
      if (carouselEl) pageWidth = carouselEl.clientWidth
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        if (!carouselEl || !pageWidth) return
        activePage = Math.round(carouselEl.scrollLeft / pageWidth)
      })
    }
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(carouselEl)
    carouselEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      carouselEl?.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  })

  /** @param {number} index */
  function goToPage(index) {
    if (!carouselEl) return
    const clamped = Math.max(0, Math.min(index, pages.length - 1))
    carouselEl.scrollTo({
      left: clamped * carouselEl.clientWidth,
      behavior: 'smooth',
    })
    activePage = clamped
  }

  /** @param {import('$lib/speedDial.js').SpeedDialCell} cell */
  function isCellActive(cell) {
    if (!spotlight || cell.variant === 'surprise') return false
    return cell.tracks.some((track) => track.id === spotlight.id)
  }

  function playAll() {
    if (!playableTracks.length) return
    playTracks(playableTracks, 0, 'speed_dial', {
      entityType: 'collection',
      entityId: 'speed_dial_all',
    })
  }
</script>

<section class="speed-dial" aria-label={t('home.speedDial')}>
  <header class="speed-dial-head">
    <a class="speed-dial-title-link" href="/speed-dial">
      <h3 class="speed-dial-title">{t('home.speedDial')}</h3>
      <Icon name="chevron-right" size={18} class="speed-dial-chevron" />
    </a>
    {#if playableTracks.length}
      <button type="button" class="speed-dial-play-all" onclick={playAll}>
        {t('home.speedDialPlayAll')}
      </button>
    {/if}
  </header>

  <div class="speed-dial-carousel" bind:this={carouselEl}>
    {#each pages as page (page.id)}
      <div class="speed-dial-page" aria-label={page.label}>
        <div class="speed-dial-grid">
          {#each page.cells as cell, index (cell.id)}
            <SpeedDialCell
              {cell}
              active={isCellActive(cell)}
              slotIndex={index}
              {onChange}
            />
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if pages.length > 1}
    <div
      class="speed-dial-dots"
      role="tablist"
      aria-label={t('home.speedDialPages')}
    >
      {#each pages as page, index (page.id)}
        <button
          type="button"
          role="tab"
          class="speed-dial-dot"
          class:active={activePage === index}
          aria-selected={activePage === index}
          aria-label={page.label}
          onclick={() => goToPage(index)}
        ></button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .speed-dial {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
  }

  .speed-dial-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 32px;
  }

  .speed-dial-title-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }

  .speed-dial-title-link:focus-visible .speed-dial-title {
    color: var(--t1, var(--text));
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-title-link:hover .speed-dial-title {
      color: var(--t1, var(--text));
    }
  }

  .speed-dial-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .speed-dial-title-link :global(.speed-dial-chevron) {
    color: var(--t3, var(--text-muted));
    flex-shrink: 0;
  }

  .speed-dial-play-all {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: var(--radius-pill);
    touch-action: manipulation;
  }

  @media (hover: hover) and (pointer: fine) {
    .speed-dial-play-all:hover {
      color: var(--t1, var(--text));
      background: color-mix(in srgb, var(--t1) 6%, transparent);
    }
  }

  .speed-dial-carousel {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .speed-dial-carousel::-webkit-scrollbar {
    display: none;
  }

  .speed-dial-page {
    flex: 0 0 100%;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  .speed-dial-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 11px;
    width: 100%;
  }

  .speed-dial-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 12px;
  }

  .speed-dial-dot {
    position: relative;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: none;
    padding: 0;
    background: rgba(255, 255, 255, 0.22);
    transition:
      transform var(--dur-fast) var(--ease-standard),
      background var(--dur-fast) var(--ease-standard);
    touch-action: manipulation;
  }

  .speed-dial-dot::before {
    content: '';
    position: absolute;
    inset: -12px;
  }

  .speed-dial-dot.active {
    background: rgba(255, 255, 255, 0.88);
    transform: scale(1.2);
  }
</style>
