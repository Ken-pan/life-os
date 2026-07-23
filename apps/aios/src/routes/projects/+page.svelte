<script>
  import { onMount } from 'svelte'
  import { buildCockpitModel, isProjectSpineWriterEnabled } from '$lib/kenos/projectSpine.core.js'
  import {
    completePlanTask,
    createPlanTaskInProject,
    executeProjectSpineAction,
    loadProjectSpineData,
  } from '$lib/kenos/projectSpine.host.js'
  import { knowledgeNoteUrl } from '@life-os/platform-web/wikilinks'

  let loading = $state(true)
  let error = $state('')
  let busy = $state('')
  let raw = $state(null)
  let selectedId = $state('')
  let showAll = $state(false)

  // edit states
  let editingOutcome = $state(false)
  let outcomeDraft = $state('')
  let statusDraft = $state('active')
  let contextTypeDraft = $state('development')
  let reviewDraft = $state('')
  let newTaskTitle = $state('')
  let linkNoteTitle = $state('')
  let linkUrl = $state('')

  const writerOn = isProjectSpineWriterEnabled()
  const KNOWLEDGE_ORIGIN = 'https://library.kenos.space'

  const cockpit = $derived(raw ? buildCockpitModel(raw) : { projects: [] })
  const spineProjects = $derived(cockpit.projects.filter((p) => p.hasContext))
  const otherProjects = $derived(cockpit.projects.filter((p) => !p.hasContext))
  const selected = $derived(cockpit.projects.find((p) => p.id === selectedId) || spineProjects[0] || null)

  async function reload() {
    loading = true
    error = ''
    try {
      raw = await loadProjectSpineData()
    } catch (e) {
      error = String(e?.message || e)
    } finally {
      loading = false
    }
  }

  onMount(reload)

  async function run(label, fn) {
    if (busy) return
    busy = label
    error = ''
    try {
      await fn()
      await reload()
    } catch (e) {
      error = String(e?.message || e)
    } finally {
      busy = ''
    }
  }

  function startEditOutcome() {
    if (!selected) return
    outcomeDraft = selected.outcome
    statusDraft = selected.status || 'active'
    contextTypeDraft = selected.contextType || 'development'
    reviewDraft = selected.reviewAt || ''
    editingOutcome = true
  }

  function saveContext() {
    const projectId = selected?.id
    if (!projectId) return
    void run('context', async () => {
      await executeProjectSpineAction('project.set_context', {
        projectId,
        outcome: outcomeDraft.trim(),
        status: statusDraft,
        contextType: contextTypeDraft,
        reviewAt: reviewDraft || null,
      })
      editingOutcome = false
    })
  }

  function adoptProject(projectId) {
    void run('adopt', () =>
      executeProjectSpineAction('project.set_context', { projectId, status: 'active' }),
    )
  }

  function setNextAction(taskId) {
    const projectId = selected?.id
    if (!projectId) return
    void run('next', () =>
      executeProjectSpineAction('project.set_next_action', { projectId, taskId }),
    )
  }

  function completeNextAction() {
    const task = selected?.nextAction
    if (!task) return
    void run('complete', () => completePlanTask(task.taskId, true))
  }

  function addTask() {
    const projectId = selected?.id
    const title = newTaskTitle.trim()
    if (!projectId || !title) return
    void run('task', async () => {
      await createPlanTaskInProject(projectId, title)
      newTaskTitle = ''
    })
  }

  function addNoteLink() {
    const projectId = selected?.id
    const title = linkNoteTitle.trim()
    if (!projectId || !title) return
    void run('note', async () => {
      await executeProjectSpineAction('project.link_object', {
        projectId,
        sourceDomain: 'knowledge',
        objectType: 'knowledge.note',
        objectId: title,
        relation: 'reference',
        displayMetadata: { title },
      })
      linkNoteTitle = ''
    })
  }

  function addUrlLink() {
    const projectId = selected?.id
    const url = linkUrl.trim()
    if (!projectId || !url || !/^https?:\/\//.test(url)) return
    void run('url', async () => {
      await executeProjectSpineAction('project.link_object', {
        projectId,
        sourceDomain: 'external',
        objectType: 'url',
        objectId: url,
        relation: 'reference',
        displayMetadata: { title: url.replace(/^https?:\/\//, '').slice(0, 60) },
      })
      linkUrl = ''
    })
  }

  function removeLink(linkId) {
    const projectId = selected?.id
    if (!projectId || !linkId) return
    void run('unlink', () =>
      executeProjectSpineAction('project.unlink_object', { projectId, linkId }),
    )
  }

  const STATUS_LABEL = {
    active: '进行中',
    paused: '已暂停',
    waiting: '等待中',
    completed: '已完成',
    archived: '已归档',
  }
  const CONTEXT_LABEL = { personal: '个人', work: '工作', home: '家庭', development: '开发' }

  function fmtTime(iso) {
    const t = Date.parse(iso || '')
    if (!Number.isFinite(t)) return ''
    return new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const ACTIVITY_LABEL = {
    'plan.create_task': '创建任务',
    'plan.complete_task': '完成任务',
    'plan.reopen_task': '重开任务',
    'plan.archive_task': '归档任务',
    'plan.update_task_title': '修改任务标题',
    'plan.update_task_due_date': '调整截止日',
    'plan.update_task_schedule': '调整日程',
    'plan.update_task_project': '任务归属项目',
    'project.set_context': '更新项目目标',
    'project.set_next_action': '设定下一步',
    'project.link_object': '关联对象',
    'project.unlink_object': '移除关联',
    'approval.request': '发起审批',
    'approval.decide': '审批决定',
  }
</script>

<svelte:head><title>Projects · Kenos</title></svelte:head>

<div class="spine-page" data-domain="plan">
  <header class="spine-header">
    <div>
      <p class="kicker"><a href="/spaces">Spaces</a> · Projects</p>
      <h1>Project Cockpit</h1>
      <p class="intro">
        真源不迁移:项目=Planner,任务=Planner,笔记=Vault。这里只做编排:目标、下一步、关联与回顾。
      </p>
    </div>
    <div class="spine-header-actions">
      <a class="quiet" href="/">Today</a>
      <button type="button" class="quiet" onclick={reload} disabled={loading}>刷新</button>
    </div>
  </header>

  {#if !writerOn}
    <p class="spine-banner">
      只读模式:写入需 VITE_KENOS_PROD_WRITES=1 + VITE_KENOS_PROJECT_SPINE_WRITER=1(canary flag,Owner gate)。
    </p>
  {/if}
  {#if error}<p class="spine-error">{error}</p>{/if}

  {#if loading}
    <p class="spine-loading">读取项目脊柱…</p>
  {:else}
    <div class="spine-layout">
      <nav class="spine-list" aria-label="项目列表">
        {#each spineProjects as p (p.id)}
          <button
            type="button"
            class="spine-item"
            class:selected={selected?.id === p.id}
            onclick={() => { selectedId = p.id; editingOutcome = false }}
          >
            <span class="spine-item-title">{p.title}</span>
            <span class="spine-item-meta">
              <span class="pill pill-{p.status}">{STATUS_LABEL[p.status] || p.status}</span>
              {#if p.contextType}<span class="pill">{CONTEXT_LABEL[p.contextType]}</span>{/if}
              {#if p.nextAction && !p.nextAction.completed}<span class="dot" title="有下一步"></span>{/if}
            </span>
          </button>
        {/each}
        <details class="spine-others" open={showAll}>
          <summary onclick={(e) => { e.preventDefault(); showAll = !showAll }}>
            其他 Planner 项目({otherProjects.length})
          </summary>
          {#if showAll}
            {#each otherProjects as p (p.id)}
              <div class="spine-item spine-item-plain">
                <span class="spine-item-title">{p.title}</span>
                {#if writerOn}
                  <button type="button" class="quiet small" onclick={() => adoptProject(p.id)} disabled={!!busy}>
                    接入脊柱
                  </button>
                {/if}
              </div>
            {/each}
          {/if}
        </details>
      </nav>

      {#if selected}
        <section class="spine-detail" aria-label={selected.title}>
          <div class="spine-title-row">
            <h2>{selected.title}</h2>
            <span class="pill pill-{selected.status}">{STATUS_LABEL[selected.status] || selected.status}</span>
            {#if selected.reviewAt}<span class="pill">回顾 {selected.reviewAt}</span>{/if}
          </div>

          <div class="spine-block">
            <div class="spine-block-head">
              <h3>Outcome</h3>
              {#if writerOn && !editingOutcome}
                <button type="button" class="quiet small" onclick={startEditOutcome}>编辑</button>
              {/if}
            </div>
            {#if editingOutcome}
              <textarea rows="2" bind:value={outcomeDraft} placeholder="这个项目完成时,世界有什么不同?"></textarea>
              <div class="spine-form-row">
                <label>状态
                  <select bind:value={statusDraft}>
                    {#each Object.entries(STATUS_LABEL) as [value, label]}<option {value}>{label}</option>{/each}
                  </select>
                </label>
                <label>类型
                  <select bind:value={contextTypeDraft}>
                    {#each Object.entries(CONTEXT_LABEL) as [value, label]}<option {value}>{label}</option>{/each}
                  </select>
                </label>
                <label>回顾日 <input type="date" bind:value={reviewDraft} /></label>
                <button type="button" class="primary small" onclick={saveContext} disabled={!!busy}>保存</button>
                <button type="button" class="quiet small" onclick={() => (editingOutcome = false)}>取消</button>
              </div>
            {:else}
              <p class="spine-outcome">{selected.outcome || '(还没有写下 outcome)'}</p>
            {/if}
          </div>

          <div class="spine-block spine-next">
            <div class="spine-block-head"><h3>Next Action</h3></div>
            {#if selected.nextAction}
              <div class="spine-next-row" class:done={selected.nextAction.completed}>
                <span>{selected.nextAction.title}</span>
                {#if selected.nextAction.dueDate}<span class="pill">{selected.nextAction.dueDate}</span>{/if}
                {#if writerOn && !selected.nextAction.completed}
                  <button type="button" class="primary small" onclick={completeNextAction} disabled={!!busy}>完成</button>
                  <a class="quiet small" href="/focus">开始 Focus</a>
                {/if}
                {#if selected.nextAction.completed}
                  <span class="pill">已完成 — 选一个新的下一步</span>
                {/if}
              </div>
            {:else}
              <p class="spine-empty">未设定。从下面任务里选一个作为下一步。</p>
            {/if}
          </div>

          <div class="spine-block">
            <div class="spine-block-head"><h3>Tasks({selected.openTasks.length} 开放)</h3></div>
            <ul class="spine-tasks">
              {#each selected.openTasks.slice(0, 12) as task (task.id)}
                <li>
                  <span>{task.title}</span>
                  {#if writerOn && selected.nextAction?.taskId !== task.id}
                    <button type="button" class="quiet small" onclick={() => setNextAction(task.id)} disabled={!!busy}>
                      设为下一步
                    </button>
                  {:else if selected.nextAction?.taskId === task.id}
                    <span class="pill">下一步</span>
                  {/if}
                </li>
              {/each}
              {#if !selected.openTasks.length}<li class="spine-empty">没有开放任务</li>{/if}
            </ul>
            {#if writerOn}
              <div class="spine-form-row">
                <input
                  type="text"
                  bind:value={newTaskTitle}
                  placeholder="新任务标题(写入 Planner)"
                  onkeydown={(e) => e.key === 'Enter' && addTask()}
                />
                <button type="button" class="quiet small" onclick={addTask} disabled={!!busy || !newTaskTitle.trim()}>
                  创建任务
                </button>
              </div>
            {/if}
          </div>

          <div class="spine-block">
            <div class="spine-block-head"><h3>Notes & Links</h3></div>
            <ul class="spine-links">
              {#each selected.noteLinks as link (link.id)}
                <li>
                  <a href={knowledgeNoteUrl(link.object_id, KNOWLEDGE_ORIGIN)} target="_blank" rel="noreferrer">
                    [[{link.display_metadata?.title || link.object_id}]]
                  </a>
                  {#if writerOn}<button type="button" class="quiet small" onclick={() => removeLink(link.id)}>移除</button>{/if}
                </li>
              {/each}
              {#each selected.urlLinks as link (link.id)}
                <li>
                  <a href={link.object_id} target="_blank" rel="noreferrer">{link.display_metadata?.title || link.object_id}</a>
                  {#if writerOn}<button type="button" class="quiet small" onclick={() => removeLink(link.id)}>移除</button>{/if}
                </li>
              {/each}
              {#if !selected.noteLinks.length && !selected.urlLinks.length}
                <li class="spine-empty">还没有关联笔记或链接</li>
              {/if}
            </ul>
            {#if writerOn}
              <div class="spine-form-row">
                <input type="text" bind:value={linkNoteTitle} placeholder="Vault 笔记标题(只存引用)" onkeydown={(e) => e.key === 'Enter' && addNoteLink()} />
                <button type="button" class="quiet small" onclick={addNoteLink} disabled={!!busy || !linkNoteTitle.trim()}>关联笔记</button>
              </div>
              <div class="spine-form-row">
                <input type="url" bind:value={linkUrl} placeholder="https:// 外部链接" onkeydown={(e) => e.key === 'Enter' && addUrlLink()} />
                <button type="button" class="quiet small" onclick={addUrlLink} disabled={!!busy || !linkUrl.trim()}>关联 URL</button>
              </div>
            {/if}
          </div>

          {#if selected.waiting.length}
            <div class="spine-block">
              <div class="spine-block-head"><h3>Waiting</h3></div>
              <ul class="spine-links">
                {#each selected.waiting as link (link.id)}
                  <li>
                    <span>{link.display_metadata?.title || link.object_id}</span>
                    {#if writerOn}<button type="button" class="quiet small" onclick={() => removeLink(link.id)}>解除</button>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if selected.decisions.length}
            <div class="spine-block">
              <div class="spine-block-head"><h3>Decisions</h3></div>
              <ul class="spine-activity">
                {#each selected.decisions.slice(0, 6) as row}
                  <li><span>{ACTIVITY_LABEL[row.action_type] || row.action_type}</span><time>{fmtTime(row.created_at)}</time></li>
                {/each}
              </ul>
            </div>
          {/if}

          <div class="spine-block">
            <div class="spine-block-head"><h3>Recent Activity</h3></div>
            <ul class="spine-activity">
              {#each selected.recentActivity as row}
                <li>
                  <span>{ACTIVITY_LABEL[row.action_type] || row.action_type}{row.summary ? ` · ${row.summary}` : ''}</span>
                  <time>{fmtTime(row.created_at)}</time>
                </li>
              {/each}
              {#if !selected.recentActivity.length}<li class="spine-empty">还没有活动记录</li>{/if}
            </ul>
          </div>
        </section>
      {:else}
        <section class="spine-detail">
          <p class="spine-empty">左侧还没有接入脊柱的项目。展开「其他 Planner 项目」选择一个接入。</p>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .spine-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px 20px 80px;
  }
  .spine-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  .spine-header h1 {
    margin: 2px 0 6px;
    font-size: 1.5rem;
  }
  .kicker {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.7;
  }
  .intro {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.75;
    max-width: 46em;
  }
  .spine-header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .spine-banner {
    padding: 8px 12px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--accent) 12%, transparent);
    font-size: 0.82rem;
  }
  .spine-error {
    padding: 8px 12px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--accent-2) 14%, transparent);
    font-size: 0.85rem;
  }
  .spine-loading,
  .spine-empty {
    opacity: 0.6;
    font-size: 0.88rem;
  }
  .spine-layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 20px;
  }
  @media (max-width: 760px) {
    .spine-layout {
      grid-template-columns: 1fr;
    }
  }
  .spine-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .spine-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid color-mix(in oklab, currentColor 12%, transparent);
    background: transparent;
    cursor: pointer;
    min-width: 0;
  }
  .spine-item.selected {
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    border-color: color-mix(in oklab, var(--accent) 40%, transparent);
  }
  .spine-item-plain {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    cursor: default;
  }
  .spine-item-title {
    font-weight: 600;
    font-size: 0.92rem;
    overflow-wrap: anywhere;
  }
  .spine-item-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .spine-others summary {
    font-size: 0.82rem;
    opacity: 0.7;
    cursor: pointer;
    padding: 8px 4px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 8%, transparent);
    white-space: nowrap;
  }
  .pill-active { background: color-mix(in oklab, var(--accent) 16%, transparent); }
  .pill-waiting { background: color-mix(in oklab, var(--accent-2) 18%, transparent); }
  .pill-paused { background: color-mix(in oklab, currentColor 12%, transparent); }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .spine-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .spine-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .spine-title-row h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .spine-block {
    border: 1px solid color-mix(in oklab, currentColor 10%, transparent);
    border-radius: 14px;
    padding: 12px 14px;
  }
  .spine-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .spine-block-head h3 {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }
  .spine-outcome {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .spine-next-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .spine-next-row.done { opacity: 0.55; text-decoration: line-through; }
  .spine-tasks,
  .spine-links,
  .spine-activity {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .spine-tasks li,
  .spine-links li,
  .spine-activity li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.88rem;
    min-width: 0;
  }
  .spine-tasks li > span:first-child,
  .spine-links li > a,
  .spine-links li > span {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .spine-activity time {
    font-size: 0.75rem;
    opacity: 0.55;
    white-space: nowrap;
  }
  .spine-form-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .spine-form-row input[type='text'],
  .spine-form-row input[type='url'] {
    flex: 1 1 200px;
    min-width: 0;
  }
  .spine-form-row label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
  }
  textarea,
  input,
  select {
    font: inherit;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid color-mix(in oklab, currentColor 18%, transparent);
    background: transparent;
    color: inherit;
    width: 100%;
    box-sizing: border-box;
  }
  .spine-form-row input,
  .spine-form-row select {
    width: auto;
  }
  button.primary,
  button.quiet,
  a.quiet {
    font: inherit;
    border-radius: 10px;
    padding: 6px 12px;
    cursor: pointer;
    border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
    background: transparent;
    color: inherit;
    text-decoration: none;
  }
  button.primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
  }
  .small { font-size: 0.78rem; padding: 4px 10px; white-space: nowrap; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
