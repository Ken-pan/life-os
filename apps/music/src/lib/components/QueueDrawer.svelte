<script>
  import { useSheetEnterShown } from '@life-os/platform-web/svelte/overlay'
  import { queueDrawerOpen, closeQueueDrawer } from '$lib/ui.svelte.js'
  import QueueList from './QueueList.svelte'
  import { t } from '$lib/i18n/index.js'

  const enter = useSheetEnterShown(() => queueDrawerOpen.open)
</script>

{#if queueDrawerOpen.open}
  <button
    type="button"
    class="sheet-bg kenos-sheet-motion"
    class:show={enter.shown}
    style="display:block;background:rgba(0,0,0,.45)"
    aria-label={t('common.close')}
    onclick={closeQueueDrawer}
  ></button>

  <div
    class="queue-drawer"
    class:open={enter.shown}
    role="dialog"
    aria-modal="true"
    aria-label={t('nowPlaying.queue')}
  >
    <div class="queue-drawer-head">
      <strong>{t('nowPlaying.queue')}</strong>
      <button type="button" class="btn-ghost" onclick={closeQueueDrawer}
        >{t('common.close')}</button
      >
    </div>
    <div class="queue-drawer-body">
      <QueueList />
    </div>
  </div>
{/if}
