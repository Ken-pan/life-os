<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectUpcomingGroups } from '$lib/domain/selectors.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';

  const groups = $derived(selectUpcomingGroups(taskIndex()));
  const isEmpty = $derived(
    !groups.today.length &&
      !groups.tomorrow.length &&
      !groups.week.length &&
      !groups.later.length &&
      !groups.nodate.length
  );
</script>

<AppBar title={t('upcoming.title')} />

<div class="wrap">
  {#if isEmpty}
    <EmptyState message={t('common.empty')} />
  {:else}
    {#if groups.today.length}
      <TaskGroup title={t('home.today')} tasks={groups.today} compactRows onToggle={completeTask} onEdit={editTask} />
    {/if}
    {#if groups.tomorrow.length}
      <TaskGroup title={t('upcoming.tomorrow')} tasks={groups.tomorrow} compactRows onToggle={completeTask} onEdit={editTask} />
    {/if}
    {#if groups.week.length}
      <TaskGroup
        title={t('upcoming.week')}
        tasks={groups.week}
        collapsible
        defaultExpanded={false}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
    {#if groups.later.length}
      <TaskGroup
        title={t('upcoming.later')}
        tasks={groups.later}
        collapsible
        defaultExpanded={false}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
    {#if groups.nodate.length}
      <TaskGroup
        title={t('upcoming.nodate')}
        tasks={groups.nodate}
        collapsible
        defaultExpanded={false}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
  {/if}
</div>
