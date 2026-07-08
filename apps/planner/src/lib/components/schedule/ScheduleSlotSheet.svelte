<script>
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectUnscheduledForDate, selectScheduledForDate } from '$lib/domain/selectors.js';
  import {
    SCHEDULE_DURATIONS,
    formatDurationLabel,
    findScheduleConflicts,
    formatConflictLabel,
  } from '$lib/domain/schedule.js';
  import { t } from '$lib/i18n/index.js';
  import {
    scheduleSlot,
    closeScheduleSlot,
    openTaskEditor,
    applyTaskSchedule,
    toast,
  } from '$lib/ui.svelte.js';
  import { lockScroll, unlockScroll } from '$lib/scrollLock.js';
  import Icon from '@life-os/platform-web/svelte/icon';

  const index = $derived(taskIndex());
  const unscheduled = $derived(
    scheduleSlot.dateKey ? selectUnscheduledForDate(index, scheduleSlot.dateKey) : [],
  );
  const scheduled = $derived(
    scheduleSlot.dateKey ? selectScheduledForDate(index, scheduleSlot.dateKey) : [],
  );
  const conflicts = $derived(
    scheduleSlot.start
      ? findScheduleConflicts(scheduled, scheduleSlot.start, scheduleSlot.durationMinutes)
      : [],
  );

  $effect(() => {
    if (!scheduleSlot.open) {
      document.documentElement.classList.remove('planner-schedule-modal-open');
      return;
    }

    lockScroll();
    document.documentElement.classList.add('planner-schedule-modal-open');
    return () => {
      unlockScroll();
      document.documentElement.classList.remove('planner-schedule-modal-open');
    };
  });

  function createTaskHere() {
    if (!scheduleSlot.dateKey || !scheduleSlot.start) return;
    openTaskEditor(null, {
      dueDate: scheduleSlot.dateKey,
      scheduledDate: scheduleSlot.dateKey,
      scheduledStart: scheduleSlot.start,
      durationMinutes: scheduleSlot.durationMinutes,
    });
    closeScheduleSlot();
  }

  /** @param {import('$lib/types.js').Task} task */
  function scheduleTaskHere(task) {
    if (!scheduleSlot.dateKey || !scheduleSlot.start) return;
    const start = scheduleSlot.start;
    applyTaskSchedule(task.id, {
      dateKey: scheduleSlot.dateKey,
      start,
      durationMinutes: scheduleSlot.durationMinutes,
    });
    closeScheduleSlot();
    toast(t('toast.scheduledBlock', { title: task.title, start }), 'success', {
      key: `slot-schedule-${task.id}`,
      dedupeMs: 2000,
    });
  }
</script>

{#if scheduleSlot.open && scheduleSlot.dateKey && scheduleSlot.start}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="schedule-popover-bg"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && closeScheduleSlot()}
  >
    <div class="schedule-popover schedule-slot-sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-slot-title">
      <div class="schedule-popover-handle" aria-hidden="true"></div>
      <div class="schedule-popover-head">
        <h2 id="schedule-slot-title" class="schedule-popover-title">{t('schedule.slotTitle')}</h2>
        <button type="button" class="schedule-popover-close" onclick={closeScheduleSlot} aria-label={t('common.close')}>
          <Icon name="x" size={18} strokeWidth={2} />
        </button>
      </div>
      <p class="schedule-popover-task">
        {t('schedule.slotSubtitle', { start: scheduleSlot.start })}
      </p>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.duration')}</span>
        <div class="schedule-popover-chips schedule-popover-chips--scroll">
          {#each SCHEDULE_DURATIONS as mins}
            <button
              type="button"
              class="schedule-chip"
              class:on={scheduleSlot.durationMinutes === mins}
              onclick={() => (scheduleSlot.durationMinutes = mins)}
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

      <button type="button" class="schedule-slot-create" onclick={createTaskHere}>
        <Icon name="plus" size={16} strokeWidth={2.2} />
        <span>{t('schedule.createTaskHere')}</span>
      </button>

      <div class="schedule-popover-section">
        <span class="schedule-popover-label">{t('schedule.placeExisting')}</span>
        {#if unscheduled.length}
          <ul class="schedule-slot-list">
            {#each unscheduled as task (task.id)}
              <li class="schedule-slot-item">
                <button type="button" class="schedule-slot-task" onclick={() => scheduleTaskHere(task)}>
                  <span>{task.title}</span>
                  <Icon name="arrow-right" size={15} strokeWidth={2} />
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="unscheduled-empty">{t('schedule.noExistingToPlace')}</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
