<script>
  import { onMount } from 'svelte';
  import { subscribeSyncError } from '$lib/syncNotify.js';
  import { t } from '$lib/i18n/index.js';

  let message = $state(null);

  onMount(() => subscribeSyncError((msg) => {
    message = msg;
  }));

  function dismiss() {
    message = null;
  }
</script>

{#if message}
  <div class="banner critical banner--row banner--fixed" role="alert" aria-live="assertive">
    <span class="banner__text">{t('sync.banner', { reason: message })}</span>
    <button type="button" class="btn-ghost banner-close" onclick={dismiss}>{t('common.close')}</button>
  </div>
{/if}
