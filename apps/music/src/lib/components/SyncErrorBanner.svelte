<script>
  import { onMount } from 'svelte';
  import { subscribeSyncError } from '$lib/syncNotify.js';
  import { connectivity } from '$lib/connectivity.svelte.js';
  import { t } from '$lib/i18n/index.js';

  let message = $state(null);

  onMount(() => subscribeSyncError((msg) => {
    message = msg;
  }));

  function dismiss() {
    message = null;
  }
</script>

{#if !connectivity.online}
  <div class="banner banner--row banner--fixed sync-status" role="status" aria-live="polite">
    <span class="banner__text">{t('sync.offlineQueued')}</span>
  </div>
{:else if connectivity.pendingSync}
  <div class="banner banner--row banner--fixed sync-status" role="status" aria-live="polite">
    <span class="banner__text">{t('sync.pending')}</span>
  </div>
{:else if message}
  <div class="banner critical banner--row banner--fixed" role="alert" aria-live="assertive">
    <span class="banner__text">{t('sync.banner', { reason: message })}</span>
    <button type="button" class="btn-ghost banner-close" onclick={dismiss}>{t('common.close')}</button>
  </div>
{/if}

<style>
  .sync-status {
    border-color: color-mix(in srgb, var(--info) 34%, transparent);
    background: color-mix(in srgb, var(--panel-h) 90%, var(--info) 10%);
    color: var(--t2);
  }
</style>
