<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import QueueList from './QueueList.svelte';
  import LyricsPanel from './LyricsPanel.svelte';
  import { utilityPane, closeUtilityPane, openUtilityPane } from '$lib/ui.svelte.js';
  import { player, getCurrentTrack, seek } from '$lib/player.svelte.js';
  import { isNavChromeHidden } from '$lib/nav.js';
  import { t } from '$lib/i18n/index.js';

  const hidden = $derived(isNavChromeHidden(page.url.pathname));
  const track = $derived(getCurrentTrack());
  let wideEnough = $state(false);

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
  <aside class="utility-pane" aria-label={utilityPane.tab === 'queue' ? t('nowPlaying.queue') : t('nowPlaying.lyrics')}>
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
