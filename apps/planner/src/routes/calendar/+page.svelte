<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import CalendarContextPanel from '$lib/components/CalendarContextPanel.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectByDate } from '$lib/domain/selectors.js';
  import { startOfWeek, weekDates } from '$lib/domain/views.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t, localeTag } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { calendarView } from '$lib/ui.svelte.js';

  let weekStart = $state(startOfWeek());
  let selected = $state(todayKey());

  $effect(() => {
    calendarView.selected = selected;
    return () => {
      calendarView.selected = null;
    };
  });

  const days = $derived(weekDates(weekStart));
  const tasks = $derived(selectByDate(taskIndex(), selected));

  function countOn(day) {
    return (taskIndex().byDueDate.get(day) ?? []).length;
  }

  function chipLabel(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(localeTag(), { weekday: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
  }

  function sectionTitle(day) {
    const [y, m, d] = day.split('-').map(Number);
    if (localeTag().startsWith('zh')) {
      const weekday = new Intl.DateTimeFormat(localeTag(), { weekday: 'short' }).format(new Date(y, m - 1, d));
      return `${d}日${weekday}`;
    }
    return chipLabel(day);
  }

  function shiftWeek(n) {
    const [y, m, d] = weekStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n * 7);
    weekStart = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function jumpToday() {
    weekStart = startOfWeek();
    selected = todayKey();
  }
</script>

<AppBar title={t('calendar.title')} historyBack />

<div class="desktop-split-layout calendar-page">
  <div class="desktop-split-main">
    <div class="wrap">
      <div class="calendar-week-nav">
        <button type="button" class="calendar-week-nav-btn" onclick={() => shiftWeek(-1)} aria-label={t('calendar.prevWeek')}>‹</button>
        <button type="button" class="calendar-week-nav-today" onclick={jumpToday}>{t('home.today')}</button>
        <button type="button" class="calendar-week-nav-btn" onclick={() => shiftWeek(1)} aria-label={t('calendar.nextWeek')}>›</button>
      </div>

      <div class="calendar-grid">
        {#each days as day}
          <button
            type="button"
            class="cal-day"
            class:on={day === selected}
            class:has-tasks={countOn(day) > 0}
            onclick={() => (selected = day)}
          >
            {chipLabel(day)}
          </button>
        {/each}
      </div>

      {#if tasks.length <= 3}
        <p class="page-hint">{t('calendar.sparseHint', { count: tasks.length, label: sectionTitle(selected) })}</p>
      {/if}

      <TaskGroup
        title={sectionTitle(selected)}
        hideCount
        {tasks}
        compactRows
        empty={t('common.empty')}
        onToggle={completeTask}
        onEdit={editTask}
      />
    </div>
  </div>

  <CalendarContextPanel {selected} {countOn} />
</div>
