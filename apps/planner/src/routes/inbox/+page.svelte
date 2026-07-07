<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import QuickAddBar from '$lib/components/QuickAddBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectInboxTasks } from '$lib/domain/selectors.js';
  import { SYSTEM_LIST_INBOX } from '$lib/types.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';
  import { sortTasks } from '$lib/engine/prioritizer.js';
  import { openTaskEditor } from '$lib/ui.svelte.js';

  const tasks = $derived(sortTasks(selectInboxTasks(taskIndex(), SYSTEM_LIST_INBOX)));
</script>

<AppBar title={t('inbox.title')} />

<div class="wrap">
  <QuickAddBar listId={SYSTEM_LIST_INBOX} dueDate={null} showOnMobile placeholder={t('inbox.quickAdd')} />
  {#if tasks.length}
    <TaskGroup
      title={t('inbox.pendingTitle', { count: tasks.length })}
      hideCount
      {tasks}
      compactRows
      showScheduleAction
      onToggle={completeTask}
      onEdit={editTask}
    />
    <p class="page-hint">{t('inbox.sparseHint', { count: tasks.length })}</p>
  {:else}
    <EmptyState message={t('inbox.emptyTitle')} hint={t('inbox.emptyHint')} />
    <button
      type="button"
      class="btn-secondary inbox-empty-action"
      onclick={() => openTaskEditor(null, { listId: SYSTEM_LIST_INBOX })}
    >
      {t('inbox.emptyAction')}
    </button>
  {/if}
</div>

<style>
  .inbox-empty-action {
    width: 100%;
    margin-top: var(--space-3);
  }
</style>
