<script>
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import QueueList from './QueueList.svelte';
  import LyricsPanel from './LyricsPanel.svelte';
  import {
    utilityPane,
    closeUtilityPane,
    openUtilityPane,
    setUtilityPaneWidth,
    clampUtilityPaneWidth,
    getUtilityPaneWidthLimits,
  } from '$lib/ui.svelte.js';
  import { player, getCurrentTrack, seek } from '$lib/player.svelte.js';
  import { isNavChromeHidden } from '$lib/nav.js';
  import { resizePaneEdge } from '$lib/resizePaneEdge.js';
  import { t } from '$lib/i18n/index.js';

  const hidden = $derived(isNavChromeHidden(page.url.pathname));
  const track = $derived(getCurrentTrack());
  let wideEnough = $state(false);
  let resizing = $state(false);
  let viewportWidth = $state(0);

  const widthLimits = $derived.by(() => {
    void viewportWidth;
    return getUtilityPaneWidthLimits();
  });

  function persistPaneWidth() {
    setUtilityPaneWidth(utilityPane.width, { persist: true });
  }

  function onResizeWidth(width) {
    setUtilityPaneWidth(width, { persist: false });
  }

  function onResizeDragStart() {
    resizing = true;
    document.documentElement.classList.add('utility-pane-resizing');
  }

  function onResizeDragEnd() {
    resizing = false;
    document.documentElement.classList.remove('utility-pane-resizing');
    persistPaneWidth();
  }

  onMount(() => {
    viewportWidth = window.innerWidth;
    const onWindowResize = () => {
      viewportWidth = window.innerWidth;
      const clamped = clampUtilityPaneWidth(utilityPane.width);
      if (clamped !== utilityPane.width) {
        setUtilityPaneWidth(clamped);
      }
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      window.removeEventListener('resize', onWindowResize);
      document.documentElement.classList.remove('utility-pane-resizing');
    };
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1200px)');
    const update = () => {
      wideEnough = mq.matches;
      if (!mq.matches) closeUtilityPane();
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
</script>

{#if !hidden && wideEnough && utilityPane.open}
  <aside
    class="utility-pane"
    class:utility-pane--resizing={resizing}
    aria-label={utilityPane.tab === 'queue' ? t('nowPlaying.queue') : t('nowPlaying.lyrics')}
  >
    <button
      type="button"
      class="utility-pane-resize-handle"
      role="slider"
      aria-orientation="vertical"
      aria-label={t('utilityPane.resize')}
      aria-valuemin={widthLimits.min}
      aria-valuemax={widthLimits.max}
      aria-valuenow={utilityPane.width}
      aria-valuetext={`${utilityPane.width}px`}
      use:resizePaneEdge={{
        getWidth: () => utilityPane.width,
        onResize: onResizeWidth,
        onDragStart: onResizeDragStart,
        onDragEnd: onResizeDragEnd,
      }}
    ></button>

    <div class="utility-pane-head">
      <div class="utility-pane-tabs">
        <button
          type="button"
          class="utility-pane-tab"
          class:active={utilityPane.tab === 'queue'}
          onclick={() => openUtilityPane('queue')}
        >
          {t('nowPlaying.queue')}
        </button>
        <button
          type="button"
          class="utility-pane-tab"
          class:active={utilityPane.tab === 'lyrics'}
          onclick={() => openUtilityPane('lyrics')}
        >
          {t('nowPlaying.lyrics')}
        </button>
      </div>
      <button type="button" class="utility-pane-close" aria-label={t('common.close')} onclick={closeUtilityPane}>
        <Icon name="x" size={18} />
      </button>
    </div>

    <div class="utility-pane-body">
      {#if utilityPane.tab === 'queue'}
        <QueueList />
      {:else if track}
        <LyricsPanel
          lyrics={track.lyrics ?? ''}
          currentTime={player.currentTime}
          seekable
          onSeek={seek}
        />
      {:else}
        <p class="empty-state">{t('nowPlaying.queueEmpty')}</p>
      {/if}
    </div>
  </aside>
{/if}
