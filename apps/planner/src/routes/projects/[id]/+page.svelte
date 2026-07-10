<script>
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import TaskGroup from '$lib/components/TaskGroup.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { S } from '$lib/state.svelte.js'
  import { createTask } from '$lib/domain/tasks.js'
  import {
    deleteProject,
    getProjectById,
    projectNextTask,
    projectOpenTasks,
    setProjectStatus,
    updateProject,
  } from '$lib/domain/projects.js'
  import { sortTasks } from '$lib/engine/prioritizer.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { SYSTEM_LIST_INBOX } from '$lib/types.js'
  import { t } from '$lib/i18n/index.js'
  import { toast } from '$lib/ui.svelte.js'

  const projectId = $derived(page.params.id)
  const project = $derived(getProjectById(projectId))
  const openTasks = $derived(project ? sortTasks(projectOpenTasks(project), 'smart') : [])
  const doneTasks = $derived(
    project
      ? S.tasks
          .filter((task) => task.projectId === project.id && task.completed && !task.deletedAt)
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      : [],
  )
  const nextTask = $derived(project ? projectNextTask(project) : null)

  let title = $state('')
  let summary = $state('')
  let status = $state('active')
  let progressMode = $state('automatic')
  let manualProgress = $state(0)
  let taskTitle = $state('')

  $effect(() => {
    if (!project) return
    title = project.title
    summary = project.summary
    status = project.status
    progressMode = project.progressMode
    manualProgress = project.manualProgress ?? 0
  })

  function saveProject() {
    if (!project || !title.trim()) return
    updateProject(project.id, {
      title,
      summary,
      status,
      progressMode,
      manualProgress: progressMode === 'manual' ? Number(manualProgress) : null,
    })
    toast(t('toast.projectSaved'), 'success')
  }

  function addTask() {
    if (!project || !taskTitle.trim()) return
    createTask({
      title: taskTitle.trim(),
      projectId: project.id,
      listId: S.settings.defaultListId || SYSTEM_LIST_INBOX,
      dueDate: null,
    })
    taskTitle = ''
    toast(t('toast.projectTaskAdded'), 'success')
  }

  /** @param {import('$lib/types.js').ProjectStatus} nextStatus */
  function changeStatus(nextStatus) {
    if (!project) return
    setProjectStatus(project.id, nextStatus)
    status = nextStatus
    toast(t('toast.projectSaved'), 'success')
  }

  async function removeProject() {
    if (!project) return
    if (!confirm(t('projects.deleteConfirm'))) return
    deleteProject(project.id)
    toast(t('toast.projectDeleted'))
    await goto('/projects')
  }
</script>

<AppBar
  title={project?.title ?? t('projects.title')}
  subtitle={project ? t(`projects.status_${project.status}`) : ''}
  backHref="/projects"
/>

<div class="wrap project-detail-page">
  {#if project}
    <section class="project-summary">
      <div>
        <p class="project-kicker">{t('projects.next')}</p>
        <p class="project-next">{nextTask?.title ?? t('projects.noNextTask')}</p>
      </div>
      <div class="project-stats" aria-label={t('projects.stats')}>
        <span>{t('projects.openCount', { count: openTasks.length })}</span>
        <span>{t('projects.doneCount', { count: doneTasks.length })}</span>
      </div>
    </section>

    <form
      class="project-editor"
      onsubmit={(e) => {
        e.preventDefault()
        saveProject()
      }}
    >
      <div class="field">
        <label for="project-title">{t('projects.fieldTitle')}</label>
        <input id="project-title" bind:value={title} />
      </div>
      <div class="field">
        <label for="project-summary">{t('projects.fieldSummary')}</label>
        <textarea id="project-summary" rows="3" bind:value={summary}></textarea>
      </div>
      <div class="project-editor-grid">
        <div class="field">
          <label for="project-status">{t('projects.fieldStatus')}</label>
          <select id="project-status" bind:value={status}>
            <option value="active">{t('projects.status_active')}</option>
            <option value="paused">{t('projects.status_paused')}</option>
            <option value="shipped">{t('projects.status_shipped')}</option>
            <option value="archived">{t('projects.status_archived')}</option>
          </select>
        </div>
        <div class="field">
          <label for="project-progress-mode">{t('projects.fieldProgress')}</label>
          <select id="project-progress-mode" bind:value={progressMode}>
            <option value="automatic">{t('projects.progressAutomatic')}</option>
            <option value="manual">{t('projects.progressManual')}</option>
          </select>
        </div>
        {#if progressMode === 'manual'}
          <div class="field">
            <label for="project-manual-progress">{t('projects.fieldManualProgress')}</label>
            <input
              id="project-manual-progress"
              type="number"
              min="0"
              max="100"
              bind:value={manualProgress}
            />
          </div>
        {/if}
      </div>
      <div class="project-actions">
        <button type="submit" class="btn-primary" disabled={!title.trim()}>
          {t('common.save')}
        </button>
        {#if project.status !== 'paused'}
          <button type="button" class="btn-secondary" onclick={() => changeStatus('paused')}>
            {t('projects.pause')}
          </button>
        {/if}
        {#if project.status !== 'active'}
          <button type="button" class="btn-secondary" onclick={() => changeStatus('active')}>
            {t('projects.resume')}
          </button>
        {/if}
        <button type="button" class="btn-secondary" onclick={() => changeStatus('shipped')}>
          {t('projects.ship')}
        </button>
        <button type="button" class="btn-secondary" onclick={() => changeStatus('archived')}>
          {t('projects.archive')}
        </button>
        <button type="button" class="btn-danger" onclick={removeProject}>
          {t('common.delete')}
        </button>
      </div>
    </form>

    <form
      class="project-task-add"
      onsubmit={(e) => {
        e.preventDefault()
        addTask()
      }}
    >
      <input
        bind:value={taskTitle}
        placeholder={t('projects.addTaskPlaceholder')}
        aria-label={t('projects.addTaskPlaceholder')}
      />
      <button type="submit" class="btn-primary" disabled={!taskTitle.trim()}>
        <Icon name="plus" size={17} strokeWidth={2} />
        <span>{t('common.addTask')}</span>
      </button>
    </form>

    <TaskGroup
      title={t('projects.openTasks')}
      tasks={openTasks}
      compactRows
      empty={t('projects.noOpenTasks')}
      onToggle={completeTask}
      onEdit={editTask}
    />

    {#if doneTasks.length}
      <TaskGroup
        title={t('projects.completedTasks')}
        tasks={doneTasks}
        compactRows
        collapsible
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
  {:else}
    <EmptyState message={t('projects.notFound')} />
  {/if}
</div>

<style>
  .project-detail-page {
    display: flex;
    flex-direction: column;
    gap: var(--stack-section);
  }

  .project-summary {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .project-kicker {
    margin: 0 0 var(--space-1);
    color: var(--t3);
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .project-next {
    margin: 0;
    color: var(--t1);
    font-size: var(--text-lg);
    font-weight: 650;
    line-height: 1.3;
  }

  .project-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-content: flex-start;
    gap: var(--space-1);
    min-width: 150px;
  }

  .project-stats span {
    padding: 4px 9px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--surface-2, var(--bg-2)) 90%, transparent);
    color: var(--t2);
    font-size: var(--text-xs);
    font-weight: 650;
  }

  .project-editor,
  .project-task-add {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .project-editor-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .project-editor :global(.field),
  .project-editor .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .project-editor label {
    color: var(--t2);
    font-size: var(--text-xs);
    font-weight: 650;
  }

  .project-editor input,
  .project-editor select,
  .project-editor textarea,
  .project-task-add input {
    width: 100%;
    min-width: 0;
    border-radius: var(--control-radius);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    padding: 0 var(--btn-pad-x-md);
  }

  .project-editor input,
  .project-editor select,
  .project-task-add input {
    height: var(--control-h);
  }

  .project-editor textarea {
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
    resize: vertical;
  }

  .project-editor input:focus,
  .project-editor select:focus,
  .project-editor textarea:focus,
  .project-task-add input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-bg);
  }

  .project-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .project-task-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .project-task-add .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
  }

  .project-task-add .btn-primary:disabled,
  .project-editor .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (--life-os-mobile) {
    .project-summary {
      flex-direction: column;
    }

    .project-stats {
      justify-content: flex-start;
      min-width: 0;
    }

    .project-editor-grid,
    .project-task-add {
      grid-template-columns: 1fr;
    }

    .project-actions > button,
    .project-task-add .btn-primary {
      width: 100%;
      justify-content: center;
    }
  }
</style>
