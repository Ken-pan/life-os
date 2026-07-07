<script>
  import { t } from '$lib/i18n/index.js';
  import Icon from './Icon.svelte';

  /** @type {{ message?: string, hint?: string }} */
  let { message = t('common.empty'), hint = '' } = $props();
</script>

<div class="empty">
  <div class="empty-icon">
    <Icon name="sun" size={48} strokeWidth={1.5} />
  </div>
  <p>{message}</p>
  {#if hint}
    <p class="empty-hint">{hint}</p>
  {/if}
</div>

<style>
  .empty-hint {
    margin: var(--space-2) 0 0;
    color: var(--t3);
    font-size: var(--text-sm);
    line-height: 1.45;
  }
</style>
