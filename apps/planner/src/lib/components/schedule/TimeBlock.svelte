<script>
  import { t } from '$lib/i18n/index.js';
  import { getTaskKind } from '$lib/domain/taskKind.js';
  import {
    DAY_START_HOUR,
    DAY_END_HOUR,
    blockLayout,
    taskDurationMinutes,
    formatTimeRange,
    parseTimeToMinutes,
    formatMinutesAsTime,
    dayBoundsMinutes,
    snapMinutesDelta,
    moveBlockSchedule,
    resizeBlockTop,
    resizeBlockBottom,
  } from '$lib/domain/schedule.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { applyTaskSchedule } from '$lib/ui.svelte.js';
  import Icon from '@life-os/platform-web/svelte/icon';

  /** @type {{
    task: import('$lib/types.js').Task,
    dateKey: string,
    dayStart?: number,
    dayEnd?: number,
    hasConflict?: boolean,
    column?: number,
    columns?: number,
    desktopInteractive?: boolean,
    onReschedule?: () => void
  }} */
  let {
    task,
    dateKey,
    dayStart = DAY_START_HOUR,
    dayEnd = DAY_END_HOUR,
    hasConflict = false,
    column = 0,
    columns = 1,
    desktopInteractive = false,
    onReschedule,
  } = $props();

  const kind = $derived(getTaskKind(task));
  const duration = $derived(taskDurationMinutes(task));
  const layout = $derived(
    task.scheduledStart
      ? blockLayout(task.scheduledStart, duration, { dayStart, dayEnd })
      : null,
  );

  /** @type {{ startMinutes: number, durationMinutes: number } | null} */
  let preview = $state(null);
  let dragging = $state(false);

  const activeLayout = $derived.by(() => {
    if (preview) {
      return blockLayout(
        formatMinutesAsTime(preview.startMinutes),
        preview.durationMinutes,
        { dayStart, dayEnd },
      );
    }
    return layout;
  });

  const rangeLabel = $derived(
    activeLayout
      ? formatTimeRange(activeLayout.startMinutes, activeLayout.endMinutes, t)
      : '',
  );
  const columned = $derived(columns > 1);
  const compact = $derived(Boolean(activeLayout && activeLayout.height <= 56));
  const showRangeMeta = $derived(Boolean(rangeLabel));
  const interactive = $derived(desktopInteractive && !task.completed);

  /** @param {PointerEvent} e @param {'move' | 'resize-top' | 'resize-bottom'} mode */
  function beginPointerDrag(e, mode) {
    if (!interactive || !task.scheduledStart) return;
    e.preventDefault();
    e.stopPropagation();

    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture(e.pointerId);

    const originY = e.clientY;
    const originStart = parseTimeToMinutes(task.scheduledStart);
    const originDuration = duration;
    const bounds = dayBoundsMinutes(dayStart, dayEnd);
    dragging = true;
    preview = { startMinutes: originStart, durationMinutes: originDuration };

    /** @param {PointerEvent} ev */
    function onMove(ev) {
      const delta = snapMinutesDelta(ev.clientY - originY);
      if (mode === 'move') {
        preview = moveBlockSchedule(originStart, originDuration, delta, bounds);
      } else if (mode === 'resize-top') {
        preview = resizeBlockTop(originStart, originDuration, delta, bounds);
      } else {
        preview = resizeBlockBottom(originStart, originDuration, delta, bounds);
      }
    }

    /** @param {PointerEvent} ev */
    function onUp(ev) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);

      const next = preview;
      dragging = false;
      preview = null;

      if (
        !next ||
        (next.startMinutes === originStart && next.durationMinutes === originDuration)
      ) {
        return;
      }

      applyTaskSchedule(task.id, {
        dateKey,
        start: formatMinutesAsTime(next.startMinutes),
        durationMinutes: next.durationMinutes,
      });
    }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }
</script>

{#if activeLayout}
  <article
    class="time-block"
    class:time-block--done={task.completed}
    class:time-block--focus={kind === 'focus'}
    class:time-block--conflict={hasConflict && !task.completed}
    class:time-block--compact={compact}
    class:time-block--columned={columned}
    class:time-block--dragging={dragging}
    class:time-block--interactive={interactive}
    style:top="{activeLayout.top}px"
    style:height="{activeLayout.height}px"
    style:--block-column={column}
    style:--block-columns={columns}
  >
    {#if interactive}
      <button
        type="button"
        class="time-block-handle time-block-handle--top"
        aria-label={t('schedule.resizeTop')}
        onpointerdown={(e) => beginPointerDrag(e, 'resize-top')}
      ></button>
    {/if}

    {#if interactive}
      <button
        type="button"
        class="time-block-grip"
        aria-label={t('schedule.moveBlock')}
        onpointerdown={(e) => beginPointerDrag(e, 'move')}
      >
        <Icon name="grip-vertical" size={12} strokeWidth={2} />
      </button>
    {/if}

    <button
      type="button"
      class="time-block-body"
      onclick={() => {
        if (!dragging) editTask(task);
      }}
    >
      <div class="time-block-title">{task.title}</div>
      {#if showRangeMeta}
        <div class="time-block-meta">{rangeLabel}</div>
      {/if}
    </button>

    {#if task.completed}
      <span class="time-block-check time-block-check--done" aria-label={t('common.done')}>
        <Icon name="check" size={12} strokeWidth={3} />
      </span>
    {:else}
      <button
        type="button"
        class="time-block-check time-block-check--toggle"
        aria-label={t('common.done')}
        onclick={() => completeTask(task.id)}
      >
        <span class="time-block-check-ring"></span>
      </button>
    {/if}

    {#if onReschedule && !compact && !columned && interactive}
      <button
        type="button"
        class="time-block-reschedule"
        onclick={onReschedule}
        aria-label={t('schedule.reschedule')}
      >
        {t('schedule.rescheduleShort')}
      </button>
    {/if}

    {#if interactive}
      <button
        type="button"
        class="time-block-handle time-block-handle--bottom"
        aria-label={t('schedule.resizeBottom')}
        onpointerdown={(e) => beginPointerDrag(e, 'resize-bottom')}
      ></button>
    {/if}
  </article>
{/if}
