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
  import { buildTaskMetaLine } from '$lib/domain/taskMetaLine.js'
  import { editTask } from '$lib/taskUi.js'

  let title = $state('')
  let summary = $state('')

  const projects = $derived(visibleProjects())
  const activeProjects = $derived(projects.filter((project) => project.status === 'active'))

  // ── 鸟瞰图:全景(分类+项目两层直接展开) → 点项目聚焦看任务 ──
  // 分类按项目名/备注规则自动派生(零维护),areaId 若有则优先(未来 area UI 用)
  const CATEGORY_META = [
    { id: 'lifeos', label: 'Life OS 产品' },
    { id: 'portfolio', label: '作品集 / 产品' },
    { id: 'work', label: '工作 · Ingram' },
    { id: 'tools', label: '工具 / 插件' },
  ]
  // 明确归"作品集/产品"的(对外发布过、或作品集展示用的 side project)
  const PORTFOLIO_NAMES = new Set([
    'Broadser', 'AI Design Commons', 'SenseTime Hub', 'Landfiner',
    'CIWEI Job Board', 'Conference Visual', 'Animal Emoji',
    'NowLyrics', 'Ciwei-Group', 'portfolio2026', 'Context Helper', 'kens-toolbox',
  ])
  function categoryOf(p) {
    if (p.areaId && CATEGORY_META.some((c) => c.id === p.areaId)) return p.areaId
    if (/^Life OS|^PaperOS/.test(p.title)) return 'lifeos'
    if (/^Ingram/.test(p.title)) return 'work'
    if (PORTFOLIO_NAMES.has(p.title)) return 'portfolio'
    // 备注里有对外产品/作品集信号的,也归作品集
    if (/作品集|已发布|上架|Product Hunt|users|求职|平台|社区|视觉|动画/.test(p.summary || '')) {
      return 'portfolio'
    }
    return 'tools'
  }

  // 焦点:聚焦某项目看任务(为空 = 分类全景)
  let focusProjectId = $state(/** @type {string | null} */ (null))
  const focusProject = $derived(
    focusProjectId ? projects.find((p) => p.id === focusProjectId) ?? null : null,
  )

  // 任务节点说明:备注优先,其次(有日期时)排期/截止元信息
  function taskNote(task) {
    const notes = task.notes?.trim()
    const meta = task.dueDate || task.scheduledStart ? buildTaskMetaLine(task, t) : ''
    return [notes, meta].filter(Boolean).join('\n') || undefined
  }

  // 任务级状态图标(ACTIVE 优先于 BLOCKED——备注常以自身状态开头)
  function taskStatusIcon(task) {
    if (task.completed) return '✅'
    const n = `${task.notes || ''} ${task.title || ''}`.toUpperCase()
    if (/ACTIVE|进行中|IN PROGRESS|DISCOVERY|复验/.test(n)) return '🟢'
    if (/BLOCKED|阻塞|受阻/.test(n)) return '🔴'
    if (/QUEUED|暂缓|PENDING|待做|待修|等 SYS|等待|待排/.test(n)) return '🟡'
    return '⚪'
  }

  // 项目级状态图标:已发布/受阻/待完善/进行中
  function projectStatusIcon(p) {
    if (p.status === 'shipped') return '✅'
    const s = `${p.summary || ''}`
    if (/BLOCKED|阻塞|受阻/i.test(s)) return '🔴'
    if (/待完善|待整理|PENDING|BACKLOG/i.test(s)) return '🟡'
    return '🟢'
  }

  // 全景:根 → 分类 → 该类项目(两层直接展开,一屏可见;点分类可折叠该类)
  const categoryTree = $derived({
    label: t('projects.title'),
    note: t('projects.mapRootNote', { count: activeProjects.length }),
    children: CATEGORY_META.map((cat) => {
      const ps = activeProjects.filter((p) => categoryOf(p) === cat.id)
      if (!ps.length) return null
      return {
        label: `${cat.label} · ${ps.length}`,
        data: { kind: 'category', id: cat.id },
        note: `${ps.length} 个项目`,
        children: ps.map((p) => {
          const open = projectOpenTasks(p)
          return {
            label: `${projectStatusIcon(p)} ${p.title}`,
            data: { kind: 'project', id: p.id },
            note: [p.summary?.trim(), open.length ? `${open.length} 个待办` : '暂无待办']
              .filter(Boolean)
              .join('\n'),
          }
        }),
      }
    }).filter(Boolean),
  })

  // 项目聚焦:项目 → 全部任务(带任务状态图标),未完成在前
  const projectTree = $derived.by(() => {
    const p = focusProject
    if (!p) return null
    const all = S.tasks.filter((tk) => tk.projectId === p.id && !tk.deletedAt)
    const open = all.filter((tk) => !tk.completed)
    const done = all.filter((tk) => tk.completed)
    return {
      label: `← ${p.title}`,
      data: { kind: 'back' },
      note: p.summary?.trim() || t('projects.mapBackHint'),
      children: [...open, ...done].map((task) => ({
        label: `${taskStatusIcon(task)} ${task.title}`,
        data: { kind: 'task', id: task.id },
        note: taskNote(task),
      })),
    }
  })

  const mapTree = $derived(focusProject ? projectTree : categoryTree)

  function onMapSelect(node) {
    const d = node.data
    if (!d) return
    if (d.kind === 'project') {
      focusProjectId = d.id
    } else if (d.kind === 'back') {
      focusProjectId = null
    } else if (d.kind === 'task') {
      const task = S.tasks.find((tk) => tk.id === d.id)
      if (task) editTask(task)
    }
    // kind 'category' 无操作:collapsible 会折叠/展开该类
  }
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
        <MindMap
          root={mapTree}
          height={520}
          collapsible={true}
          fitKey={focusProjectId ?? '__root__'}
          onSelect={onMapSelect}
          ariaLabel={t('projects.mapTitle')}
        />
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
