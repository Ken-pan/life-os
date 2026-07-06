<script>
  import { page } from '$app/state';
  import Icon from './Icon.svelte';
  import { openTaskEditor, taskEditor, calendarView, schedulePopover } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';

  const hideFabRoutes = ['/settings', '/auth', '/search', '/completed'];

  const hidden = $derived(
    taskEditor.open ||
      schedulePopover.open ||
      hideFabRoutes.some((p) => page.url.pathname.startsWith(p))
  );

  // 按页面上下文预填默认截止日期：今天页 → 今天；日历页 → 选中的日期
  function defaults() {
    const path = page.url.pathname;
    if (path === '/') return { dueDate: todayKey() };
    if (path.startsWith('/calendar')) return { dueDate: calendarView.selected || todayKey() };
    return {};
  }
</script>

{#if !hidden}
  <button
    type="button"
    class="fab"
    data-testid="fab-add"
    aria-label={t('common.addTask')}
    onclick={() => openTaskEditor(null, defaults())}
  >
    <Icon name="plus" size={18} strokeWidth={2} />
    <span class="fab-label">{t('common.addTask')}</span>
  </button>
{/if}
