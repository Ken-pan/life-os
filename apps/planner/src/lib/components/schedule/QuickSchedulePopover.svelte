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
  import Icon from '@life-os/platform-web/svelte/icon';

  let start = $state('09:00');
  let duration = $state(30);
  let showCustomTime = $state(false);

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
  const presetTimes = $derived(new Set(SCHEDULE_START_TIMES));
  const usingCustomTime = $derived(showCustomTime || !presetTimes.has(start));

  $effect(() => {
    const open = schedulePopover.open && !!task;
    if (!open) {
      document.documentElement.classList.remove('planner-schedule-modal-open');
      showCustomTime = false;
      return;
    }

    start = task.scheduledStart || '09:00';
    duration = task.durationMinutes || defaultDurationMinutes(task);
    showCustomTime = !presetTimes.has(start);
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

  function openCustomTime() {
    showCustomTime = true;
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
      <div class="schedule-popover-handle" aria-hidden="true"></div>
      <div class="schedule-popover-head">
        <h2 id="schedule-popover-title" class="schedule-popover-title">{t('schedule.popoverTitle')}</h2>
        <button type="button" class="schedule-popover-close" onclick={closeSchedulePopover} aria-label={t('common.close')}>
          <Icon name="x" size={18} strokeWidth={2} />
        </button>
      </div>
      <p class="schedule-popover-task">{task.title}</p>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.presets')}</span>
        <div class="schedule-popover-chips schedule-popover-chips--scroll">
          {#each SCHEDULE_TIME_PRESETS as preset}
            <button
              type="button"
              class="schedule-chip schedule-chip--preset"
              class:on={start === preset.time}
              onclick={() => {
                start = preset.time;
                showCustomTime = false;
              }}
            >
              {t(`schedule.preset_${preset.key}`)}
            </button>
          {/each}
        </div>
      </div>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.startTime')}</span>
        <div class="schedule-popover-chips schedule-popover-chips--scroll">
          {#each SCHEDULE_START_TIMES as time}
            <button
              type="button"
              class="schedule-chip"
              class:on={start === time && !usingCustomTime}
              onclick={() => {
                start = time;
                showCustomTime = false;
              }}
            >
              {time}
            </button>
          {/each}
          <button
            type="button"
            class="schedule-chip schedule-chip--custom"
            class:on={usingCustomTime}
            onclick={openCustomTime}
          >
            {t('schedule.customTime')}
          </button>
        </div>
        {#if usingCustomTime}
          <label class="schedule-popover-custom">
            <span class="sr-only">{t('schedule.customTime')}</span>
            <input type="time" bind:value={start} step="900" />
          </label>
        {/if}
      </div>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.duration')}</span>
        <div class="schedule-popover-chips schedule-popover-chips--scroll">
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
          <p class="schedule-popover-conflict-foot">{t('schedule.conflictSaveHint')}</p>
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
