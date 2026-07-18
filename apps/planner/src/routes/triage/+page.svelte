<script>
  import { S, todayKey, getListById, dateKeyOf } from '$lib/state.svelte.js'
  import { updateTask, deleteTask, toggleComplete, isOverdue } from '$lib/domain/tasks.js'
  import { listLabel, t } from '$lib/i18n/index.js'
  import { formatDateShort } from '$lib/domain/dateFormat.js'
  import { editTask } from '$lib/taskUi.js'
  import AppBar from '$lib/components/AppBar.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { toast } from '$lib/ui.svelte.js'

  // Filter tasks that need triage
  const triageTasks = $derived.by(() => {
    const archive = S.lists.find(
      (l) =>
        !l.deletedAt &&
        (l.title?.toLowerCase() === 'archive' || l.title === '归档'),
    )
    return S.tasks.filter((t) => {
      // Exclude completed or deleted
      if (t.completed || t.deletedAt) return false
      // Exclude archived
      if (archive && t.listId === archive.id) return false
      // Exclude anything already triaged
      if (t.meta?.triagedAt) return false
      // 只处理收件箱 / 未整理项：还没排日期的任务（与收件箱视图口径一致）。
      // 已排好日期的任务视为已安排，不再进入引导式快速处理。
      return !t.dueDate
    })
  })

  let currentTaskId = $state(null)
  let processedCount = $state(0)
  let initialQueueCount = $state(0)
  
  // Resolve active task to show
  const currentTask = $derived.by(() => {
    if (!triageTasks.length) return null
    const found = triageTasks.find(t => t.id === currentTaskId)
    return found || triageTasks[0]
  })
  
  // Keep active task ID updated
  $effect(() => {
    if (!initialQueueCount && triageTasks.length) initialQueueCount = triageTasks.length
    if (currentTask && currentTaskId !== currentTask.id) {
      currentTaskId = currentTask.id
    }
  })

  function finishTriage(patch = {}) {
    if (!currentTask) return
    updateTask(currentTask.id, {
      ...patch,
      meta: {
        ...(currentTask.meta || {}),
        ...(patch.meta || {}),
        triagedAt: Date.now(),
      },
    })
    processedCount += 1
    toast(t('triage.saved'), 'success')
  }

  function tomorrowKey() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return dateKeyOf(d)
  }

  function thisWeekKey() {
    const d = new Date()
    const day = d.getDay()
    const diff = day === 0 ? 0 : 7 - day
    d.setDate(d.getDate() + diff)
    return dateKeyOf(d)
  }

  function doToday() {
    finishTriage({ dueDate: todayKey() })
  }

  function doTomorrow() {
    finishTriage({ dueDate: tomorrowKey() })
  }

  function doThisWeek() {
    finishTriage({ dueDate: thisWeekKey() })
  }

  function doSomeday() {
    finishTriage({ dueDate: null })
  }

  function doDone() {
    if (!currentTask) return
    toggleComplete(currentTask.id)
    processedCount += 1
    toast(t('triage.completed'), 'success')
  }

  function doDelete() {
    if (!currentTask) return
    const id = currentTask.id
    deleteTask(id)
    processedCount += 1
    toast(t('triage.deleted'), 'success')
  }

  function doEdit() {
    if (!currentTask) return
    editTask(currentTask)
  }

  function setPriority(p) {
    if (!currentTask) return
    updateTask(currentTask.id, { priority: p })
  }

  function setSize(s) {
    if (!currentTask) return
    updateTask(currentTask.id, { size: s })
  }

  function setArea(a) {
    if (!currentTask) return
    updateTask(currentTask.id, { area: a })
  }

  function setNextAction(val) {
    if (!currentTask) return
    updateTask(currentTask.id, { nextAction: val.trim() || null })
  }

  function setNeedsSplit(checked) {
    if (!currentTask) return
    updateTask(currentTask.id, {
      meta: {
        ...(currentTask.meta || {}),
        needsSplit: checked
      }
    })
  }
</script>

<div class="life-os-page-workspace triage-page">
  <AppBar title={t('nav.triage')} subtitle={t('triage.subtitle')} />

  <div class="wrap triage-container">
    {#if !currentTask}
      <div class="triage-done-state">
        <div class="completion-mark" aria-hidden="true"><Icon name="check" size={28} /></div>
        <EmptyState message={t('triage.allDone')} hint={t('triage.allDoneHint')} />
        {#if processedCount}
          <p class="session-summary">{t('triage.sessionSummary', { count: processedCount })}</p>
        {/if}
      </div>
    {:else}
      <div class="triage-progress-header">
        <div>
          <span>{t('triage.progressLabel')}</span>
          <strong>{t('triage.remaining', { count: triageTasks.length })}</strong>
        </div>
        <div
          class="progress progress--sm"
          role="progressbar"
          aria-label={t('triage.progressLabel')}
          aria-valuemin="0"
          aria-valuemax={Math.max(initialQueueCount, triageTasks.length)}
          aria-valuenow={processedCount}
        >
          <div
            class="progress__fill"
            style="--progress-value: {Math.min(100, (processedCount / Math.max(initialQueueCount, 1)) * 100)}%"
          ></div>
        </div>
      </div>

      <div class="triage-card">
        <div class="triage-card-header">
          <span class="source-label">
            {getListById(currentTask.listId) ? listLabel(getListById(currentTask.listId)) : 'Inbox'}
          </span>
          {#if currentTask.recurrence && currentTask.recurrence.rule !== 'none'}
            <span class="recurrence-chip">{t('triage.repeating')}</span>
          {/if}
        </div>

        <h2 class="task-title">{currentTask.title}</h2>
        {#if currentTask.notes}
          <p class="task-notes">{currentTask.notes}</p>
        {/if}

        <div class="task-status-row">
          <span class="status-label">{t('triage.due')}</span>
          <span class="status-value" class:overdue={isOverdue(currentTask)}>
            {currentTask.dueDate ? formatDateShort(currentTask.dueDate) : t('triage.unscheduled')}
            {#if isOverdue(currentTask)}
              <span class="overdue-badge">{t('triage.overdue')}</span>
            {/if}
          </span>
        </div>

        <div class="metadata-section">
          <div class="meta-field next-action-field">
            <label for="triage-next-action" class="meta-label">{t('triage.nextAction')}</label>
            <input
              id="triage-next-action"
              type="text"
              class="text-input"
              placeholder={t('triage.nextActionPlaceholder')}
              value={currentTask.nextAction || ''}
              onchange={(e) => setNextAction(e.currentTarget.value)}
              onkeydown={(e) => e.key === 'Enter' && setNextAction(e.currentTarget.value)}
            />
            <span class="field-hint">{t('triage.nextActionHint')}</span>
          </div>

          <fieldset class="meta-field">
            <legend class="meta-label">{t('triage.priority')}</legend>
            <div class="selector-row">
              {#each ['P0', 'P1', 'P2', 'P3'] as p}
                <button
                  type="button"
                  class="selector-btn p-{p}"
                  class:selected={currentTask.priority === p}
                  aria-pressed={currentTask.priority === p}
                  onclick={() => setPriority(p)}
                >
                  {p}
                </button>
              {/each}
            </div>
          </fieldset>

          <fieldset class="meta-field">
            <legend class="meta-label">{t('triage.size')}</legend>
            <div class="selector-row">
              {#each ['small', 'medium', 'large', 'epic'] as s}
                <button
                  type="button"
                  class="selector-btn size-{s}"
                  class:selected={currentTask.size === s}
                  aria-pressed={currentTask.size === s}
                  onclick={() => setSize(s)}
                >
                  {t(`triage.size_${s}`)}
                </button>
              {/each}
            </div>
          </fieldset>

          <details class="more-details">
            <summary>{t('triage.moreDetails')}</summary>
            <fieldset class="meta-field">
              <legend class="meta-label">{t('triage.area')}</legend>
              <div class="selector-row area-selector-row">
              {#each ['life', 'work', 'planner', 'fitness', 'finance', 'home', 'other'] as a}
                <button
                  type="button"
                  class="selector-btn area-{a}"
                  class:selected={currentTask.area === a}
                  aria-pressed={currentTask.area === a}
                  onclick={() => setArea(a)}
                >
                  {t(`triage.area_${a}`)}
                </button>
              {/each}
              </div>
            </fieldset>
            <label class="option-row">
              <input
                class="checkbox"
                type="checkbox"
                checked={Boolean(currentTask.meta?.needsSplit)}
                onchange={(e) => setNeedsSplit(e.currentTarget.checked)}
              />
              <span class="checkbox-label">{t('triage.needsSplit')}</span>
            </label>
          </details>
        </div>

        <div class="actions-panel">
          <div class="action-section-title">{t('triage.organize')}</div>
          <div class="actions-grid schedule-grid">
            <button type="button" class="action-btn action-primary" onclick={doToday}>{t('triage.today')}</button>
            <button type="button" class="action-btn" onclick={doTomorrow}>{t('triage.tomorrow')}</button>
            <button type="button" class="action-btn" onclick={doThisWeek}>{t('triage.thisWeek')}</button>
            <button type="button" class="action-btn" onclick={doSomeday}>{t('triage.someday')}</button>
          </div>

          <div class="actions-grid operations-grid">
            <button type="button" class="action-btn btn-done" onclick={doDone}>
              <Icon name="check" size={16} /> {t('triage.done')}
            </button>
            <button type="button" class="action-btn btn-edit" onclick={doEdit}>
              <Icon name="pencil" size={16} /> {t('triage.edit')}
            </button>
            <button type="button" class="action-btn btn-delete" onclick={doDelete}>
              <Icon name="trash" size={16} /> {t('triage.delete')}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .triage-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .triage-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    gap: var(--space-3);
    width: min(100%, 600px);
    margin-inline: auto;
  }
  .triage-done-state {
    width: 100%;
    margin-top: 10vh;
    text-align: center;
  }
  .triage-card {
    width: 100%;
    max-width: none;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: clamp(var(--space-4), 4vw, var(--space-6));
    box-shadow: 0 12px 36px color-mix(in srgb, var(--t1) 7%, transparent);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .triage-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .source-label {
    font-family: var(--mono);
    font-size: var(--text-xs);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    padding: 2px 8px;
    border-radius: 99px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .recurrence-chip {
    font-size: var(--text-xs);
    color: var(--t2);
  }
  .task-title {
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--t1);
    margin: 0;
    line-height: 1.3;
    word-wrap: break-word;
  }
  .task-notes {
    font-size: var(--text-sm);
    color: var(--t2);
    margin: 0;
    line-height: 1.4;
    white-space: pre-wrap;
    background: color-mix(in srgb, var(--t1) 2%, transparent);
    padding: var(--space-2);
    border-radius: var(--radius-control);
  }
  .task-status-row {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .status-label {
    color: var(--t3);
  }
  .status-value {
    color: var(--t2);
    font-weight: 500;
  }
  .status-value.overdue {
    color: var(--t1);
  }
  .overdue-badge {
    background: #e34432;
    color: #fff;
    font-size: var(--text-xxs);
    padding: 1px 6px;
    border-radius: 4px;
    margin-left: 6px;
    font-weight: 700;
  }
  .divider {
    border: 0;
    border-top: 1px solid var(--border);
    margin: var(--space-1) 0;
  }
  .metadata-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-block: var(--space-3);
    border-block: 1px solid var(--border);
  }
  .meta-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  fieldset.meta-field {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .meta-label {
    font-family: var(--mono);
    font-size: var(--text-xxs);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .selector-row {
    display: flex;
    gap: 8px;
  }
  .selector-btn {
    flex: 1;
    min-height: var(--tap-min);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-standard);
  }
  .selector-btn:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }
  .selector-btn.selected {
    background: var(--t1);
    color: var(--bg);
    border-color: var(--t1);
  }
  .selector-btn.selected.p-P0 {
    background: #e34432;
    border-color: #e34432;
    color: #fff;
  }
  .selector-btn.selected.p-P1 {
    background: #f5a623;
    border-color: #f5a623;
    color: #fff;
  }
  .selector-btn.selected.p-P2 {
    background: #0f66ae;
    border-color: #0f66ae;
    color: #fff;
  }
  .selector-btn.selected.p-P3 {
    background: #a8a5a0;
    border-color: #a8a5a0;
    color: #fff;
  }
  .text-input {
    min-height: var(--tap-min);
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-sm);
  }
  .text-input:focus {
    outline: 2px solid color-mix(in srgb, var(--accent) 42%, transparent);
  }
  /* 选项行基座（.option-row/.checkbox）已下沉 @life-os/theme */
  .checkbox-label {
    user-select: none;
  }
  .action-section-title {
    font-family: var(--mono);
    font-size: var(--text-xxs);
    color: var(--t3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-2);
  }
  .actions-grid {
    display: grid;
    gap: 8px;
  }
  .schedule-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .operations-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .action-btn {
    min-height: var(--tap-min);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--t1) 2%, transparent);
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all var(--dur-fast) var(--ease-standard);
  }
  .action-btn:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    color: var(--t1);
  }
  .btn-done {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .btn-done:hover {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  .btn-delete {
    background: rgba(227, 68, 50, 0.08);
    color: #e34432;
    border-color: rgba(227, 68, 50, 0.2);
  }
  .btn-delete:hover {
    background: rgba(227, 68, 50, 0.15);
  }

  .triage-progress-header {
    width: 100%;
    display: grid;
    gap: var(--space-2);
  }

  .triage-progress-header > div:first-child {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--t3);
    font-size: var(--text-xs);
  }

  .triage-progress-header strong {
    color: var(--t2);
    font-weight: 650;
  }

  .field-hint,
  .session-summary {
    color: var(--t3);
    font-size: var(--text-xs);
  }

  .next-action-field .meta-label {
    color: var(--t2);
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0;
    text-transform: none;
  }

  .more-details {
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--t1) 2%, transparent);
  }

  .more-details summary {
    display: flex;
    align-items: center;
    min-height: var(--tap-min);
    padding-inline: var(--space-3);
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .more-details[open] {
    padding-bottom: var(--space-3);
  }

  .more-details[open] summary {
    margin-bottom: var(--space-2);
  }

  .more-details .meta-field,
  .more-details :global(.option-row) {
    margin-inline: var(--space-3);
  }

  .area-selector-row {
    flex-wrap: wrap;
  }

  .area-selector-row .selector-btn {
    flex: 1 1 86px;
  }

  .actions-panel {
    display: grid;
    gap: var(--space-3);
  }

  .action-primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-contrast, #fff);
    font-weight: 700;
  }

  .action-primary:hover {
    background: color-mix(in srgb, var(--accent) 88%, var(--t1));
    color: var(--accent-contrast, #fff);
  }

  .operations-grid {
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .completion-mark {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    margin: 0 auto var(--space-3);
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }

  @media (max-width: 480px) {
    .triage-container {
      padding: var(--space-3);
    }

    .triage-card {
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      box-shadow: none;
    }

    .schedule-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .selector-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
    }

    .area-selector-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .selector-btn,
    .action-btn {
      transition: none;
    }
  }
</style>
