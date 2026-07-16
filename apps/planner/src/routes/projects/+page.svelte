<script>
  import AppBar from '$lib/components/AppBar.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { S } from '$lib/state.svelte.js'
  import {
    createProject,
    projectNextTask,
    projectOpenTasks,
    visibleProjects,
  } from '$lib/domain/projects.js'
  import { t } from '$lib/i18n/index.js'
  import { toast } from '$lib/ui.svelte.js'
  import { MindMap } from '@life-os/platform-web/svelte/charts'

  let title = $state('')
  let summary = $state('')

  const projects = $derived(visibleProjects())
  const activeProjects = $derived(projects.filter((project) => project.status === 'active'))

  // 项目鸟瞰:活跃项目 → 前 5 个未完成任务(长尾折进省略节点,点项目节点可折叠)
  const MAP_TASK_LIMIT = 5
  const projectTree = $derived({
    label: t('projects.title'),
    children: activeProjects.map((project) => {
      const open = projectOpenTasks(project)
      const children = open.slice(0, MAP_TASK_LIMIT).map((task) => ({ label: task.title }))
      if (open.length > MAP_TASK_LIMIT) {
        children.push({ label: `… +${open.length - MAP_TASK_LIMIT}` })
      }
      return { label: project.title, children }
    }),
  })
  const pausedProjects = $derived(projects.filter((project) => project.status === 'paused'))
  const shippedProjects = $derived(projects.filter((project) => project.status === 'shipped'))

  function submitProject() {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    createProject({ title: cleanTitle, summary: summary.trim() })
    title = ''
    summary = ''
    toast(t('toast.projectCreated'), 'success')
  }

  /** @param {import('$lib/types.js').PlannerProject} project */
  function projectMeta(project) {
    const openCount = projectOpenTasks(project).length
    const next = projectNextTask(project)
    return next
      ? t('projects.cardMetaWithNext', { count: openCount, title: next.title })
      : t('projects.cardMeta', { count: openCount })
  }
</script>

<AppBar title={t('projects.title')} subtitle={t('projects.subtitle')} />

<div class="wrap projects-page">
  <form
    class="project-create"
    onsubmit={(e) => {
      e.preventDefault()
      submitProject()
    }}
  >
    <div class="project-create-fields">
      <input
        bind:value={title}
        placeholder={t('projects.newTitlePlaceholder')}
        aria-label={t('projects.newTitlePlaceholder')}
      />
      <input
        bind:value={summary}
        placeholder={t('projects.newSummaryPlaceholder')}
        aria-label={t('projects.newSummaryPlaceholder')}
      />
    </div>
    <button type="submit" class="btn-primary" disabled={!title.trim()}>
      <Icon name="plus" size={17} strokeWidth={2} />
      <span>{t('projects.create')}</span>
    </button>
  </form>

  {#if activeProjects.length}
    <section class="project-section project-map">
      <h2>{t('projects.mapTitle')}</h2>
      <div class="project-map-card">
        <MindMap root={projectTree} ariaLabel={t('projects.mapTitle')} />
      </div>
    </section>
  {/if}

  {#if projects.length}
    {@render projectSection(t('projects.active'), activeProjects)}
    {@render projectSection(t('projects.paused'), pausedProjects)}
    {@render projectSection(t('projects.shipped'), shippedProjects)}
  {:else}
    <EmptyState message={t('projects.emptyTitle')} hint={t('projects.emptyHint')} />
  {/if}
</div>

{#snippet projectSection(sectionTitle, sectionProjects)}
  {#if sectionProjects.length}
    <section class="project-section">
      <h2>{sectionTitle}</h2>
      <div class="project-list">
        {#each sectionProjects as project (project.id)}
          <a class="project-row" href="/projects/{project.id}">
            <span class="project-status project-status--{project.status}" aria-hidden="true"></span>
            <span class="project-row-main">
              <span class="project-row-title">{project.title}</span>
              {#if project.summary}
                <span class="project-row-summary">{project.summary}</span>
              {/if}
              <span class="project-row-meta">{projectMeta(project)}</span>
            </span>
            <Icon name="chevron-right" size={18} strokeWidth={1.75} />
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

<style>
  .projects-page {
    display: flex;
    flex-direction: column;
    gap: var(--stack-section);
  }

  .project-create {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2-5);
    align-items: stretch;
  }

  .project-create-fields {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: var(--space-2);
    min-width: 0;
  }

  .project-create input {
    height: var(--control-h);
    min-width: 0;
    border-radius: var(--control-radius);
    border: 1px solid var(--border);
    background: var(--card);
    padding: 0 var(--btn-pad-x-md);
    color: var(--t1);
  }

  .project-create input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-bg);
  }

  .project-create .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
  }

  .project-create .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .project-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .project-section h2 {
    margin: 0;
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .project-map-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--card-radius, 12px);
    padding: var(--space-3);
  }

  .project-list {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
  }

  .project-row {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }

  .project-row:hover .project-row-title {
    color: var(--accent);
  }

  .project-status {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--t3);
  }

  .project-status--active {
    background: var(--accent);
  }

  .project-status--paused {
    background: #f5a623;
  }

  .project-status--shipped {
    background: #2e9d64;
  }

  .project-row-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .project-row-title {
    color: var(--t1);
    font-size: var(--text-base);
    font-weight: 650;
    line-height: 1.3;
  }

  .project-row-summary,
  .project-row-meta {
    color: var(--t2);
    font-size: var(--text-sm);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .project-row-meta {
    color: var(--t3);
    font-size: var(--text-xs);
  }

  @media (max-width: 839px) {
    .project-create {
      grid-template-columns: 1fr;
    }

    .project-create-fields {
      grid-template-columns: 1fr;
    }

    .project-create .btn-primary {
      width: 100%;
      min-height: var(--control-h);
    }
  }
</style>
