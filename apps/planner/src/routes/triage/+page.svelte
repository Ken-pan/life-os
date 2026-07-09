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
    const today = todayKey()
    return S.tasks.filter((t) => {
      // Exclude completed or deleted
      if (t.completed || t.deletedAt) return false
      // Exclude archived
      if (archive && t.listId === archive.id) return false
      
      const isUnscheduled = !t.dueDate
      const isOverdue = t.dueDate && t.dueDate < today
      const isMissingPriority = !t.priority
      const isMissingSize = !t.size
      const isMissingNextAction = !t.nextAction || !t.nextAction.trim()
      
      return isUnscheduled || isOverdue || isMissingPriority || isMissingSize || isMissingNextAction
    })
  })

  let currentTaskId = $state(null)
  
  // Resolve active task to show
  const currentTask = $derived.by(() => {
    if (!triageTasks.length) return null
    const found = triageTasks.find(t => t.id === currentTaskId)
    return found || triageTasks[0]
  })
  
  // Keep active task ID updated
  $effect(() => {
    if (currentTask && currentTaskId !== currentTask.id) {
      currentTaskId = currentTask.id
    }
  })

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
    if (!currentTask) return
    updateTask(currentTask.id, { dueDate: todayKey() })
    toast(t('toast.saved'), 'success')
  }

  function doTomorrow() {
    if (!currentTask) return
    updateTask(currentTask.id, { dueDate: tomorrowKey() })
    toast(t('toast.saved'), 'success')
  }

  function doThisWeek() {
    if (!currentTask) return
    updateTask(currentTask.id, { dueDate: thisWeekKey() })
    toast(t('toast.saved'), 'success')
  }

  function doSomeday() {
    if (!currentTask) return
    updateTask(currentTask.id, { dueDate: null })
    toast(t('toast.saved'), 'success')
  }

  function doDone() {
    if (!currentTask) return
    toggleComplete(currentTask.id)
    toast(t('toast.saved'), 'success')
  }

  function doDelete() {
    if (!currentTask) return
    const id = currentTask.id
    deleteTask(id)
    toast(t('toast.deleted'), 'success')
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
  <AppBar title={t('nav.triage')} subtitle="Process messy tasks one by one" />

  <div class="wrap triage-container">
    {#if !currentTask}
      <div class="triage-done-state">
        <EmptyState message="All caught up!" hint="Your backlog is fully sorted and triaged." />
      </div>
    {:else}
      <div class="triage-card">
        <!-- Card Header -->
        <div class="triage-card-header">
          <span class="area-chip">
            {getListById(currentTask.listId) ? listLabel(getListById(currentTask.listId)) : 'Inbox'}
          </span>
          {#if currentTask.recurrence && currentTask.recurrence.rule !== 'none'}
            <span class="recurrence-chip">🔁 {currentTask.recurrence.rule}</span>
          {/if}
        </div>

        <!-- Task Title -->
        <h2 class="task-title">{currentTask.title}</h2>

        <!-- Task Notes -->
        {#if currentTask.notes}
          <p class="task-notes">{currentTask.notes}</p>
        {/if}

        <!-- Status / Dates -->
        <div class="task-status-row">
          <span class="status-label">Due Date:</span>
          <span class="status-value" class:overdue={isOverdue(currentTask)}>
            {currentTask.dueDate ? formatDateShort(currentTask.dueDate) : 'Unscheduled'}
            {#if isOverdue(currentTask)}
              <span class="overdue-badge">Overdue</span>
            {/if}
          </span>
        </div>

        <hr class="divider" />

        <!-- Metadata Form -->
        <div class="metadata-section">
          <!-- Priority -->
          <div class="meta-field">
            <span class="meta-label">Priority</span>
            <div class="selector-row">
              {#each ['P0', 'P1', 'P2', 'P3'] as p}
                <button
                  type="button"
                  class="selector-btn p-{p}"
                  class:selected={currentTask.priority === p}
                  onclick={() => setPriority(p)}
                >
                  {p}
                </button>
              {/each}
            </div>
          </div>

          <!-- Size -->
          <div class="meta-field">
            <span class="meta-label">Size</span>
            <div class="selector-row">
              {#each ['small', 'medium', 'large', 'epic'] as s}
                <button
                  type="button"
                  class="selector-btn size-{s}"
                  class:selected={currentTask.size === s}
                  onclick={() => setSize(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              {/each}
            </div>
          </div>

          <!-- Area -->
          <div class="meta-field">
            <span class="meta-label">Area</span>
            <div class="selector-row" style="flex-wrap: wrap; gap: 6px;">
              {#each ['life', 'work', 'planner', 'fitness', 'finance', 'home', 'other'] as a}
                <button
                  type="button"
                  class="selector-btn area-{a}"
                  style="flex: none; min-width: 65px; height: 30px; font-size: 11px; padding: 2px 4px;"
                  class:selected={currentTask.area === a}
                  onclick={() => setArea(a)}
                >
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              {/each}
            </div>
          </div>

          <!-- Next Action -->
          <div class="meta-field">
            <label for="triage-next-action" class="meta-label">Next Action</label>
            <input
              id="triage-next-action"
              type="text"
              class="text-input"
              placeholder="What is the next physical action?"
              value={currentTask.nextAction || ''}
              onchange={(e) => setNextAction(e.target.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  setNextAction(e.currentTarget.value);
                }
              }}
            />
          </div>

          <!-- Needs Split -->
          <div class="meta-field inline-field">
            <label class="checkbox-container">
              <input
                type="checkbox"
                checked={Boolean(currentTask.meta?.needsSplit)}
                onchange={(e) => setNeedsSplit(e.currentTarget.checked)}
              />
              <span class="checkbox-label">Needs Split (Complex Task)</span>
            </label>
          </div>
        </div>

        <hr class="divider" />

        <!-- Actions Panel -->
        <div class="actions-panel">
          <div class="action-section-title">Schedule</div>
          <div class="actions-grid schedule-grid">
            <button type="button" class="action-btn" onclick={doToday}>Today</button>
            <button type="button" class="action-btn" onclick={doTomorrow}>Tomorrow</button>
            <button type="button" class="action-btn" onclick={doThisWeek}>This Week</button>
            <button type="button" class="action-btn" onclick={doSomeday}>Someday</button>
          </div>

          <div class="action-section-title" style="margin-top: var(--space-4)">Operations</div>
          <div class="actions-grid operations-grid">
            <button type="button" class="action-btn btn-done" onclick={doDone}>
              <Icon name="check" size={16} /> Done
            </button>
            <button type="button" class="action-btn btn-edit" onclick={doEdit}>
              <Icon name="pencil" size={16} /> Edit
            </button>
            <button type="button" class="action-btn btn-delete" onclick={doDelete}>
              <Icon name="trash" size={16} /> Delete
            </button>
          </div>
        </div>

        <!-- Progress Counter -->
        <div class="triage-progress">
          Remaining in queue: <strong>{triageTasks.length}</strong> {triageTasks.length === 1 ? 'task' : 'tasks'}
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
    justify-content: center;
    align-items: flex-start;
  }
  .triage-done-state {
    width: 100%;
    margin-top: 10vh;
  }
  .triage-card {
    width: 100%;
    max-width: 520px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .triage-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .area-chip {
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
    gap: var(--space-3);
  }
  .meta-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
    min-height: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
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
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg);
    color: var(--t1);
    font-size: var(--text-sm);
  }
  .text-input:focus {
    outline: 2px solid color-mix(in srgb, var(--accent) 42%, transparent);
  }
  .checkbox-container {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--t2);
  }
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
    min-height: 40px;
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
    transition: all 0.15s ease;
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
  .triage-progress {
    font-size: var(--text-xs);
    color: var(--t3);
    text-align: center;
    margin-top: var(--space-2);
  }

  @media (max-width: 480px) {
    .schedule-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
