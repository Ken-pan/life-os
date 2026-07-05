<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import { openTaskEditor, taskEditor } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';

  const hideFabRoutes = ['/settings', '/auth', '/search', '/completed'];

  const hidden = $derived(
    taskEditor.open || hideFabRoutes.some((p) => page.url.pathname.startsWith(p))
  );
</script>

{#if !hidden}
  <button
    type="button"
    class="fab"
    data-testid="fab-add"
    aria-label={t('common.addTask')}
    onclick={() => openTaskEditor()}
  >
    <Icon name="plus" size={18} strokeWidth={2} />
    <span class="fab-label">{t('common.addTask')}</span>
  </button>
{/if}
