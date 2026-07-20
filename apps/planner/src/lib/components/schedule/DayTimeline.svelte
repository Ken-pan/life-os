<script>
  import { onMount } from 'svelte';
  import {
    HOUR_HEIGHT_PX,
    timelineHeightPx,
    currentTimeMarkerTop,
    isTodayDate,
    overlappingTaskIds,
    overlapBlockColumns,
    snapMinutesFromTimelineTop,
    formatMinutesAsTime,
    formatTimeRange,
    defaultDurationMinutes,
    blockLayout,
    taskDurationMinutes,
    DEFAULT_SLOT_DURATION_MINUTES,
    dayBoundsForTasks,
    slotPreviewFromPointer,
    slotRangeFromDrag,
    findScheduleConflicts,
  } from '$lib/domain/schedule.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';
  import TimeBlock from './TimeBlock.svelte';
  import {
    openSchedulePopover,
    openScheduleSlot,
    applyTaskSchedule,
    toast,
    scheduleDrag,
    endScheduleDrag,
  } from '$lib/ui.svelte.js';
  import { S } from '$lib/state.svelte.js';
  import { updateTaskScheduleAsync } from '$lib/domain/tasks.js';

  /** @type {{ dateKey: string, tasks: import('$lib/types.js').Task[] }} */
  let { dateKey, tasks } = $props();

  const CLICK_DRAG_THRESHOLD_PX = 4;

  /** @type {HTMLDivElement | undefined} */
  let scrollEl = $state();
  /** @type {HTMLDivElement | undefined} */
  let canvasEl = $state();

  let dragOver = $state(false);
  let desktopDnD = $state(false);
  let nowMs = $state(Date.now());
  /** @type {string | null} */
  let lastScrollKey = $state(null);

  /**
   * @typedef {{
   *   mode: 'hover' | 'drop' | 'create',
   *   top: number,
   *   height: number,
   *   label: string,
   *   title?: string,
   *   conflict?: boolean,
   *   conflictCount?: number,
   * }} GhostState
   */
  /** @type {GhostState | null} */
  let ghost = $state(null);

  /**
   * @typedef {{
   *   pointerId: number,
   *   originClientY: number,
   *   originTopPx: number,
   *   active: boolean,
   * }} CreateGesture
   */
  /** @type {CreateGesture | null} */
  let createGesture = $state(null);

  /* 可见时间窗随当日块动态外扩（SCH：窗口外块不可丢）。今天再额外把窗口撑到包含
     「现在」这一刻 —— 否则深夜/清晨（默认窗 8–23 外）看不到 now-line、也无法自动滚到
     当前时间（Apple/Google 日历日视图标配：打开即定位到现在）。 */
  const dayBounds = $derived.by(() => {
    if (!isTodayDate(dateKey, todayKey())) return dayBoundsForTasks(tasks);
    const nowHour = new Date(nowMs).getHours();
    return dayBoundsForTasks(tasks, {
      dayStart: Math.min(8, nowHour),
      dayEnd: Math.max(23, nowHour + 1),
    });
  });
  const dayStart = $derived(dayBounds.dayStart);
  const dayEnd = $derived(dayBounds.dayEnd);
  const hours = $derived(
    Array.from({ length: dayEnd - dayStart }, (_, i) => dayStart + i),
  );
  const height = $derived(timelineHeightPx(dayStart, dayEnd));
  const nowTop = $derived(
    isTodayDate(dateKey, todayKey())
      ? currentTimeMarkerTop(nowMs, dayStart, dayEnd)
      : null,
  );
  const overlapIds = $derived(overlappingTaskIds(tasks));
  const overlapColumns = $derived(overlapBlockColumns(tasks));
  const showJumpNow = $derived(isTodayDate(dateKey, todayKey()) && nowTop != null);

  function formatHour(h) {
    return `${String(h).padStart(2, '0')}:00`;
  }

  /** @param {number} clientY */
  function canvasTopPx(clientY) {
    if (!canvasEl) return 0;
    return clientY - canvasEl.getBoundingClientRect().top;
  }

  function clearHoverGhost() {
    if (ghost?.mode === 'hover') ghost = null;
  }

  function clearDropGhost() {
    if (ghost?.mode === 'drop') ghost = null;
  }

  function clearCreateGhost() {
    if (ghost?.mode === 'create') ghost = null;
  }

  function resetDragTarget() {
    dragOver = false;
    clearDropGhost();
  }

  /** @param {number} topPx @param {number} durationMinutes */
  function pointerPreview(topPx, durationMinutes) {
    return slotPreviewFromPointer(topPx, durationMinutes, { dayStart, dayEnd });
  }

  /** @param {number} topPx */
  function setHoverGhost(topPx) {
    if (!desktopDnD || createGesture || dragOver) return;
    const preview = pointerPreview(topPx, DEFAULT_SLOT_DURATION_MINUTES);
    if (!preview) {
      clearHoverGhost();
      return;
    }
    ghost = {
      mode: 'hover',
      top: preview.layout.top,
      height: preview.layout.height,
      label: formatTimeRange(preview.startMinutes, preview.endMinutes, t),
    };
  }

  /** @param {number} topPx */
  function setDropGhost(topPx) {
    const taskId = scheduleDrag.taskId;
    if (!taskId) return;
    const task = S.tasks.find((item) => item.id === taskId && !item.deletedAt);
    if (!task) return;

    const durationMinutes = task.durationMinutes || defaultDurationMinutes(task);
    const preview = pointerPreview(topPx, durationMinutes);
    if (!preview) {
      clearDropGhost();
      return;
    }

    const conflicts = findScheduleConflicts(
      tasks,
      preview.start,
      preview.durationMinutes,
      task.id,
    );
    ghost = {
      mode: 'drop',
      top: preview.layout.top,
      height: preview.layout.height,
      title: task.title,
      label: formatTimeRange(preview.startMinutes, preview.endMinutes, t),
      conflict: conflicts.length > 0,
      conflictCount: conflicts.length,
    };
  }

  /** @param {import('$lib/types.js').Task} task */
  function reschedule(task) {
    openSchedulePopover(task.id, dateKey);
  }

  /** @param {DragEvent} e */
  function onDragEnter(e) {
    if (!desktopDnD) return;
    if (!e.dataTransfer?.types.includes('application/x-planner-task-id')) return;
    e.preventDefault();
    dragOver = true;
  }

  /** @param {DragEvent} e */
  function onDragOver(e) {
    if (!desktopDnD) return;
    if (!e.dataTransfer?.types.includes('application/x-planner-task-id')) return;
    e.preventDefault();
    dragOver = true;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (canvasEl) setDropGhost(canvasTopPx(e.clientY));
  }

  /** @param {DragEvent} e */
  function onDragLeave(e) {
    if (!desktopDnD) return;
    const related = /** @type {Node | null} */ (e.relatedTarget);
    // Ignore leave events that stay inside the canvas (child transitions).
    if (related && canvasEl?.contains(related)) return;
    dragOver = false;
    clearDropGhost();
  }

  /** @param {DragEvent} e */
  async function onDrop(e) {
    resetDragTarget();
    if (!desktopDnD || !canvasEl) return;
    e.preventDefault();
    const taskId =
      e.dataTransfer?.getData('application/x-planner-task-id') || scheduleDrag.taskId;
    endScheduleDrag();
    if (!taskId) return;

    const task = S.tasks.find((item) => item.id === taskId && !item.deletedAt);
    if (!task) return;

    const topPx = canvasTopPx(e.clientY);
    const durationMinutes = task.durationMinutes || defaultDurationMinutes(task);
    const preview = pointerPreview(topPx, durationMinutes);
    if (!preview) return;

    const previous = {
      scheduledDate: task.scheduledDate ?? null,
      scheduledStart: task.scheduledStart ?? null,
      durationMinutes: task.durationMinutes ?? null,
    };

    const applied = await applyTaskSchedule(task.id, {
      dateKey,
      start: preview.start,
      durationMinutes: preview.durationMinutes,
    });
    if (!applied) return;
    toast(t('toast.scheduledBlock', { title: task.title, start: preview.start }), 'success', {
      key: `schedule-${task.id}`,
      dedupeMs: 4000,
      actionLabel: t('common.undo'),
      onAction: () => {
        void updateTaskScheduleAsync(task.id, {
          scheduledDate: previous.scheduledDate,
          scheduledStart: previous.scheduledStart,
          durationMinutes: previous.durationMinutes,
        }).catch((error) => {
          console.error('[kenos] DayTimeline schedule undo failed', error);
        });
      },
    });
  }

  /** @param {PointerEvent} e */
  function onHitboxPointerDown(e) {
    if (!desktopDnD || !canvasEl) return;
    if (e.button !== 0) return;
    e.preventDefault();
    clearHoverGhost();
    createGesture = {
      pointerId: e.pointerId,
      originClientY: e.clientY,
      originTopPx: canvasTopPx(e.clientY),
      active: false,
    };
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function onHitboxPointerMove(e) {
    if (createGesture && createGesture.pointerId === e.pointerId) {
      const dy = Math.abs(e.clientY - createGesture.originClientY);
      if (!createGesture.active && dy < CLICK_DRAG_THRESHOLD_PX) return;

      createGesture = { ...createGesture, active: true };
      const range = slotRangeFromDrag(createGesture.originTopPx, canvasTopPx(e.clientY), {
        dayStart,
        dayEnd,
      });
      if (!range) {
        clearCreateGhost();
        return;
      }
      ghost = {
        mode: 'create',
        top: range.layout.top,
        height: range.layout.height,
        label: formatTimeRange(range.startMinutes, range.endMinutes, t),
      };
      return;
    }

    if (!desktopDnD || dragOver || createGesture) return;
    setHoverGhost(canvasTopPx(e.clientY));
  }

  /** @param {PointerEvent} e */
  function onHitboxPointerUp(e) {
    if (!createGesture || createGesture.pointerId !== e.pointerId) return;
    const gesture = createGesture;
    createGesture = null;
    try {
      /** @type {HTMLElement} */ (e.currentTarget).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (!gesture.active) {
      const preview = pointerPreview(
        gesture.originTopPx,
        DEFAULT_SLOT_DURATION_MINUTES,
      );
      clearCreateGhost();
      if (preview) openScheduleSlot(dateKey, preview.start, DEFAULT_SLOT_DURATION_MINUTES);
      return;
    }

    const range = slotRangeFromDrag(gesture.originTopPx, canvasTopPx(e.clientY), {
      dayStart,
      dayEnd,
    });
    clearCreateGhost();
    if (range) openScheduleSlot(dateKey, range.start, range.durationMinutes);
  }

  /** @param {PointerEvent} e */
  function onHitboxPointerCancel(e) {
    if (!createGesture || createGesture.pointerId !== e.pointerId) return;
    createGesture = null;
    clearCreateGhost();
  }

  function onHitboxPointerLeave() {
    if (!createGesture) clearHoverGhost();
  }

  /** @param {MouseEvent} e */
  function onHitboxClick(e) {
    if (desktopDnD) {
      e.preventDefault();
      return;
    }
    if (!canvasEl) return;
    const target = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
    if (target?.closest('.time-block')) return;

    const topPx = canvasTopPx(e.clientY);
    const startMinutes = snapMinutesFromTimelineTop(topPx, { dayStart, dayEnd });
    const start = formatMinutesAsTime(startMinutes);
    openScheduleSlot(dateKey, start, DEFAULT_SLOT_DURATION_MINUTES);
  }

  /** @param {import('$lib/types.js').Task[]} scheduledTasks */
  function scrollAnchorTop(scheduledTasks) {
    let earliestTop = null;
    for (const task of scheduledTasks) {
      if (!task.scheduledStart) continue;
      const layout = blockLayout(task.scheduledStart, taskDurationMinutes(task), {
        dayStart,
        dayEnd,
      });
      if (!layout) continue;
      earliestTop =
        earliestTop == null ? layout.top : Math.min(earliestTop, layout.top);
    }

    const markerTop = isTodayDate(dateKey, todayKey())
      ? currentTimeMarkerTop(nowMs, dayStart, dayEnd)
      : null;
    if (markerTop != null) {
      return earliestTop != null ? Math.min(earliestTop, markerTop) : markerTop;
    }
    return earliestTop ?? 0;
  }

  /** @param {HTMLElement | null | undefined} el 时间轴自身是否为滚动容器（桌面）*/
  function ownsScroll(el) {
    if (!el) return false;
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    const overflowY = getComputedStyle(el).overflowY;
    return overflowY === 'auto' || overflowY === 'scroll';
  }

  /** 找到实际滚动面（桌面 = 时间轴内滚；移动端 = 页面主滚动面） */
  function findScrollSurface() {
    /** @type {HTMLElement | null | undefined} */
    let node = scrollEl;
    while (node) {
      if (ownsScroll(node)) return node;
      node = node.parentElement;
    }
    return /** @type {HTMLElement | null} */ (document.scrollingElement);
  }

  /** @param {number} anchorPx canvas 内 Y 坐标 @param {ScrollBehavior} [behavior] */
  function scrollToAnchor(anchorPx, behavior = 'auto') {
    if (!canvasEl) return;
    const surface = findScrollSurface();
    if (!surface) return;
    const canvasOffset =
      canvasEl.getBoundingClientRect().top -
      surface.getBoundingClientRect().top +
      surface.scrollTop;
    surface.scrollTo({
      top: Math.max(0, canvasOffset + anchorPx - surface.clientHeight * 0.12),
      behavior,
    });
  }

  $effect(() => {
    if (!scrollEl) return;

    const scrollKey = `${dateKey}:${tasks.map((task) => `${task.id}:${task.scheduledStart}:${task.durationMinutes}`).join('|')}`;
    if (scrollKey === lastScrollKey) return;
    lastScrollKey = scrollKey;

    // 仅当时间轴自带滚动（桌面）时自动锚定；移动端页面主滚动面不被劫持。
    if (!ownsScroll(scrollEl)) return;
    const anchor = scrollAnchorTop(tasks);
    scrollEl.scrollTop = Math.max(0, anchor - scrollEl.clientHeight * 0.12);
  });

  $effect(() => {
    if (scheduleDrag.taskId) return;
    if (ghost?.mode === 'drop') ghost = null;
    if (dragOver) dragOver = false;
  });

  onMount(() => {
    const tickNow = () => {
      nowMs = Date.now();
    };
    tickNow();
    const nowTimer = window.setInterval(tickNow, 60_000);

    const mq = window.matchMedia('(min-width: 840px) and (pointer: fine)');
    const sync = () => {
      desktopDnD = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => {
      window.clearInterval(nowTimer);
      mq.removeEventListener('change', sync);
      endScheduleDrag();
    };
  });
</script>

<div class="day-timeline-shell">
  <div class="day-timeline-scroll" bind:this={scrollEl}>
    <div class="day-timeline" style:--timeline-height="{height}px">
      <div class="day-timeline-ruler" aria-hidden="true">
        {#each hours as hour (hour)}
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
        ondragenter={onDragEnter}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
      >
        <button
          type="button"
          class="day-timeline-slot-hitbox"
          aria-label={t('schedule.createAtSlot')}
          onpointerdown={onHitboxPointerDown}
          onpointermove={onHitboxPointerMove}
          onpointerup={onHitboxPointerUp}
          onpointercancel={onHitboxPointerCancel}
          onpointerleave={onHitboxPointerLeave}
          onclick={onHitboxClick}
        ></button>
        <div class="day-timeline-grid" aria-hidden="true">
          {#each hours as hour (hour)}
            <div class="day-timeline-grid-line" style:height="{HOUR_HEIGHT_PX}px"></div>
          {/each}
        </div>

        {#if nowTop != null}
          <div class="day-timeline-now" style:top="{nowTop}px" aria-hidden="true">
            <span class="day-timeline-now-dot"></span>
          </div>
        {/if}

        {#if ghost}
          <div
            class="day-timeline-ghost"
            class:day-timeline-ghost--hover={ghost.mode === 'hover'}
            class:day-timeline-ghost--drop={ghost.mode === 'drop'}
            class:day-timeline-ghost--create={ghost.mode === 'create'}
            class:day-timeline-ghost--conflict={Boolean(ghost.conflict)}
            style:top="{ghost.top}px"
            style:height="{ghost.height}px"
            role="status"
            aria-label={t('schedule.slotGhost')}
          >
            <div class="day-timeline-ghost-body">
              {#if ghost.title}
                <div class="day-timeline-ghost-title">{ghost.title}</div>
              {/if}
              <div class="day-timeline-ghost-meta">{ghost.label}</div>
              {#if ghost.conflict && ghost.conflictCount}
                <div class="day-timeline-ghost-conflict">
                  {t('schedule.conflictHint', { count: ghost.conflictCount })}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <div class="day-timeline-blocks">
          {#each tasks as task (task.id)}
            {@const columnLayout = overlapColumns.get(task.id)}
            <TimeBlock
              {task}
              {dateKey}
              {dayStart}
              {dayEnd}
              hasConflict={overlapIds.has(task.id)}
              column={columnLayout?.column ?? 0}
              columns={columnLayout?.columns ?? 1}
              onReschedule={() => reschedule(task)}
            />
          {/each}
        </div>

        {#if !tasks.length && !ghost}
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
          if (nowTop == null) return;
          scrollToAnchor(nowTop, 'smooth');
        }}
      >
        {t('schedule.jumpNow')}
      </button>
    </div>
  {/if}
</div>
