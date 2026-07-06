<script>
  import { page } from '$app/state';
  import AppBar from '$lib/components/AppBar.svelte';
  import DayTimeline from '$lib/components/schedule/DayTimeline.svelte';
  import UnscheduledPanel from '$lib/components/schedule/UnscheduledPanel.svelte';
  import ScheduleSummary from '$lib/components/schedule/ScheduleSummary.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import {
    selectScheduledForDate,
    selectUnscheduledForDate,
  } from '$lib/domain/selectors.js';
  import { computeDayScheduleStats } from '$lib/domain/schedule.js';
  import { t, localeTag } from '$lib/i18n/index.js';
  import { todayKey, dateKeyOf } from '$lib/state.svelte.js';

  const today = todayKey();

  let selected = $state(today);

  $effect(() => {
    const q = page.url.searchParams.get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      selected = q;
    }
  });

  const index = $derived(taskIndex());
  const scheduled = $derived(selectScheduledForDate(index, selected));
  const unscheduled = $derived(selectUnscheduledForDate(index, selected));
  const stats = $derived(computeDayScheduleStats(scheduled));

  function label(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
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
    selected = today;
  }
</script>

<AppBar title={t('schedule.title')} subtitle={label(selected)} />

<div class="wrap schedule-page">
  <div class="schedule-toolbar">
    <button type="button" class="btn-ghost" onclick={() => shiftDay(-1)} aria-label={t('schedule.prevDay')}>←</button>
    <button type="button" class="btn-ghost schedule-toolbar-today" onclick={jumpToday}>{t('home.today')}</button>
    <button type="button" class="btn-ghost" onclick={() => shiftDay(1)} aria-label={t('schedule.nextDay')}>→</button>
  </div>

  <ScheduleSummary
    scheduled={stats.scheduled}
    completed={stats.completed}
    plannedMinutes={stats.plannedMinutes}
    unscheduled={unscheduled.length}
  />

  <div class="schedule-layout">
    <UnscheduledPanel dateKey={selected} tasks={unscheduled} />
    <DayTimeline dateKey={selected} tasks={scheduled} />
  </div>
</div>
