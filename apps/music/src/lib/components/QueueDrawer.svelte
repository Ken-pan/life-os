<script>
  import { queueDrawerOpen, closeQueueDrawer } from '$lib/ui.svelte.js';
  import QueueList from './QueueList.svelte';
  import { t } from '$lib/i18n/index.js';
</script>

{#if queueDrawerOpen.open}
  <button type="button" class="sheet-bg" style="display:block;background:rgba(0,0,0,.45)" aria-label={t('common.close')} onclick={closeQueueDrawer}></button>

  <div class="queue-drawer open" role="dialog" aria-modal="true" aria-label={t('nowPlaying.queue')}>
    <div class="queue-drawer-head">
      <strong>{t('nowPlaying.queue')}</strong>
      <button type="button" class="btn-ghost" onclick={closeQueueDrawer}>{t('common.close')}</button>
    </div>
    <div class="queue-drawer-body">
      <QueueList />
    </div>
  </div>
{/if}
