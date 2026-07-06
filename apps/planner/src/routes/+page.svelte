<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import QuickAddBar from '$lib/components/QuickAddBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import InsightCard from '$lib/components/InsightCard.svelte';
  import TodayProgressCard from '$lib/components/TodayProgressCard.svelte';
  import TodayRecapPanel from '$lib/components/TodayRecapPanel.svelte';
  import TodayClosedCelebration from '$lib/components/TodayClosedCelebration.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectTodayGroups, selectTodayProgress, selectNextBestAction } from '$lib/domain/selectors.js';
  import { computeRhythmSummary, computeTodayClosedStats } from '$lib/domain/rhythm.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';
  import { S, todayKey } from '$lib/state.svelte.js';

  const index = $derived(taskIndex());
  const groups = $derived(selectTodayGroups(index));
  const progress = $derived(selectTodayProgress(index));
  const rhythm = $derived(computeRhythmSummary(S.tasks, S.settings, progress));
  const nextTask = $derived(selectNextBestAction(index));
  const total = $derived(groups.overdue.length + groups.today.length);
  const fullyEmpty = $derived(!total && !groups.noDate.length && !progress.doneToday.length);
  const showProgress = $derived(progress.total > 0 || progress.doneToday.length > 0);
  const allPlanDone = $derived(progress.total > 0 && progress.remaining === 0);

  let showClosed = $state(false);

  $effect(() => {
    if (!allPlanDone) {
      showClosed = false;
      return;
    }
    try {
      const dismissed = sessionStorage.getItem('planner_today_closed');
      showClosed = dismissed !== todayKey();
    } catch {
      showClosed = true;
    }
  });

  const closedStats = $derived(computeTodayClosedStats(S.tasks, todayKey()));
</script>

<AppBar title={t('home.title')} subtitle={t('app.tagline')} />

<div class="today-layout">
  <div class="today-main">
    <div class="wrap">
      <QuickAddBar dueDate={todayKey()} />

      {#if showProgress}
        <TodayProgressCard
          done={progress.done}
          total={progress.total}
          remaining={progress.remaining}
          doneTodayCount={progress.doneToday.length}
          streak={rhythm.streak}
          weeklyActive={rhythm.weekly.active}
          rhythmEnabled={rhythm.enabled && !rhythm.paused}
        />
      {/if}

      {#if showClosed}
        <TodayClosedCelebration stats={closedStats} onDismiss={() => (showClosed = false)} />
      {/if}

      <InsightCard />

      {#if fullyEmpty}
        <EmptyState message={t('common.empty')} />
      {:else}
        {#if groups.overdue.length}
          <TaskGroup
            title={t('home.overdue')}
            tasks={groups.overdue}
            compactRows
            ritualComplete
            onToggle={completeTask}
            onEdit={editTask}
          />
        {/if}
        {#if groups.today.length}
          <TaskGroup
            title={t('home.today')}
            tasks={groups.today}
            compactRows
            ritualComplete
            onToggle={completeTask}
            onEdit={editTask}
          />
        {/if}
        {#if !total && groups.noDate.length}
          <TaskGroup
            title={t('home.nodate')}
            tasks={groups.noDate.slice(0, 5)}
            compactRows
            onToggle={completeTask}
            onEdit={editTask}
          />
        {/if}

        {#if progress.doneToday.length}
          <TaskGroup
            sectionId="done-today"
            title={t('home.doneToday')}
            tasks={progress.doneToday}
            compactRows
            collapsible
            defaultExpanded={progress.doneToday.length <= 3}
            onToggle={completeTask}
            onEdit={editTask}
          />
        {/if}
      {/if}
    </div>
  </div>

  <TodayRecapPanel
    summary={rhythm}
    progress={{ done: progress.done, total: progress.total, remaining: progress.remaining }}
    doneToday={progress.doneToday}
    {nextTask}
  />
</div>
