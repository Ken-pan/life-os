<script>
  import { S } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import {
    schedulePopover,
    closeSchedulePopover,
    applyTaskSchedule,
    clearTaskSchedule,
    toast,
  } from '$lib/ui.svelte.js';
  import {
    SCHEDULE_START_TIMES,
    SCHEDULE_DURATIONS,
    SCHEDULE_TIME_PRESETS,
    defaultDurationMinutes,
    formatDurationLabel,
    findScheduleConflicts,
    formatConflictLabel,
  } from '$lib/domain/schedule.js';
  import { selectScheduledForDate } from '$lib/domain/selectors.js';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { lockScroll, unlockScroll } from '$lib/scrollLock.js';
  import Icon from '../Icon.svelte';

  let start = $state('09:00');
  let duration = $state(30);

  const task = $derived(
    schedulePopover.taskId
      ? S.tasks.find((item) => item.id === schedulePopover.taskId)
      : null,
  );

  const dayTasks = $derived(
    schedulePopover.dateKey
      ? selectScheduledForDate(taskIndex(), schedulePopover.dateKey)
      : [],
  );

  const conflicts = $derived(
    task && schedulePopover.dateKey
      ? findScheduleConflicts(dayTasks, start, duration, task.id)
      : [],
  );

  const hasExisting = $derived(Boolean(task?.scheduledStart));

  $effect(() => {
    const open = schedulePopover.open && !!task;
    if (!open) {
      document.documentElement.classList.remove('planner-schedule-modal-open');
      return;
    }

    start = task.scheduledStart || '09:00';
    duration = task.durationMinutes || defaultDurationMinutes(task);
    lockScroll();
    document.documentElement.classList.add('planner-schedule-modal-open');
    return () => {
      unlockScroll();
      document.documentElement.classList.remove('planner-schedule-modal-open');
    };
  });

  function save() {
    if (!task || !schedulePopover.dateKey) return;
    applyTaskSchedule(task.id, {
      dateKey: schedulePopover.dateKey,
      start,
      durationMinutes: duration,
    });
    toast(t('toast.scheduledBlock', { title: task.title, start }), 'success', {
      key: `schedule-${task.id}`,
      dedupeMs: 2000,
    });
  }

  function clearSchedule() {
    if (!task) return;
    clearTaskSchedule(task.id);
    toast(t('toast.scheduleCleared', { title: task.title }), 'success', {
      key: `schedule-clear-${task.id}`,
    });
  }
</script>

{#if schedulePopover.open && task}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="schedule-popover-bg"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && closeSchedulePopover()}
  >
    <div class="schedule-popover" role="dialog" aria-modal="true" aria-labelledby="schedule-popover-title">
      <div class="schedule-popover-head">
        <h2 id="schedule-popover-title" class="schedule-popover-title">{t('schedule.popoverTitle')}</h2>
        <button type="button" class="schedule-popover-close" onclick={closeSchedulePopover} aria-label={t('common.close')}>
          <Icon name="x" size={18} strokeWidth={2} />
        </button>
      </div>
      <p class="schedule-popover-task">{task.title}</p>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.presets')}</span>
        <div class="schedule-popover-chips">
          {#each SCHEDULE_TIME_PRESETS as preset}
            <button
              type="button"
              class="schedule-chip schedule-chip--preset"
              class:on={start === preset.time}
              onclick={() => (start = preset.time)}
            >
              {t(`schedule.preset_${preset.key}`)}
            </button>
          {/each}
        </div>
      </div>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.startTime')}</span>
        <div class="schedule-popover-chips">
          {#each SCHEDULE_START_TIMES as time}
            <button type="button" class="schedule-chip" class:on={start === time} onclick={() => (start = time)}>
              {time}
            </button>
          {/each}
        </div>
      </div>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.duration')}</span>
        <div class="schedule-popover-chips">
          {#each SCHEDULE_DURATIONS as mins}
            <button
              type="button"
              class="schedule-chip"
              class:on={duration === mins}
              onclick={() => (duration = mins)}
            >
              {formatDurationLabel(mins, t)}
            </button>
          {/each}
        </div>
      </div>

      {#if conflicts.length}
        <div class="schedule-popover-conflict" role="status">
          <p class="schedule-popover-conflict-head">
            <Icon name="alert-triangle" size={16} strokeWidth={2} />
            <span>{t('schedule.conflictHint', { count: conflicts.length })}</span>
          </p>
          <ul class="schedule-popover-conflict-list">
            {#each conflicts as conflict (conflict.id)}
              <li>{formatConflictLabel(conflict, t)}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="schedule-popover-actions">
        {#if hasExisting}
          <button type="button" class="btn-ghost schedule-popover-clear" onclick={clearSchedule}>
            {t('schedule.clear')}
          </button>
        {/if}
        <button type="button" class="btn-secondary" onclick={closeSchedulePopover}>{t('common.cancel')}</button>
        <button type="button" class="btn-primary" onclick={save}>{t('common.save')}</button>
      </div>
    </div>
  </div>
{/if}
