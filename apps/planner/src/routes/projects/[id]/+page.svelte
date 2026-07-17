<script>
  import { untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import TaskGroup from '$lib/components/TaskGroup.svelte'
  import QuickAddBar from '$lib/components/QuickAddBar.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import AttachmentList from '$lib/components/attachments/AttachmentList.svelte'
  import AttachmentUploader from '$lib/components/attachments/AttachmentUploader.svelte'
  import { S } from '$lib/state.svelte.js'
  import {
    deleteProject,
    getProjectById,
    projectNextTask,
    projectOpenTasks,
    safeProjectRefUrl,
    setProjectStatus,
    updateProject,
  } from '$lib/domain/projects.js'
  import { sortTasks } from '$lib/engine/prioritizer.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { t } from '$lib/i18n/index.js'
  import { toast } from '$lib/ui.svelte.js'
  import { PROJECT_CATEGORIES, categoryOf } from '$lib/domain/projectCategory.js'
  import { searchProjectKnowledge } from '$lib/services/knowledgeClient.js'

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
  let area = $state('') // '' = 自动(按名称/备注),否则为手选分类 id → 写 areaId

  $effect(() => {
    if (!project) return
    title = project.title
    summary = project.summary
    status = project.status
    progressMode = project.progressMode
    manualProgress = project.manualProgress ?? 0
    area = project.areaId ?? ''
  })

  // "自动"时鸟瞰图会落到的分类,给 select 的自动项做提示
  const autoCategory = $derived(
    project ? PROJECT_CATEGORIES.find((c) => c.id === categoryOf({ ...project, areaId: null })) : null,
  )

  // ── KnowledgeOS 联通:按项目名语义检索 Vault,拉该项目相关知识笔记 ──
  // 用 $derived.by 返回检索 promise + 模板 {#await} 渲染,避开 $effect+$state
  // 异步赋值的时序坑。依赖 projectId + S.projects.length(数据就绪信号);
  // untrack 读项目,避免云同步频繁重建 S.projects 触发重复检索。
  const knowledgePromise = $derived.by(() => {
    const id = projectId
    const ready = S.projects.length
    if (!id || !ready) return Promise.resolve([])
    const p = untrack(() => getProjectById(id))
    if (!p) return Promise.resolve([])
    const query = [p.title, p.summary].filter(Boolean).join(' ')
    return searchProjectKnowledge(query, { k: 4 })
  })

  function saveProject() {
    if (!project || !title.trim()) return
    updateProject(project.id, {
      title,
      summary,
      status,
      progressMode,
      manualProgress: progressMode === 'manual' ? Number(manualProgress) : null,
      areaId: area || null,
    })
    toast(t('toast.projectSaved'), 'success')
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

    {#if project.roadmapRefs.length || project.repoRefs.length}
      <section class="project-references" aria-labelledby="project-references-title">
        <div class="project-reference-heading">
          <div>
            <p class="project-kicker">{t('projects.context')}</p>
            <h2 id="project-references-title">{t('projects.references')}</h2>
          </div>
          <span>{t('projects.referenceCount', { count: project.roadmapRefs.length + project.repoRefs.length })}</span>
        </div>

        {#if project.roadmapRefs.length}
          <div class="project-reference-group">
            <h3>{t('projects.roadmapReferences')}</h3>
            <ul>
              {#each project.roadmapRefs as ref (ref.id)}
                <li class:reference-primary={ref.isPrimary}>
                  <div>
                    <strong>{ref.roadmapItemId}</strong>
                    <span>{ref.label || t('projects.roadmapReference')}</span>
                  </div>
                  <code>{ref.sourcePath}{ref.anchor ? `#${ref.anchor}` : ''}</code>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if project.repoRefs.length}
          <div class="project-reference-group">
            <h3>{t('projects.repositoryReferences')}</h3>
            <ul>
              {#each project.repoRefs as ref (ref.id)}
                {@const safeUrl = safeProjectRefUrl(ref.url)}
                <li>
                  <div>
                    <span class="reference-kind">{t(`projects.refKind_${ref.kind}`)}</span>
                    {#if safeUrl}
                      <a href={safeUrl} target="_blank" rel="noreferrer">{ref.label}</a>
                    {:else}
                      <strong>{ref.label}</strong>
                    {/if}
                  </div>
                  {#if !safeUrl}<code>{ref.url}</code>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>
    {/if}

    <form
      class="project-editor"
      onsubmit={(e) => {
        e.preventDefault()
        saveProject()
      }}
      onpaste={(e) => {
        const items = e.clipboardData?.items
        if (!items) return
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              e.preventDefault()
              import('$lib/services/attachmentService.js').then(({ uploadAttachment }) => {
                uploadAttachment('project', project.id, file, 'paste').catch((err) => {
                  toast(err.message, 'error')
                })
              })
              return
            }
          }
        }
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
          <label for="project-category">{t('projects.fieldCategory')}</label>
          <select id="project-category" bind:value={area}>
            <option value="">
              {t('projects.categoryAuto')}{autoCategory ? ` → ${t(autoCategory.labelKey)}` : ''}
            </option>
            {#each PROJECT_CATEGORIES as cat (cat.id)}
              <option value={cat.id}>{t(cat.labelKey)}</option>
            {/each}
          </select>
        </div>
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

      <div class="field" style="margin-top: var(--space-2)">
        <AttachmentList ownerType="project" ownerId={project.id} />
        <AttachmentUploader ownerType="project" ownerId={project.id} />
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

    {#await knowledgePromise then knowledgeItems}
      {#if knowledgeItems.length}
        <section class="project-knowledge">
          <div class="project-knowledge-head">
            <h2>{t('projects.knowledgeTitle')}</h2>
            <span class="tag">KnowledgeOS</span>
          </div>
          <div class="knowledge-list">
            {#each knowledgeItems as item, i (item.path + i)}
              <a
                class="knowledge-item"
                href={item.obsidianUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="knowledge-item-title">{item.title}</span>
                {#if item.breadcrumb}
                  <span class="knowledge-item-crumb">{item.breadcrumb}</span>
                {/if}
                {#if item.snippet}
                  <span class="knowledge-item-snippet">{item.snippet}</span>
                {/if}
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/await}

    <div class="project-task-add">
      <QuickAddBar
        projectId={project.id}
        dueDate={null}
        showOnMobile
        placeholder={t('projects.addTaskPlaceholder')}
        toastOnAdd={t('toast.projectTaskAdded')}
      />
    </div>

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

  /* KnowledgeOS 联通:项目相关的 Vault 知识笔记 */
  .project-knowledge {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .project-knowledge-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .project-knowledge-head h2 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--t2);
  }
  .knowledge-list {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }
  .knowledge-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--card-radius, 12px);
    background: var(--card);
    color: inherit;
    text-decoration: none;
    /* 网格项默认 min-width:auto → 不可断长串(fp: 哈希 / 文件名)会撑宽卡片溢出 */
    min-width: 0;
  }
  .knowledge-item:hover {
    border-color: var(--accent);
  }
  .knowledge-item-title {
    font-weight: 600;
    color: var(--t1);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .knowledge-item-crumb {
    font-size: var(--text-xs);
    color: var(--t3, var(--text-muted));
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .knowledge-item-snippet {
    font-size: var(--text-sm);
    color: var(--t2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-width: 0;
    /* 长哈希/URL 可在任意处断行,交给 line-clamp 收尾 */
    overflow-wrap: anywhere;
  }

  .project-references {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--card-radius);
    background: var(--card);
  }

  .project-reference-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .project-reference-heading h2,
  .project-reference-group h3 {
    margin: 0;
    color: var(--t1);
  }

  .project-reference-heading h2 {
    font-size: var(--text-lg);
  }

  .project-reference-heading > span,
  .reference-kind {
    color: var(--t3);
    font-size: var(--text-xs);
    font-weight: 650;
  }

  .project-reference-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .project-reference-group h3 {
    font-size: var(--text-sm);
  }

  .project-reference-group ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .project-reference-group li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--surface-2, var(--bg-2)) 88%, transparent);
  }

  .project-reference-group li.reference-primary {
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .project-reference-group li > div {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .project-reference-group a {
    color: var(--accent);
    font-weight: 650;
  }

  .project-reference-group code {
    overflow: hidden;
    max-width: 55%;
    color: var(--t3);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .project-editor textarea {
    width: 100%;
    min-width: 0;
    border-radius: var(--control-radius);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    padding: 0 var(--btn-pad-x-md);
  }

  .project-editor input,
  .project-editor select {
    height: var(--control-h);
  }

  .project-editor textarea {
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
    resize: vertical;
  }

  .project-editor input:focus,
  .project-editor select:focus,
  .project-editor textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-bg);
  }

  .project-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .project-editor .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (max-width: 839px) {
    .project-summary {
      flex-direction: column;
    }

    .project-stats {
      justify-content: flex-start;
      min-width: 0;
    }

    .project-editor-grid {
      grid-template-columns: 1fr;
    }

    .project-reference-group li {
      align-items: flex-start;
      flex-direction: column;
    }

    .project-reference-group code {
      max-width: 100%;
    }

    .project-actions > button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
