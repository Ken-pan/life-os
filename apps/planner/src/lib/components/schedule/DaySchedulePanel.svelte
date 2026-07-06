<script>
  import DayTimeline from './DayTimeline.svelte';
  import UnscheduledPanel from './UnscheduledPanel.svelte';
  import ScheduleSummary from './ScheduleSummary.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import {
    selectScheduledForDate,
    selectUnscheduledForDate,
  } from '$lib/domain/selectors.js';
  import { computeDayScheduleStats } from '$lib/domain/schedule.js';
  import { t, localeTag } from '$lib/i18n/index.js';
  import { todayKey, dateKeyOf } from '$lib/state.svelte.js';

  /** @type {{ dateKey?: string, showToolbar?: boolean }} */
  let { dateKey = todayKey(), showToolbar = true } = $props();

  let selected = $state(todayKey());

  $effect(() => {
    selected = dateKey;
  });

  const index = $derived(taskIndex());
  const scheduled = $derived(selectScheduledForDate(index, selected));
  const unscheduled = $derived(selectUnscheduledForDate(index, selected));
  const stats = $derived(computeDayScheduleStats(scheduled));

  function label(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(localeTag(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(y, m - 1, d));
  }

  function shiftDay(n) {
    const [y, m, d] = selected.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    selected = dateKeyOf(dt);
  }

  function jumpToday() {
    selected = todayKey();
  }
</script>

<section class="day-schedule-panel" aria-label={t('schedule.title')}>
  {#if showToolbar}
    <div class="schedule-toolbar">
      <button type="button" class="btn-ghost" onclick={() => shiftDay(-1)} aria-label={t('schedule.prevDay')}>←</button>
      <span class="schedule-toolbar-date">{label(selected)}</span>
      <button type="button" class="btn-ghost" onclick={() => shiftDay(1)} aria-label={t('schedule.nextDay')}>→</button>
      <button type="button" class="btn-ghost schedule-toolbar-today" onclick={jumpToday}>{t('home.today')}</button>
    </div>
  {/if}

  <ScheduleSummary
    scheduled={stats.scheduled}
    completed={stats.completed}
    plannedMinutes={stats.plannedMinutes}
    unscheduled={unscheduled.length}
  />

  <p class="schedule-desktop-hint">{t('schedule.desktopHint')}</p>

  <div class="schedule-layout">
    <UnscheduledPanel dateKey={selected} tasks={unscheduled} />
    <DayTimeline dateKey={selected} tasks={scheduled} />
  </div>
</section>
