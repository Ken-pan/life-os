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
  } from '$lib/domain/schedule.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import TimeBlock from './TimeBlock.svelte';
  import { openSchedulePopover } from '$lib/ui.svelte.js';

  /** @type {{ dateKey: string, tasks: import('$lib/types.js').Task[] }} */
  let { dateKey, tasks } = $props();

  /** @type {HTMLDivElement | undefined} */
  let scrollEl = $state();

  const hours = $derived(
    Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i),
  );
  const height = $derived(timelineHeightPx());
  const nowTop = $derived(
    isTodayDate(dateKey, todayKey()) ? currentTimeMarkerTop() : null,
  );
  const overlapIds = $derived(overlappingTaskIds(tasks));

  function formatHour(h) {
    return `${String(h).padStart(2, '0')}:00`;
  }

  /** @param {import('$lib/types.js').Task} task */
  function reschedule(task) {
    openSchedulePopover(task.id, dateKey);
  }

  onMount(() => {
    if (nowTop == null || !scrollEl) return;
    const target = Math.max(0, nowTop - scrollEl.clientHeight * 0.25);
    scrollEl.scrollTop = target;
  });
</script>

<div class="day-timeline-scroll" bind:this={scrollEl}>
  <div class="day-timeline" style:--timeline-height="{height}px">
    <div class="day-timeline-ruler" aria-hidden="true">
      {#each hours as hour}
        <div class="day-timeline-hour" style:height="{HOUR_HEIGHT_PX}px">
          <span class="day-timeline-hour-label">{formatHour(hour)}</span>
        </div>
      {/each}
    </div>

    <div class="day-timeline-canvas" style:min-height="{height}px">
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

{#if isTodayDate(dateKey, todayKey()) && nowTop != null}
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
{/if}
