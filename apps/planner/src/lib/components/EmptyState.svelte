<script>
  // 薄封装：共享 EmptyState（@life-os/platform-web/svelte/status）+ planner 的
  // 太阳图标与原有文案层级（message 为普通段落，hint 为小字）。
  import { t } from '$lib/i18n/index.js';
  import { EmptyState } from '@life-os/platform-web/svelte/status';

  /** @type {{ message?: string, hint?: string }} */
  let { message = t('common.empty'), hint = '' } = $props();
</script>

<EmptyState icon="sun">
  <p>{message}</p>
  {#if hint}
    <p class="empty-hint">{hint}</p>
  {/if}
</EmptyState>

<style>
  .empty-hint {
    margin: var(--space-2) 0 0;
    color: var(--t3);
    font-size: var(--text-sm);
    line-height: 1.45;
  }
</style>
