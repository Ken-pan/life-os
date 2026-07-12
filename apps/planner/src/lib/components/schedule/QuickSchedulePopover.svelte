<script>
  import { untrack } from 'svelte';
  import { S, todayKey } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import {
    schedulePopover,
    closeSchedulePopover,
    applyTaskSchedule,
    clearTaskSchedule,
    toast,
  } from '$lib/ui.svelte.js';
  import {
    SCHEDULE_DURATIONS,
    SCHEDULE_TIME_PRESETS,
    defaultDurationMinutes,
    formatDurationLabel,
    formatMinutesAsTime,
    parseTimeToMinutes,
    findScheduleConflicts,
    findNextAvailableStart,
    formatConflictLabel,
  } from '$lib/domain/schedule.js';
  import { selectScheduledForDate } from '$lib/domain/selectors.js';
  import { formatDateCompact } from '$lib/domain/dateFormat.js';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { lockScroll, unlockScroll } from '$lib/scrollLock.js';
  import Icon from '@life-os/platform-web/svelte/icon';

  let start = $state('09:00');
  let duration = $state(30);
  let dateKey = $state('');
  let dialogTitle = $state(null);
  let previouslyFocused = null;

  const task = $derived(
    schedulePopover.taskId
      ? S.tasks.find((item) => item.id === schedulePopover.taskId)
      : null,
  );

  const dayTasks = $derived(
    dateKey ? selectScheduledForDate(taskIndex(), dateKey) : [],
  );

  const conflicts = $derived(
    task && dateKey
      ? findScheduleConflicts(dayTasks, start, duration, task.id)
      : [],
  );

  const hasExisting = $derived(Boolean(task?.scheduledStart));
  const end = $derived(formatMinutesAsTime(parseTimeToMinutes(start) + duration));
  const formattedDate = $derived(formatDateCompact(dateKey));
  const hasChanges = $derived(Boolean(
    task && (
      task.scheduledDate !== dateKey ||
      task.scheduledStart !== start ||
      (task.durationMinutes || defaultDurationMinutes(task)) !== duration
    )
  ));
  const nextAvailable = $derived(
    findNextAvailableStart(dayTasks, start, duration, task?.id || null),
  );

  function suggestedStart(targetDate, tasks, durationMinutes, excludeId) {
    let preferred = '09:00';
    if (targetDate === todayKey()) {
      const now = new Date();
      const withBuffer = now.getHours() * 60 + now.getMinutes() + 15;
      preferred = formatMinutesAsTime(Math.min(withBuffer, 23 * 60));
    }
    return findNextAvailableStart(tasks, preferred, durationMinutes, excludeId) || '09:00';
  }

  $effect(() => {
    const openTask = task;
    const open = schedulePopover.open && !!openTask;
    if (!open) {
      document.documentElement.classList.remove('planner-schedule-modal-open');
      return;
    }

    return untrack(() => {
      previouslyFocused = document.activeElement;
      dateKey = openTask.scheduledDate || schedulePopover.dateKey || todayKey();
      duration = openTask.durationMinutes || defaultDurationMinutes(openTask);
      const scheduledForDate = selectScheduledForDate(taskIndex(), dateKey);
      start = openTask.scheduledStart || suggestedStart(dateKey, scheduledForDate, duration, openTask.id);
      lockScroll();
      document.documentElement.classList.add('planner-schedule-modal-open');
      queueMicrotask(() => dialogTitle?.focus());
      return () => {
        unlockScroll();
        document.documentElement.classList.remove('planner-schedule-modal-open');
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      };
    });
  });

  function save() {
    if (!task || !dateKey || !hasChanges) return;
    applyTaskSchedule(task.id, { dateKey, start, durationMinutes: duration });
    toast(t('toast.scheduledBlockDetailed', {
      title: task.title,
      date: formattedDate,
      start,
      end,
    }), 'success', {
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

  function handleDialogKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSchedulePopover();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

{#if schedulePopover.open && task}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="schedule-popover-bg"
    role="presentation"
    onclick={(event) => event.target === event.currentTarget && closeSchedulePopover()}
  >
    <div
      class="schedule-popover"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="schedule-popover-title"
      onkeydown={handleDialogKeydown}
    >
      <form onsubmit={(event) => { event.preventDefault(); save(); }}>
      <div class="schedule-popover-handle" aria-hidden="true"></div>
      <div class="schedule-popover-head">
        <h2 bind:this={dialogTitle} tabindex="-1" id="schedule-popover-title" class="schedule-popover-title">
          {hasExisting ? t('schedule.editPopoverTitle') : t('schedule.popoverTitle')}
        </h2>
        <button type="button" class="schedule-popover-close" onclick={closeSchedulePopover} aria-label={t('common.close')}>
          <Icon name="x" size={18} strokeWidth={2} />
        </button>
      </div>

      <div class="schedule-popover-task">
        <span class="schedule-popover-task-icon" aria-hidden="true">
          <Icon name="calendar" size={17} strokeWidth={1.8} />
        </span>
        <span>{task.title}</span>
      </div>

      <div class="schedule-popover-summary" aria-live="polite">
        <span>{formattedDate}</span>
        <strong>{start}–{end}</strong>
      </div>

      <div class="schedule-popover-fields">
        <label class="schedule-popover-field schedule-popover-field--date">
          <span class="schedule-popover-label">{t('schedule.planDate')}</span>
          <span class="schedule-popover-input-wrap">
            <Icon name="calendar" size={17} strokeWidth={1.7} />
            <input type="date" bind:value={dateKey} required />
          </span>
        </label>
        <label class="schedule-popover-field">
          <span class="schedule-popover-label">{t('schedule.startTime')}</span>
          <span class="schedule-popover-input-wrap">
            <Icon name="clock" size={17} strokeWidth={1.7} />
            <input type="time" bind:value={start} step="900" required />
          </span>
        </label>
      </div>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.duration')}</span>
        <div class="schedule-popover-chips schedule-popover-duration" role="group" aria-label={t('schedule.duration')}>
          {#each SCHEDULE_DURATIONS as mins}
            <button
              type="button"
              class="schedule-chip"
              class:on={duration === mins}
              aria-pressed={duration === mins}
              onclick={() => (duration = mins)}
            >
              {formatDurationLabel(mins, t)}
            </button>
          {/each}
        </div>
      </div>

      <div class="schedule-popover-section schedule-popover-section--quick">
        <span class="schedule-popover-label">{t('schedule.quickStart')}</span>
        <div class="schedule-popover-quick-actions">
          {#each SCHEDULE_TIME_PRESETS as preset}
            <button type="button" class:on={start === preset.time} onclick={() => (start = preset.time)}>
              {t(`schedule.preset_${preset.key}`)} <span>{preset.time}</span>
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
          {#if nextAvailable && nextAvailable !== start}
            <button type="button" class="schedule-popover-conflict-action" onclick={() => (start = nextAvailable)}>
              <Icon name="sparkles" size={15} strokeWidth={1.8} />
              {t('schedule.useNextAvailable', { time: nextAvailable })}
            </button>
          {:else}
            <p class="schedule-popover-conflict-foot">{t('schedule.noAvailableTime')}</p>
          {/if}
        </div>
      {/if}

      <div class="schedule-popover-actions">
        {#if hasExisting}
          <button type="button" class="btn-ghost schedule-popover-clear" onclick={clearSchedule}>
            {t('schedule.clear')}
          </button>
        {/if}
        <button type="button" class="btn-secondary" onclick={closeSchedulePopover}>{t('common.cancel')}</button>
        <button type="submit" class="btn-primary" disabled={!hasChanges}>
          {conflicts.length
            ? t('schedule.saveAnyway')
            : hasExisting
              ? t('schedule.updateSchedule')
              : t('schedule.confirmSchedule')}
        </button>
      </div>
      </form>
    </div>
  </div>
{/if}
