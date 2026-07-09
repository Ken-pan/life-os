<script>
  import { goto } from '$app/navigation'
  import AppBar from '$lib/components/AppBar.svelte'
  import QuickAddBar from '$lib/components/QuickAddBar.svelte'
  import TaskGroup from '$lib/components/TaskGroup.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import InsightCard from '$lib/components/InsightCard.svelte'
  import TodayProgressCard from '$lib/components/TodayProgressCard.svelte'
  import TodayRecapPanel from '$lib/components/TodayRecapPanel.svelte'
  import TodayClosedCelebration from '$lib/components/TodayClosedCelebration.svelte'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import {
    selectTodayGroups,
    selectTodayProgress,
    selectNextBestAction,
    selectUnscheduledForDate,
  } from '$lib/domain/selectors.js'
  import {
    computeRhythmSummary,
    computeTodayClosedStats,
  } from '$lib/domain/rhythm.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { t, localeTag } from '$lib/i18n/index.js'
  import { S, todayKey } from '$lib/state.svelte.js'

  const index = $derived(taskIndex())
  const groups = $derived(selectTodayGroups(index))
  const progress = $derived(selectTodayProgress(index))
  const rhythm = $derived(
    computeRhythmSummary(S.tasks, S.settings, progress, localeTag()),
  )
  const nextTask = $derived(selectNextBestAction(index))
  const unscheduledToday = $derived(selectUnscheduledForDate(index, todayKey()))
  const total = $derived(groups.overdue.length + groups.today.length)
  const fullyEmpty = $derived(
    !total && !groups.noDate.length && !progress.doneToday.length,
  )
  const showProgress = $derived(
    progress.total > 0 || progress.doneToday.length > 0,
  )
  const allPlanDone = $derived(progress.total > 0 && progress.remaining === 0)
  const trulyClean = $derived(allPlanDone && unscheduledToday.length === 0)

  const contextDate = todayKey()

  let showClosed = $state(false)

  $effect(() => {
    if (!allPlanDone) {
      showClosed = false
      return
    }
    try {
      const dismissed = sessionStorage.getItem('planner_today_closed')
      showClosed = dismissed !== todayKey()
    } catch {
      showClosed = true
    }
  })

  const closedStats = $derived(computeTodayClosedStats(S.tasks, todayKey()))

  function openCalendar() {
    goto('/calendar')
  }
</script>

<div class="life-os-page-workspace">
  <AppBar title={t('home.title')} subtitle={t('app.tagline')} />

  <div
    class="life-os-grid today-layout"
    class:life-os-grid--split={!showClosed}
    class:today-layout--with-recap={!showClosed}
  >
    <div class="life-os-grid__main today-main">
      <div class="wrap">
        <QuickAddBar dueDate={todayKey()} />

        {#if showProgress && !showClosed}
          <TodayProgressCard
            done={progress.done}
            total={progress.total}
            remaining={progress.remaining}
            doneTodayCount={progress.doneToday.length}
            unscheduledCount={unscheduledToday.length}
            onOpenCalendar={openCalendar}
          />
        {/if}

        {#if showClosed}
          <TodayClosedCelebration
            stats={closedStats}
            variant={trulyClean ? 'clean' : 'partial'}
            unscheduledCount={unscheduledToday.length}
            onDismiss={() => (showClosed = false)}
            onOpenCalendar={openCalendar}
          />
        {/if}

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
      </div>
    </div>

    {#if !showClosed}
      <TodayRecapPanel
        summary={rhythm}
        progress={{
          done: progress.done,
          total: progress.total,
          remaining: progress.remaining,
        }}
        doneToday={progress.doneToday}
        {nextTask}
        unscheduledCount={unscheduledToday.length}
        onOpenCalendar={openCalendar}
      />
    {/if}
  </div>
</div>
