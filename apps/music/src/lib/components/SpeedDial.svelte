<script>
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.js';
  import SpeedDialCell from './SpeedDialCell.svelte';
  import Icon from './Icon.svelte';
  import { auth } from '$lib/auth.svelte.js';
  import { getCurrentTrack } from '$lib/player.svelte.js';

  /** @type {{ pages: import('$lib/speedDial.js').SpeedDialPage[], onChange?: () => void }} */
  let { pages = [], onChange } = $props();

  let carouselEl = $state(null);
  let activePage = $state(0);

  const spotlight = $derived(getCurrentTrack());
  const personalLabel = $derived.by(() => {
    const email = auth.user?.email;
    if (!email) return t('home.speedDialKicker');
    const name = email.split('@')[0];
    return name ? name.toUpperCase() : t('home.speedDialKicker');
  });

  onMount(() => {
    if (!carouselEl) return;
    const onScroll = () => {
      if (!carouselEl) return;
      const width = carouselEl.clientWidth;
      if (!width) return;
      activePage = Math.round(carouselEl.scrollLeft / width);
    };
    carouselEl.addEventListener('scroll', onScroll, { passive: true });
    return () => carouselEl?.removeEventListener('scroll', onScroll);
  });

  /** @param {number} index */
  function goToPage(index) {
    if (!carouselEl) return;
    const clamped = Math.max(0, Math.min(index, pages.length - 1));
    carouselEl.scrollTo({ left: clamped * carouselEl.clientWidth, behavior: 'smooth' });
    activePage = clamped;
  }

  /** @param {import('$lib/speedDial.js').SpeedDialCell} cell */
  function isCellActive(cell) {
    if (!spotlight || cell.variant === 'add') return false;
    return cell.tracks.some((track) => track.id === spotlight.id);
  }
</script>

<section class="speed-dial" aria-label={t('home.speedDial')}>
  <header class="speed-dial-head">
    <p class="speed-dial-kicker">{personalLabel} · {t('home.speedDialPersonal')}</p>
    <a class="speed-dial-title-link" href="/speed-dial">
      <h3 class="speed-dial-title">{t('home.speedDial')}</h3>
      <Icon name="chevron-right" size={18} class="speed-dial-chevron" />
    </a>
  </header>

  <div class="speed-dial-carousel" bind:this={carouselEl}>
    {#each pages as page (page.id)}
      <div class="speed-dial-page" aria-label={page.label}>
        <div class="speed-dial-grid">
          {#each page.cells as cell, index (cell.id)}
            <SpeedDialCell {cell} active={isCellActive(cell)} slotIndex={index} {onChange} />
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if pages.length > 1}
    <div class="speed-dial-dots" role="tablist" aria-label={t('home.speedDialPages')}>
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
    gap: 12px;
  }

  .speed-dial-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .speed-dial-kicker {
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--t3, var(--text-muted));
  }

  .speed-dial-title-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: inherit;
    text-decoration: none;
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
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .speed-dial-title-link :global(.speed-dial-chevron) {
    color: var(--t3, var(--text-muted));
    margin-top: 2px;
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
    gap: 8px;
    width: 100%;
  }

  @media (--life-os-mobile) {
    .speed-dial-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .speed-dial-title {
      font-size: var(--text-xl);
    }
  }

  .speed-dial-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 10px;
  }

  .speed-dial-dot {
    position: relative;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: none;
    padding: 0;
    background: rgba(255, 255, 255, 0.28);
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

  .speed-dial-dots {
    position: relative;
  }

  .speed-dial-dot.active {
    background: rgba(255, 255, 255, 0.92);
    transform: scale(1.15);
  }
</style>
