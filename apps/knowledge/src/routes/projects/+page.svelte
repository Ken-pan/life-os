<script>
  // 项目视图：自动感知所有项目笔记的现状（git 活动 + Planner 联动），
  // 漂移一键写回 frontmatter，可生成自动现状报告笔记。
  import { goto } from '$app/navigation'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { getLifeOsAppOrigin } from '@life-os/theme'
  import { S, updateItem, itemById } from '$lib/state.svelte.js'
  import { applyMetaPatch, itemFromFile } from '$lib/frontmatter.js'
  import { senseGitActivity, writeVaultFile } from '$lib/vault.js'
  import { CLOUD, fetchPlannerSnapshot } from '$lib/cloud.svelte.js'
  import {
    PROJECT_STATUSES,
    AI_REPORT_GENERATOR,
    isProjectItem,
    projectRecord,
    matchPlannerProject,
    plannerTaskStats,
    parseAiSuggestions,
    parseGitHeadLog,
    senseProject,
    todayYmd,
    buildStatusReport,
  } from '$lib/projects.js'
  import { t } from '$lib/i18n/index.js'

  /** 打开项目笔记 = 跳到工作台并选中。 */
  const openNote = (id) => { const it = itemById(id); if (it) goto(`/library?note=${encodeURIComponent(it.id)}`) }

  const REPORT_REL = 'Personal Project/📡 项目现状（自动）.md'
  const now = Date.now()

  let gitMap = $state(new Map())
  let gitSensing = $state(false)
  let planner = $state(null)
  let plannerErr = $state('')
  let appliedMsg = $state('')
  let reportMsg = $state('')

  let gitSensed = false
  $effect(() => {
    if (!S.vaultReady || gitSensed) return
    const paths = [
      ...new Set(
        S.items.filter(isProjectItem).map((i) => i._meta?.path).filter(Boolean),
      ),
    ]
    if (!paths.length) return
    gitSensed = true
    gitSensing = true
    senseGitActivity(paths, parseGitHeadLog)
      .then((m) => (gitMap = m))
      .finally(() => (gitSensing = false))
  })

  let plannerTried = false
  $effect(() => {
    if (!CLOUD.ready || !CLOUD.user || plannerTried) return
    plannerTried = true
    fetchPlannerSnapshot()
      .then((snap) => (planner = snap))
      .catch((e) => (plannerErr = e.message))
  })

  const records = $derived(
    S.items.filter(isProjectItem).map(projectRecord),
  )
  const taskStats = $derived(planner ? plannerTaskStats(planner.tasks, { now }) : null)
  // AI 巡检建议队列（local-ai 每晚 nightly 写的笔记，见 project_status.py）
  const aiSuggestions = $derived.by(() => {
    const report = S.items.find((i) => i._meta?.generated_by === AI_REPORT_GENERATOR)
    return report ? parseAiSuggestions(report.body) : new Map()
  })
  const rows = $derived(
    records.map((record) => {
      const plannerProject = planner
        ? matchPlannerProject(record, planner.projects)
        : null
      const stats =
        plannerProject && taskStats
          ? (taskStats.get(plannerProject.id) ?? { open: 0, done: 0, doneRecently: 0 })
          : null
      const sense = senseProject(record, {
        planner: plannerProject,
        stats,
        ai: aiSuggestions.get(record.title) ?? null,
        lastCommitAt: gitMap.get(record.path) ?? 0,
        now,
      })
      return { record, sense, plannerProject, stats }
    }),
  )
  const drifted = $derived(rows.filter((r) => r.sense.drift))

  const STATUS_LABEL_KEY = {
    active: 'statusActive',
    paused: 'statusPaused',
    completed: 'statusCompleted',
    archived: 'statusArchived',
    reference: 'statusReference',
    unknown: 'statusUnknown',
  }
  const statusLabel = (s) => t(`projects.${STATUS_LABEL_KEY[s ?? 'unknown']}`)

  const COLUMN_ORDER = ['active', 'paused', 'unknown', 'completed', 'archived', 'reference']
  const columns = $derived.by(() => {
    const buckets = new Map(COLUMN_ORDER.map((s) => [s, []]))
    for (const row of rows) {
      const key = PROJECT_STATUSES.includes(row.record.status)
        ? row.record.status
        : 'unknown'
      buckets.get(key).push(row)
    }
    for (const list of buckets.values())
      list.sort((a, b) => b.record.updatedAt - a.record.updatedAt)
    return COLUMN_ORDER.filter((s) => buckets.get(s).length).map((s) => ({
      status: s,
      rows: buckets.get(s),
    }))
  })
  // 状态分布环（项目 > 1 时点缀在工具栏旁）
  const statusDonut = $derived(
    columns.map((c) => ({ label: statusLabel(c.status), value: c.rows.length })),
  )

  function gitLabel(ts) {
    if (!ts) return t('projects.gitNone')
    const days = Math.floor((now - ts) / 86400000)
    return days <= 0 ? t('projects.gitToday') : t('projects.gitAgo', { days })
  }

  function applyOne(row) {
    const item = itemById(row.record.id)
    if (!item || !row.sense.suggested) return false
    applyMetaPatch(item, {
      status: row.sense.suggested,
      last_updated: todayYmd(),
    })
    updateItem(item.id, {})
    return true
  }

  function applyAll() {
    const list = [...drifted]
    let n = 0
    for (const row of list) if (applyOne(row)) n += 1
    appliedMsg = t('projects.applied', { count: n })
  }

  async function generateReport() {
    const content = buildStatusReport(rows)
    await writeVaultFile(REPORT_REL, content)
    // 内存同步：已有则原位替换，否则插入（下次冷启动照常从磁盘加载）
    const fresh = itemFromFile(REPORT_REL, content, null)
    const idx = S.items.findIndex((i) => i.id === REPORT_REL)
    if (idx >= 0) S.items[idx] = { ...fresh, createdAt: S.items[idx].createdAt }
    else S.items.unshift(fresh)
    reportMsg = t('projects.reportDone', { path: REPORT_REL })
  }

  const plannerOrigin = getLifeOsAppOrigin('planner')
</script>

<div class="wrap">
  {#if records.length === 0}
    <div class="settings-block">
      <EmptyState title={t('projects.emptyTitle')} description={t('projects.emptyDesc')} />
    </div>
  {:else}
    <section class="proj-toolbar">
      <div class="proj-drift">
        {#if gitSensing}
          <span class="proj-muted">{t('projects.sensing')}</span>
        {:else if drifted.length > 0}
          <strong>{t('projects.driftTitle')} · {drifted.length}</strong>
          <span class="proj-muted">{t('projects.driftDesc')}</span>
        {:else}
          <span class="proj-muted">{t('projects.noDrift')}</span>
        {/if}
      </div>
      <div class="proj-actions">
        {#if drifted.length > 0}
          <button type="button" class="btn-primary" onclick={applyAll}>
            {t('projects.applyAll', { count: drifted.length })}
          </button>
        {/if}
        {#if S.backend === 'vault'}
          <button type="button" class="btn-secondary" onclick={generateReport}>
            {t('projects.report')}
          </button>
        {/if}
      </div>
      {#if appliedMsg}
        <p class="proj-note"><span class="badge badge--success">{appliedMsg}</span></p>
      {/if}
      {#if reportMsg}
        <p class="proj-note"><span class="badge badge--success">{reportMsg}</span></p>
      {/if}
      {#if !CLOUD.user && CLOUD.ready}
        <p class="proj-note proj-muted">{t('projects.plannerOffline')}</p>
      {:else if plannerErr}
        <p class="proj-note"><span class="badge badge--danger">{t('projects.plannerError', { message: plannerErr })}</span></p>
      {/if}
    </section>

    {#if rows.length > 1}
      <div class="proj-status-strip" aria-label={t('projects.statusTitle')}>
        {#each statusDonut as s (s.label)}
          <span class="proj-status-pill">
            <strong>{s.value}</strong> {s.label}
          </span>
        {/each}
      </div>
    {/if}

    {#each columns as col (col.status)}
      <section class="proj-col">
        <h2 class="proj-col__title">
          <span class="proj-col__dot" data-status={col.status}></span>
          {statusLabel(col.status)}
          <span class="proj-col__count">{col.rows.length}</span>
        </h2>
        <div class="proj-grid">
          {#each col.rows as row (row.record.id)}
            <article class="proj-card" data-status={col.status}>
              <button
                type="button"
                class="proj-card__title"
                onclick={() => openNote(row.record.id)}
                title={t('projects.openNote')}
              >
                {row.record.title}
              </button>
              <div class="proj-card__meta">
                <span class="proj-status-label">{statusLabel(col.status)}</span>
                {#if row.stats}
                  <span class="proj-fact">
                    {t('projects.plannerTasks', { open: row.stats.open, done: row.stats.done })}
                  </span>
                {/if}
                {#if row.record.path && S.backend === 'vault'}
                  <span class="proj-fact">{gitLabel(row.sense.lastCommitAt)}</span>
                {/if}
                {#if row.plannerProject}
                  <span class="proj-fact">
                    {t('projects.plannerStatus', { status: row.plannerProject.status })}
                  </span>
                  <a
                    class="proj-link"
                    href={`${plannerOrigin}/projects/${row.plannerProject.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('projects.openInPlanner')} ↗
                  </a>
                {/if}
                {#if row.record.lastUpdated}
                  <span class="proj-fact proj-muted">{t('projects.lastUpdated', { date: row.record.lastUpdated })}</span>
                {/if}
                <span class="proj-fact proj-next">
                  {row.sense.reasons?.[0] || t('projects.nextHint')}
                </span>
              </div>
              {#if row.sense.drift}
                <div class="proj-suggest">
                  <span class="badge badge--accent">
                    {t('projects.suggest', { status: statusLabel(row.sense.suggested) })}
                  </span>
                  {#if row.sense.reasons.length}
                    <span class="proj-muted">{row.sense.reasons.join('；')}</span>
                  {/if}
                  <button type="button" class="btn-secondary proj-apply" onclick={() => applyOne(row)}>
                    {t('projects.apply')}
                  </button>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

<style>
  .proj-toolbar {
    display: grid;
    gap: var(--space-2, 8px);
    margin-block: var(--space-4, 16px);
    padding: var(--space-4, 16px);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
  }
  .proj-drift {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
    align-items: baseline;
  }
  .proj-actions {
    display: flex;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
  }
  .proj-note {
    margin: 0;
    font-size: var(--text-sm);
  }
  .proj-muted {
    color: var(--t3, var(--text-muted));
    font-size: var(--text-sm);
  }
  .proj-status-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-end: var(--space-3, 12px);
  }
  .proj-status-pill {
    font-size: var(--kn-meta, 12px);
    color: var(--t2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 999px);
    padding: 4px 10px;
  }
  .proj-status-pill strong {
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .proj-col {
    margin-block-end: var(--space-5, 20px);
  }
  .proj-col__title {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: var(--kn-section, 17px);
    margin-block: var(--space-3, 12px);
  }
  .proj-col__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--t3);
    flex: 0 0 auto;
  }
  .proj-col__dot[data-status='active'] { background: var(--chart-series-3, #248e4c); }
  .proj-col__dot[data-status='paused'] { background: var(--chart-series-4, #8f6b00); }
  .proj-col__dot[data-status='completed'] { background: var(--chart-series-1, #5a65d9); }
  .proj-col__dot[data-status='archived'],
  .proj-col__dot[data-status='reference'] { background: var(--t4); }
  .proj-col__count {
    color: var(--t3, var(--text-muted));
    font-family: var(--mono);
    font-size: var(--kn-meta, 12px);
  }
  .proj-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-3, 12px);
  }
  .proj-card {
    display: grid;
    gap: var(--space-2, 8px);
    align-content: start;
    padding: var(--space-4, 16px);
    background: var(--card);
    border: 1px solid var(--border);
    border-inline-start: 3px solid var(--border-l, var(--border));
    border-radius: var(--radius-lg, 16px);
  }
  .proj-card[data-status='active'] { border-inline-start-color: var(--chart-series-3, #248e4c); }
  .proj-card[data-status='paused'] { border-inline-start-color: var(--chart-series-4, #8f6b00); }
  .proj-card[data-status='completed'] { border-inline-start-color: var(--chart-series-1, #5a65d9); }
  .proj-card__title {
    all: unset;
    cursor: pointer;
    font-weight: 600;
    font-size: var(--kn-list-title, 14px);
    color: var(--t1, var(--text-primary));
  }
  .proj-card__title:hover {
    color: var(--accent);
  }
  .proj-card__meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    font-size: var(--kn-list-excerpt, 13px);
    color: var(--t2, var(--text-secondary));
  }
  .proj-status-label {
    font-size: var(--kn-meta, 12px);
    font-weight: 600;
    color: var(--t1);
  }
  .proj-next {
    color: var(--t1);
    font-weight: 500;
  }
  .proj-fact {
    min-width: 0;
  }
  .proj-link {
    color: var(--accent);
    text-decoration: none;
    font-size: var(--text-sm);
  }
  .proj-link:hover {
    text-decoration: underline;
  }
  .proj-suggest {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2, 8px);
    padding-block-start: var(--space-2, 8px);
    border-block-start: 1px dashed var(--border);
  }
  .proj-apply {
    margin-inline-start: auto;
  }
</style>
