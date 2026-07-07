<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AppBar from '$lib/components/AppBar.svelte';
  import QuickAddBar from '$lib/components/QuickAddBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import InsightCard from '$lib/components/InsightCard.svelte';
  import TodayProgressCard from '$lib/components/TodayProgressCard.svelte';
  import TodayRecapPanel from '$lib/components/TodayRecapPanel.svelte';
  import TodayClosedCelebration from '$lib/components/TodayClosedCelebration.svelte';
  import TodayViewToggle from '$lib/components/TodayViewToggle.svelte';
  import DaySchedulePanel from '$lib/components/schedule/DaySchedulePanel.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectTodayGroups, selectTodayProgress, selectNextBestAction, selectUnscheduledForDate } from '$lib/domain/selectors.js';
  import { computeRhythmSummary, computeTodayClosedStats } from '$lib/domain/rhythm.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t, localeTag } from '$lib/i18n/index.js';
  import { S, todayKey } from '$lib/state.svelte.js';

  const index = $derived(taskIndex());
  const groups = $derived(selectTodayGroups(index));
  const progress = $derived(selectTodayProgress(index));
  const rhythm = $derived(computeRhythmSummary(S.tasks, S.settings, progress, localeTag()));
  const nextTask = $derived(selectNextBestAction(index));
  const unscheduledToday = $derived(selectUnscheduledForDate(index, todayKey()));
  const total = $derived(groups.overdue.length + groups.today.length);
  const fullyEmpty = $derived(!total && !groups.noDate.length && !progress.doneToday.length);
  const showProgress = $derived(progress.total > 0 || progress.doneToday.length > 0);
  const allPlanDone = $derived(progress.total > 0 && progress.remaining === 0);
  const trulyClean = $derived(allPlanDone && unscheduledToday.length === 0);

  const viewMode = $derived(
    page.url.searchParams.get('view') === 'timeline' ? 'timeline' : 'list',
  );

  const scheduleDate = $derived.by(() => {
    const q = page.url.searchParams.get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return todayKey();
  });

  const contextDate = todayKey();

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

  /** @param {'list' | 'timeline'} mode */
  function setViewMode(mode) {
    const url = new URL(page.url);
    if (mode === 'timeline') {
      url.searchParams.set('view', 'timeline');
    } else {
      url.searchParams.delete('view');
      url.searchParams.delete('date');
    }
    const target = `${url.pathname}${url.search}${url.hash}`;
    goto(target, { replaceState: true, keepFocus: true, noScroll: true });
  }
</script>

<AppBar title={t('home.title')} subtitle={t('app.tagline')} />

<div
  class="today-layout"
  class:today-layout--timeline={viewMode === 'timeline'}
  class:today-layout--with-recap={viewMode !== 'timeline' && !showClosed}
>
  <div class="today-main">
    <div class="wrap">
      <QuickAddBar dueDate={todayKey()} />

      {#if showProgress && !showClosed && viewMode !== 'timeline'}
        <TodayProgressCard
          done={progress.done}
          total={progress.total}
          remaining={progress.remaining}
          doneTodayCount={progress.doneToday.length}
          unscheduledCount={unscheduledToday.length}
          onOpenTimeline={() => setViewMode('timeline')}
        />
      {/if}

      {#if showClosed}
        <TodayClosedCelebration
          stats={closedStats}
          variant={trulyClean ? 'clean' : 'partial'}
          unscheduledCount={unscheduledToday.length}
          onDismiss={() => (showClosed = false)}
          onOpenTimeline={() => setViewMode('timeline')}
        />
      {/if}

      <TodayViewToggle mode={viewMode} onChange={setViewMode} />

      {#if viewMode === 'timeline'}
        <DaySchedulePanel dateKey={scheduleDate} showToolbar={scheduleDate !== todayKey()} />
      {:else}
        {#if !allPlanDone}
          <InsightCard />
        {/if}

        {#if fullyEmpty}
          <EmptyState message={t('common.empty')} />
        {:else}
          {#if groups.overdue.length}
            <TaskGroup
              title={t('home.overdue')}
              tasks={groups.overdue}
              compactRows
              ritualComplete
              showScheduleAction
              scheduleDate={contextDate}
              {contextDate}
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
              showScheduleAction
              scheduleDate={contextDate}
              {contextDate}
              onToggle={completeTask}
              onEdit={editTask}
            />
          {/if}
          {#if !total && groups.noDate.length}
            <TaskGroup
              title={t('home.nodate')}
              tasks={groups.noDate.slice(0, 5)}
              compactRows
              showScheduleAction
              scheduleDate={contextDate}
              {contextDate}
              onToggle={completeTask}
              onEdit={editTask}
            />
          {/if}

          {#if progress.doneToday.length}
            {#key showClosed}
              <TaskGroup
                sectionId="done-today"
                title={t('home.doneToday')}
                tasks={progress.doneToday}
                compactRows
                collapsible
                {contextDate}
                onToggle={completeTask}
                onEdit={editTask}
              />
            {/key}
          {/if}
        {/if}
      {/if}
    </div>
  </div>

  {#if viewMode !== 'timeline' && !showClosed}
    <TodayRecapPanel
      summary={rhythm}
      progress={{ done: progress.done, total: progress.total, remaining: progress.remaining }}
      doneToday={progress.doneToday}
      {nextTask}
      unscheduledCount={unscheduledToday.length}
      onOpenTimeline={() => setViewMode('timeline')}
    />
  {/if}
</div>
