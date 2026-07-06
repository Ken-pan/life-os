<script>
  import { goto } from '$app/navigation';
  import { t, localeTag } from '$lib/i18n/index.js';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import {
    selectScheduledForDate,
    selectUnscheduledForDate,
  } from '$lib/domain/selectors.js';
  import { computeDayScheduleStats } from '$lib/domain/schedule.js';
  import ScheduleSummary from './schedule/ScheduleSummary.svelte';
  import Icon from './Icon.svelte';

  /** @type {{ selected: string, countOn: (day: string) => number }} */
  let { selected, countOn } = $props();

  const index = $derived(taskIndex());
  const scheduled = $derived(selectScheduledForDate(index, selected));
  const unscheduled = $derived(selectUnscheduledForDate(index, selected));
  const stats = $derived(computeDayScheduleStats(scheduled));
  const dueCount = $derived(countOn(selected));

  function selectedLabel() {
    const [y, m, d] = selected.split('-').map(Number);
    return new Intl.DateTimeFormat(localeTag(), {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(new Date(y, m - 1, d));
  }

  function openTimeline() {
    goto(`/?view=timeline&date=${selected}`);
  }
</script>

<aside class="today-recap calendar-context" aria-label={t('calendar.contextTitle')}>
  <header class="today-recap-head">
    <h2 class="today-recap-title">{t('calendar.contextTitle')}</h2>
    <p class="today-recap-sub">{selectedLabel()}</p>
    <p class="calendar-context-meta">{t('calendar.dueCount', { count: dueCount })}</p>
  </header>

  <ScheduleSummary
    scheduled={stats.scheduled}
    completed={stats.completed}
    plannedMinutes={stats.plannedMinutes}
    unscheduled={unscheduled.length}
  />

  <div class="today-recap-foot">
    {#if unscheduled.length > 0}
      <button type="button" class="today-progress-chip" onclick={openTimeline}>
        {t('schedule.planToday', { count: unscheduled.length })}
      </button>
    {/if}
    <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={openTimeline}>
      <Icon name="clock" size={14} strokeWidth={2} />
      {t('calendar.openTimeline')}
    </button>
  </div>
</aside>
