<script>
  import PageShell from '$lib/components/PageShell.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectUpcomingGroups } from '$lib/domain/selectors.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';

  const groups = $derived(selectUpcomingGroups(taskIndex()));
  const totalCount = $derived(
    groups.tomorrow.length + groups.week.length + groups.later.length,
  );
  const isEmpty = $derived(totalCount === 0);
</script>

<PageShell title={t('upcoming.title')}>
  {#snippet main()}
    {#if isEmpty}
      <EmptyState message={t('upcoming.emptyTitle')} hint={t('upcoming.emptyHint')} />
    {:else}
      {#if groups.tomorrow.length}
      <TaskGroup
        title={`${t('upcoming.tomorrow')} ${groups.tomorrow.length}`}
        hideCount
        tasks={groups.tomorrow}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
    {#if groups.week.length}
      <TaskGroup
        title={`${t('upcoming.week')} ${groups.week.length}`}
        hideCount
        tasks={groups.week}
        collapsible
        defaultExpanded={true}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
    {#if groups.later.length}
      <TaskGroup
        title={`${t('upcoming.later')} ${groups.later.length}`}
        hideCount
        tasks={groups.later}
        collapsible
        defaultExpanded={true}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
    {/if}
  {/snippet}
</PageShell>
