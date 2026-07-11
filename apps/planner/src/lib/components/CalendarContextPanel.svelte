<script>
  import { t, localeTag } from '$lib/i18n/index.js'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import {
    selectScheduledForDate,
    selectUnscheduledForDate,
  } from '$lib/domain/selectors.js'
  import { computeDayScheduleStats } from '$lib/domain/schedule.js'
  import ScheduleSummary from './schedule/ScheduleSummary.svelte'

  /** @type {{ selected: string, countOn: (day: string) => number }} */
  let { selected, countOn } = $props()

  const index = $derived(taskIndex())
  const scheduled = $derived(selectScheduledForDate(index, selected))
  const unscheduled = $derived(selectUnscheduledForDate(index, selected))
  const stats = $derived(computeDayScheduleStats(scheduled))
  const dueCount = $derived(countOn(selected))

  function selectedLabel() {
    const [y, m, d] = selected.split('-').map(Number)
    return new Intl.DateTimeFormat(localeTag(), {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(new Date(y, m - 1, d))
  }
</script>

<aside
  class="life-os-grid__aside today-recap calendar-context"
  aria-label={t('calendar.contextTitle')}
>
  <header class="today-recap-head">
    <h2 class="today-recap-title">{t('calendar.contextTitle')}</h2>
    <p class="today-recap-sub">{selectedLabel()}</p>
    <p class="calendar-context-meta">
      {t('calendar.dueCount', { count: dueCount })}
    </p>
  </header>

  <ScheduleSummary
    scheduled={stats.scheduled}
    completed={stats.completed}
    plannedMinutes={stats.plannedMinutes}
    unscheduled={unscheduled.length}
  />

  {#if unscheduled.length > 0}
    <p class="page-hint calendar-context-hint">
      {t('schedule.planToday', { count: unscheduled.length })}
    </p>
  {/if}
</aside>
