<script module>
  /** 同一时刻只允许一行处于左滑展开状态 */
  let activeClose = null
</script>

<script>
  import { onDestroy } from 'svelte'
  import {
    isOverdue,
    taskUrgencyTier,
    updateTask,
    updateTaskDueDateAsync,
    deleteTaskAsync,
    restoreTask,
  } from '$lib/domain/tasks.js'
  import { formatDateShort } from '$lib/domain/dateFormat.js'
  import { listLabel, t } from '$lib/i18n/index.js'
  import { getListById, dateKeyOf, todayKey, S } from '$lib/state.svelte.js'
  import { getTaskKind } from '$lib/domain/taskKind.js'
  import { getProjectById } from '$lib/domain/projects.js'
  import { buildTaskMetaLine } from '$lib/domain/taskMetaLine.js'
  import { openSchedulePopover } from '$lib/ui.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { getLifeEventSource } from '$lib/lifeEventSource.js'
  import { paperLinksForTask } from '$lib/paperLinks.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { sensory } from '@life-os/platform-web/kenos-sensory'
  import { isIosNativeShell } from '@life-os/platform-web/ios-native-shell'

  /** @type {{ task: import('$lib/types.js').Task, compact?: boolean, metaMinimal?: boolean, ritualComplete?: boolean, showScheduleAction?: boolean, scheduleDate?: string, contextDate?: string, onToggle?: (id: string) => void, onEdit?: (task: import('$lib/types.js').Task) => void }} */
  let {
    task,
    compact = false,
    metaMinimal = false,
    ritualComplete = false,
    showScheduleAction = false,
    hideQuickActions = false,
    scheduleDate,
    contextDate,
    onToggle,
    onEdit,
  } = $props()

  /** Kenos iOS Domain Mode — title + due/project + one status; chips/actions in detail. */
  const nativeShell = $derived(isIosNativeShell())

  const COMPLETE_RITUAL_MS = 300
  const reduceMotion =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  let completing = $state(false)
  let completeTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  let overdueActionsOpen = $state(false)

  $effect(() => {
    task.id
    overdueActionsOpen = false
  })

  const showAsCompleted = $derived(task.completed || completing)

  const overdue = $derived(isOverdue(task))
  /** One warning tier per row — missed time (red gutter) vs muted overdue vs neutral. */
  const urgencyTier = $derived(taskUrgencyTier(task))
  const kind = $derived(getTaskKind(task))
  const list = $derived(getListById(task.listId))
  const project = $derived(getProjectById(task.projectId))
  const hasRecurrence = $derived(
    task.recurrence?.rule && task.recurrence.rule !== 'none',
  )
  const hasScheduledBlock = $derived(Boolean(task.scheduledStart))
  /** Compact lists: leading time column when a clock time exists. */
  const timeGutter = $derived.by(() => {
    if (!compact || showAsCompleted) return ''
    if (task.scheduledStart) return task.scheduledStart
    if (task.dueTime) return task.dueTime
    return ''
  })
  const metaLine = $derived.by(() => {
    const line = buildTaskMetaLine(task, t, {
      contextDate,
      minimal: metaMinimal,
      overdue,
      urgencyTier,
      omitScheduleTime: Boolean(timeGutter),
    })
    if (!nativeShell) return line
    // Native: fold project into the single meta line (no chip row).
    const projectTitle = project?.title?.trim()
    if (!projectTitle) return line
    if (line && line.includes(projectTitle)) return line
    return line ? `${line} · ${projectTitle}` : projectTitle
  })
  const lifeEventSource = $derived(getLifeEventSource(task, t))
  const paperLinks = $derived(paperLinksForTask(task))
  /* compact（Today/Calendar 列表）仍保留关键 chip：来源 · 项目 · 循环 */
  const hasKeyChips = $derived(
    Boolean(
      lifeEventSource || task.projectId || hasRecurrence || paperLinks.length,
    ),
  )
  /** Native shell: no chip row — detail sheet owns tags / source / sync. */
  const showSecondaryMeta = $derived(
    !nativeShell && !metaMinimal && (!compact || hasKeyChips),
  )
  const showScheduleBtn = $derived(
    !nativeShell &&
      showScheduleAction &&
      !task.completed &&
      !completing &&
      Boolean(scheduleDate),
  )
  const showOverdueActions = $derived(
    overdue && !showAsCompleted && !hideQuickActions && !nativeShell,
  )

  function fmtDate(dateKey) {
    return formatDateShort(dateKey)
  }

  /* ===== 滑动手势（右滑完成 / 左滑改期与删除，与主流待办 App 一致） ===== */

  const COMPLETE_THRESHOLD = 72
  const ACTION_W = 66
  // 已完成任务不显示「明天」改期按钮
  const actionsWidth = $derived(task.completed ? ACTION_W : ACTION_W * 2)

  let rowWidth = $state(0)
  let dx = $state(0)
  let settling = $state(false)
  let dragging = $state(false)
  /** 收起/吸附动画期间保留背景层的方向（1 右滑 / -1 左滑） */
  let settleSide = $state(0)

  let startX = 0
  let startY = 0
  let tracking = false
  let captured = false
  let openOffset = $state(0)
  let suppressClick = false
  let armedHaptic = false

  const fullDeleteThreshold = $derived(
    Math.max(actionsWidth + 70, rowWidth * 0.55),
  )
  const isOpen = $derived(openOffset < 0)
  const fullDelete = $derived(dx < -fullDeleteThreshold)
  const showComplete = $derived(dx > 0 || (settling && settleSide > 0))
  const showActions = $derived(dx < 0 || (settling && settleSide < 0))

  /** 带动画地移动到目标位置 */
  function animateTo(target) {
    settleSide = Math.sign(dx || target)
    settling = true
    dx = target
  }

  function onSettleEnd(e) {
    // 只响应自身 transform 的过渡结束（子元素的 transition 会冒泡上来）
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    settling = false
    settleSide = 0
  }

  function closeActions() {
    openOffset = 0
    animateTo(0)
    if (activeClose === closeActions) activeClose = null
  }

  function openActions() {
    if (activeClose && activeClose !== closeActions) activeClose()
    activeClose = closeActions
    openOffset = -actionsWidth
    animateTo(-actionsWidth)
  }

  onDestroy(() => {
    if (activeClose === closeActions) activeClose = null
    if (completeTimer) clearTimeout(completeTimer)
  })

  function requestComplete() {
    if (task.completed || completing) return

    if (!ritualComplete || reduceMotion) {
      void sensory('success')
      onToggle?.(task.id)
      return
    }

    completing = true
    void sensory('success')
    completeTimer = setTimeout(() => {
      completing = false
      completeTimer = null
      onToggle?.(task.id)
    }, COMPLETE_RITUAL_MS)
  }

  function handleCheckToggle() {
    if (task.completed) {
      void sensory('soft')
      onToggle?.(task.id)
      return
    }
    requestComplete()
  }

  /** Mirror `--kenos-gesture-edge-strip` (KenosShelfGesture.edgeStripWidth). */
  function edgeStripPx() {
    if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') {
      return 28
    }
    const n = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--kenos-gesture-edge-strip')
        .trim(),
    )
    return Number.isFinite(n) ? n : 28
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Kenos iOS: leading edge strip belongs to Space Shelf / WK Back — never steal.
    if (nativeShell && e.clientX <= edgeStripPx()) return
    // 动画进行中再次拖拽：以当前视觉位置为起点，避免跳变
    if (settling) {
      settling = false
      settleSide = 0
      openOffset = dx
    }
    startX = e.clientX
    startY = e.clientY
    tracking = true
    captured = false
    armedHaptic = false
  }

  function onPointerMove(e) {
    if (!tracking) return
    const rawDx = e.clientX - startX
    const rawDy = e.clientY - startY

    if (!captured) {
      if (Math.abs(rawDy) > 12 && Math.abs(rawDy) > Math.abs(rawDx)) {
        tracking = false // 纵向滚动，放弃手势
        return
      }
      if (Math.abs(rawDx) < 10 || Math.abs(rawDx) < Math.abs(rawDy) * 1.2)
        return
      captured = true
      dragging = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      // 滑动其他行时先合上已展开的行
      if (activeClose && activeClose !== closeActions) activeClose()
    }

    let next = openOffset + rawDx
    // 右滑超过阈值后阻尼，避免拖出屏幕
    if (next > COMPLETE_THRESHOLD) {
      next = COMPLETE_THRESHOLD + (next - COMPLETE_THRESHOLD) * 0.35
    }
    next = Math.max(-rowWidth, Math.min(next, COMPLETE_THRESHOLD + 48))
    dx = next

    // 到达触发点时轻确认（iOS shell → native haptic；PWA → vibrate）
    const armed = dx >= COMPLETE_THRESHOLD || dx < -fullDeleteThreshold
    if (armed && !armedHaptic) {
      void sensory('tick')
      armedHaptic = true
    } else if (!armed) {
      armedHaptic = false
    }
  }

  function onPointerUp(e) {
    if (!tracking) return
    tracking = false

    if (!captured) {
      // 纯点击：菜单展开时点行内其他区域 = 收起菜单
      if (isOpen && !e.target.closest?.('.swipe-action')) {
        suppressClick = true
        closeActions()
      }
      return
    }

    captured = false
    dragging = false
    suppressClick = true

    if (dx >= COMPLETE_THRESHOLD) {
      closeActions()
      requestComplete()
      return
    }
    if (dx < -fullDeleteThreshold) {
      closeActions()
      doDelete()
      return
    }
    if (dx < -actionsWidth / 2) {
      openActions()
      return
    }
    closeActions()
  }

  function onPointerCancel() {
    tracking = false
    captured = false
    dragging = false
    animateTo(openOffset)
  }

  function onClickCapture(e) {
    if (suppressClick) {
      suppressClick = false
      e.stopPropagation()
      e.preventDefault()
    }
  }

  function tomorrowKey() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return dateKeyOf(d)
  }

  function doTomorrow() {
    const date = tomorrowKey()
    void updateTaskDueDateAsync(task.id, date).catch((error) => {
      console.error('[kenos] TaskRow due tomorrow failed', error)
    })
    closeActions()
    toast(
      t('toast.scheduled', { title: task.title, date: fmtDate(date) }),
      'success',
      {
        key: 'task-scheduled-tomorrow',
        dedupeMs: 4000,
      },
    )
  }

  const archiveList = $derived(
    S.lists.find(
      (l) =>
        !l.deletedAt &&
        (l.title?.toLowerCase() === 'archive' || l.title === '归档'),
    ),
  )

  function thisWeekKey() {
    const d = new Date()
    const day = d.getDay()
    const diff = day === 0 ? 0 : 7 - day
    d.setDate(d.getDate() + diff)
    return dateKeyOf(d)
  }

  function doToday() {
    const date = todayKey()
    void updateTaskDueDateAsync(task.id, date).catch((error) => {
      console.error('[kenos] TaskRow due today failed', error)
    })
    closeActions()
    toast(
      t('toast.scheduled', { title: task.title, date: fmtDate(date) }),
      'success',
    )
  }

  function doThisWeek() {
    const date = thisWeekKey()
    void updateTaskDueDateAsync(task.id, date).catch((error) => {
      console.error('[kenos] TaskRow due this week failed', error)
    })
    closeActions()
    toast(
      t('toast.scheduled', { title: task.title, date: fmtDate(date) }),
      'success',
    )
  }

  function doClearDate() {
    void updateTaskDueDateAsync(task.id, null).catch((error) => {
      console.error('[kenos] TaskRow clear due failed', error)
    })
    closeActions()
    toast(t('toast.scheduleCleared', { title: task.title }), 'success')
  }

  function doArchive() {
    if (archiveList) {
      updateTask(task.id, { listId: archiveList.id })
      closeActions()
      toast(t('task.archivedSuccess', { title: task.title }), 'success')
    }
  }

  function doDelete() {
    const id = task.id
    void deleteTaskAsync(id).catch((error) => {
      toast(error?.message || t('toast.schedulePersistFailed'), 'warn')
    })
    closeActions()
    toast(t('toast.deleted'), 'success', {
      actionLabel: t('common.undo'),
      onAction: () => restoreTask(id),
    })
  }
</script>

<!-- 滑动手势容器：内部的按钮才是可交互元素，这里仅承载手势 -->
<div
  class="swipe-item"
  class:is-completing={completing}
  role="presentation"
  bind:clientWidth={rowWidth}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onclickcapture={onClickCapture}
>
  {#if showComplete}
    <div
      class="swipe-bg swipe-bg--complete"
      class:armed={dx >= COMPLETE_THRESHOLD}
      aria-hidden="true"
    >
      <Icon
        name={task.completed ? 'rotate-ccw' : 'check'}
        size={18}
        strokeWidth={3}
      />
    </div>
  {:else if showActions}
    <div class="swipe-bg swipe-bg--actions" class:full={fullDelete}>
      {#if !task.completed}
        <button
          type="button"
          class="swipe-action swipe-action--tomorrow"
          tabindex={isOpen ? 0 : -1}
          aria-label={t('upcoming.tomorrow')}
          onclick={doTomorrow}
        >
          <Icon name="calendar" size={16} strokeWidth={2.2} />
          <span>{t('upcoming.tomorrow')}</span>
        </button>
      {/if}
      <button
        type="button"
        class="swipe-action swipe-action--delete"
        tabindex={isOpen ? 0 : -1}
        aria-label={t('common.delete')}
        onclick={doDelete}
      >
        <Icon name="trash" size={16} strokeWidth={2.2} />
        <span>{t('common.delete')}</span>
      </button>
    </div>
  {/if}

  <div
    class="swipe-content"
    class:settling
    class:dragging
    style:transform={`translateX(${dx}px)`}
    ontransitionend={onSettleEnd}
  >
    <div
      class="task-row"
      class:done={showAsCompleted}
      class:completing
      class:overdue={urgencyTier === 'overdue'}
      class:task-row--compact={compact}
      class:task-row--focus={kind === 'focus'}
      class:task-row--micro={kind === 'micro'}
    >
      <button
        type="button"
        class="task-check"
        class:on={showAsCompleted}
        class:completing
        class:task-check--accent={task.priority === 'P0'}
        aria-label="toggle"
        onclick={handleCheckToggle}
      >
        {#if showAsCompleted}<Icon
            name="check"
            size={14}
            strokeWidth={3}
          />{/if}
      </button>

      <div
        class="task-body"
        role="button"
        tabindex="0"
        style="text-align:left;background:none;border:none;padding:0;width:100%;cursor:pointer"
        onclick={(e) => {
          if (e.target.closest('a') || e.target.closest('button')) return
          onEdit?.(task)
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.target.closest('a') || e.target.closest('button')) return
            e.preventDefault()
            onEdit?.(task)
          }
        }}
      >
        <div class="task-title-row">
          {#if timeGutter}
            <span
              class="task-time-gutter"
              class:missed={urgencyTier === 'missed'}
              >{timeGutter}</span
            >
          {/if}
          {#if kind === 'micro'}
            <span class="task-kind-dot" aria-hidden="true"></span>
          {/if}
          <div class="task-title" class:done-text={showAsCompleted}>
            {task.title}
          </div>
        </div>
        {#if metaLine}
          <p
            class="task-meta-line"
            class:task-meta-line--done={showAsCompleted}
            class:overdue={urgencyTier === 'overdue'}
          >
            {metaLine}
          </p>
        {/if}
        {#if showSecondaryMeta && (hasKeyChips || (!compact && (task.reminderMinutes != null || list || task.tags.length)))}
          <div class="task-meta">
            {#if lifeEventSource}
              <a
                class="chip chip--life-event"
                href={lifeEventSource.href}
                target="_blank"
                rel="noopener noreferrer"
                title={lifeEventSource.label}
                onclick={(e) => e.stopPropagation()}
              >
                {lifeEventSource.label}
              </a>
            {/if}
            {#if task.projectId}
              {#if project}
                <a
                  class="chip chip--project"
                  href="/projects/{project.id}"
                  title={project.title}
                  onclick={(e) => e.stopPropagation()}
                >
                  {project.title}
                </a>
              {:else}
                <span class="chip chip--project chip--project-missing">
                  {t('task.unknownProject')}
                </span>
              {/if}
            {/if}
            {#if hasRecurrence}
              <span class="chip chip--recurrence" title={t('task.recurring')}>
                <Icon name="repeat" size={11} strokeWidth={2.2} />
              </span>
            {/if}
            {#if paperLinks.length}
              <span class="chip chip--paper" title={t('task.paperLinks')}>
                <Icon name="link" size={11} strokeWidth={2.2} />
                PaperOS·{paperLinks[0].pageIndex}
              </span>
            {/if}
            {#if !compact}
              {#if task.reminderMinutes != null}
                <span class="chip">🔔</span>
              {/if}
              {#if list}<span class="chip">{listLabel(list)}</span>{/if}
              {#each task.tags.filter( (tag) => String(tag || '').trim(), ) as tag}<span
                  class="chip tag">{tag}</span
                >{/each}
            {/if}
          </div>
        {/if}
        {#if showOverdueActions}
          <div
            class="task-overdue-actions"
            role="presentation"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
          >
            <button type="button" class="overdue-action-btn" onclick={doToday}>
              {t('task.actionToday')}
            </button>
            <button
              type="button"
              class="overdue-action-btn"
              onclick={doTomorrow}
            >
              {t('task.actionTomorrow')}
            </button>
            {#if overdueActionsOpen}
              <button
                type="button"
                class="overdue-action-btn"
                onclick={doThisWeek}
              >
                {t('task.actionThisWeek')}
              </button>
              <button
                type="button"
                class="overdue-action-btn"
                onclick={doClearDate}
              >
                {t('task.actionClearDate')}
              </button>
              <button
                type="button"
                class="overdue-action-btn"
                onclick={handleCheckToggle}
              >
                {t('task.actionDone')}
              </button>
              {#if archiveList}
                <button
                  type="button"
                  class="overdue-action-btn"
                  onclick={doArchive}
                >
                  {t('task.actionArchive')}
                </button>
              {/if}
            {/if}
            <button
              type="button"
              class="overdue-action-btn overdue-action-btn--more"
              aria-expanded={overdueActionsOpen}
              onclick={() => {
                overdueActionsOpen = !overdueActionsOpen
              }}
            >
              {overdueActionsOpen ? t('task.actionLess') : t('task.actionMore')}
            </button>
          </div>
        {/if}
      </div>

      <div class="task-row-trailing">
        {#if showScheduleBtn}
          <button
            type="button"
            class="task-schedule-btn"
            class:task-schedule-btn--plan={!hasScheduledBlock}
            class:task-schedule-btn--adjust={hasScheduledBlock}
            onclick={(e) => {
              e.stopPropagation()
              openSchedulePopover(task.id, scheduleDate)
            }}
          >
            {hasScheduledBlock
              ? t('schedule.scheduleAdjustShort')
              : t('schedule.scheduleActionShort')}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
