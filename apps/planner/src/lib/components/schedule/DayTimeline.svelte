<script>
  import { onMount } from 'svelte';
  import {
    DAY_START_HOUR,
    DAY_END_HOUR,
    HOUR_HEIGHT_PX,
    timelineHeightPx,
    currentTimeMarkerTop,
    isTodayDate,
    overlappingTaskIds,
    snapMinutesFromTimelineTop,
    formatMinutesAsTime,
    defaultDurationMinutes,
    blockLayout,
    taskDurationMinutes,
  } from '$lib/domain/schedule.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import TimeBlock from './TimeBlock.svelte';
  import { openSchedulePopover, applyTaskSchedule, toast } from '$lib/ui.svelte.js';
  import { S } from '$lib/state.svelte.js';

  /** @type {{ dateKey: string, tasks: import('$lib/types.js').Task[] }} */
  let { dateKey, tasks } = $props();

  /** @type {HTMLDivElement | undefined} */
  let scrollEl = $state();
  /** @type {HTMLDivElement | undefined} */
  let canvasEl = $state();

  let dragOver = $state(false);
  let desktopDnD = $state(false);

  const hours = $derived(
    Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i),
  );
  const height = $derived(timelineHeightPx());
  const nowTop = $derived(
    isTodayDate(dateKey, todayKey()) ? currentTimeMarkerTop() : null,
  );
  const overlapIds = $derived(overlappingTaskIds(tasks));
  const showJumpNow = $derived(isTodayDate(dateKey, todayKey()) && nowTop != null);

  function formatHour(h) {
    return `${String(h).padStart(2, '0')}:00`;
  }

  /** @param {import('$lib/types.js').Task} task */
  function reschedule(task) {
    openSchedulePopover(task.id, dateKey);
  }

  /** @param {DragEvent} e */
  function onDragOver(e) {
    if (!desktopDnD) return;
    if (!e.dataTransfer?.types.includes('application/x-planner-task-id')) return;
    e.preventDefault();
    dragOver = true;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  /** @param {DragEvent} e */
  function onDrop(e) {
    dragOver = false;
    if (!desktopDnD || !canvasEl) return;
    e.preventDefault();
    const taskId = e.dataTransfer?.getData('application/x-planner-task-id');
    if (!taskId) return;

    const task = S.tasks.find((item) => item.id === taskId && !item.deletedAt);
    if (!task) return;

    const rect = canvasEl.getBoundingClientRect();
    const topPx = e.clientY - rect.top;
    const startMinutes = snapMinutesFromTimelineTop(topPx);
    const start = formatMinutesAsTime(startMinutes);
    const durationMinutes = task.durationMinutes || defaultDurationMinutes(task);

    applyTaskSchedule(task.id, { dateKey, start, durationMinutes });
    toast(t('toast.scheduledBlock', { title: task.title, start }), 'success', {
      key: `schedule-${task.id}`,
      dedupeMs: 2000,
    });
  }

  onMount(() => {
    if (!scrollEl) return;

    let anchor = 0;
    let earliestTop = null;
    for (const task of tasks) {
      if (!task.scheduledStart) continue;
      const layout = blockLayout(task.scheduledStart, taskDurationMinutes(task));
      earliestTop =
        earliestTop == null ? layout.top : Math.min(earliestTop, layout.top);
    }
    if (earliestTop != null) anchor = earliestTop;
    if (nowTop != null) {
      anchor = earliestTop != null ? Math.min(earliestTop, nowTop) : nowTop;
    }

    scrollEl.scrollTop = Math.max(0, anchor - scrollEl.clientHeight * 0.12);
  });

  onMount(() => {
    const mq = window.matchMedia('(min-width: 861px) and (pointer: fine)');
    const sync = () => {
      desktopDnD = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
</script>

<div class="day-timeline-shell">
  <div class="day-timeline-scroll" bind:this={scrollEl}>
    <div class="day-timeline" style:--timeline-height="{height}px">
      <div class="day-timeline-ruler" aria-hidden="true">
        {#each hours as hour}
          <div class="day-timeline-hour" style:height="{HOUR_HEIGHT_PX}px">
            <span class="day-timeline-hour-label">{formatHour(hour)}</span>
          </div>
        {/each}
      </div>

      <div
        class="day-timeline-canvas"
        class:day-timeline-canvas--drop-target={dragOver}
        style:min-height="{height}px"
        bind:this={canvasEl}
        role="region"
        aria-label={t('schedule.title')}
        ondragover={onDragOver}
        ondragleave={() => (dragOver = false)}
        ondrop={onDrop}
      >
        <div class="day-timeline-grid" aria-hidden="true">
          {#each hours as hour}
            <div class="day-timeline-grid-line" style:height="{HOUR_HEIGHT_PX}px"></div>
          {/each}
        </div>

        {#if nowTop != null}
          <div class="day-timeline-now" style:top="{nowTop}px" aria-hidden="true">
            <span class="day-timeline-now-dot"></span>
          </div>
        {/if}

        <div class="day-timeline-blocks">
          {#each tasks as task (task.id)}
            <TimeBlock
              {task}
              {dateKey}
              desktopInteractive={desktopDnD}
              hasConflict={overlapIds.has(task.id)}
              onReschedule={() => reschedule(task)}
            />
          {/each}
        </div>

        {#if !tasks.length}
          <p class="day-timeline-empty">{t('schedule.timelineEmpty')}</p>
        {/if}
      </div>
    </div>
  </div>

  {#if showJumpNow}
    <div class="day-timeline-foot">
      <button
        type="button"
        class="day-timeline-jump-now"
        onclick={() => {
          if (!scrollEl || nowTop == null) return;
          scrollEl.scrollTo({ top: Math.max(0, nowTop - 80), behavior: 'smooth' });
        }}
      >
        {t('schedule.jumpNow')}
      </button>
    </div>
  {/if}
</div>
