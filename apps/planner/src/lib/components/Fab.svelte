<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import { openTaskEditor, taskEditor, calendarView, schedulePopover } from '$lib/ui.svelte.js';
  import { resolveFabMode } from '$lib/nav.js';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';

  const pathname = $derived(page.url.pathname);
  const search = $derived(page.url.search);

  const mode = $derived(resolveFabMode(pathname, search));
  const hidden = $derived(
    taskEditor.open || schedulePopover.open || mode === 'none',
  );

  function defaults() {
    const path = pathname;
    if (path === '/') return { dueDate: todayKey() };
    if (path.startsWith('/calendar')) return { dueDate: calendarView.selected || todayKey() };
    if (path.startsWith('/lists/')) {
      const listId = path.split('/')[2];
      return listId ? { listId, dueDate: null } : {};
    }
    if (path.startsWith('/upcoming')) return { dueDate: null };
    return {};
  }

  const label = $derived(
    pathname.startsWith('/lists/')
      ? t('lists.addToProject')
      : mode === 'compact'
        ? t('common.add')
        : t('common.addTask'),
  );
</script>

{#if !hidden}
  <button
    type="button"
    class="fab"
    class:fab--compact={mode === 'compact'}
    data-testid="fab-add"
    data-fab-mode={mode}
    aria-label={label}
    onclick={() => openTaskEditor(null, defaults())}
  >
    <Icon name="plus" size={mode === 'compact' ? 22 : 18} strokeWidth={2} />
    {#if mode === 'large'}
      <span class="fab-label">{label}</span>
    {/if}
  </button>
{/if}
