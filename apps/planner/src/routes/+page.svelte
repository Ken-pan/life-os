<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import QuickAddBar from '$lib/components/QuickAddBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import InsightCard from '$lib/components/InsightCard.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectTodayGroups } from '$lib/domain/selectors.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';

  const groups = $derived(selectTodayGroups(taskIndex()));
  const total = $derived(groups.overdue.length + groups.today.length);
  const fullyEmpty = $derived(!total && !groups.noDate.length);
</script>

<AppBar title={t('home.title')} subtitle={t('app.tagline')} />

<div class="wrap">
  <QuickAddBar dueDate={todayKey()} />
  <InsightCard />

  {#if fullyEmpty}
    <EmptyState message={t('common.empty')} />
  {:else}
    {#if groups.overdue.length}
      <TaskGroup title={t('home.overdue')} tasks={groups.overdue} compactRows onToggle={completeTask} onEdit={editTask} />
    {/if}
    {#if groups.today.length}
      <TaskGroup title={t('home.today')} tasks={groups.today} compactRows onToggle={completeTask} onEdit={editTask} />
    {/if}
    {#if !total && groups.noDate.length}
      <TaskGroup title={t('home.nodate')} tasks={groups.noDate.slice(0, 5)} compactRows onToggle={completeTask} onEdit={editTask} />
    {/if}
  {/if}
</div>
