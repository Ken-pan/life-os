<script>
  import PageShell from '$lib/components/PageShell.svelte'
  import TaskGroup from '$lib/components/TaskGroup.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import { page } from '$app/state'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import { selectUpcomingGroups, selectTodayGroups } from '$lib/domain/selectors.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { t } from '$lib/i18n/index.js'

  const filter = $derived(page.url.searchParams.get('kenosFilter'))
  const overdueOnly = $derived(filter === 'overdue')

  const groups = $derived(selectUpcomingGroups(taskIndex()))
  const todayGroups = $derived(selectTodayGroups(taskIndex()))
  const overdueTasks = $derived(overdueOnly ? todayGroups.overdue || [] : [])
  const totalCount = $derived(
    overdueOnly
      ? overdueTasks.length
      : groups.tomorrow.length + groups.week.length + groups.later.length,
  )
  const isEmpty = $derived(totalCount === 0)
</script>

<PageShell title={t('upcoming.title')}>
  {#snippet main()}
    {#if overdueOnly}
      <p class="filter-chip" role="status">筛选 · 已逾期</p>
    {/if}
    {#if isEmpty}
      <EmptyState message={t('upcoming.emptyTitle')} hint={t('upcoming.emptyHint')} />
    {:else if overdueOnly}
      <TaskGroup
        title={`${t('home.overdue')} ${overdueTasks.length}`}
        hideCount
        tasks={overdueTasks}
        compactRows
        onToggle={completeTask}
        onEdit={editTask}
      />
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

<style>
  .filter-chip {
    margin: 0 0 12px;
    color: var(--t3);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
