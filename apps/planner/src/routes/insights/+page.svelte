<script>
  // 洞察页 — 项目规划与完成回顾。全部从 S.tasks / S.projects 实时派生:
  // 新建项目、给任务标 dueDate、完成任务,图表即时更新,零手工维护。
  import PageShell from '$lib/components/PageShell.svelte'
  import { S } from '$lib/state.svelte.js'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import { selectDoneLogGroups } from '$lib/domain/selectors.js'
  import { visibleProjects } from '$lib/domain/projects.js'
  import { dateKeyOf } from '$lib/persist/migrate.js'
  import { t, resolveLocale } from '$lib/i18n/index.js'
  import { messages } from '$lib/i18n/messages/index.js'
  import {
    TimelineChart,
    Heatmap,
    LineChart,
  } from '@life-os/platform-web/svelte/charts'

  const DAY = 86400000

  const index = $derived(taskIndex())
  const doneGroups = $derived(selectDoneLogGroups(index))
  const doneByDate = $derived(
    new Map(doneGroups.map(([key, tasks]) => [key, tasks.length])),
  )
  const totalDone = $derived(
    doneGroups.reduce((a, [, tasks]) => a + tasks.length, 0),
  )

  /* ── KPI ── */
  const monthPrefix = $derived(dateKeyOf(new Date()).slice(0, 7))
  const monthDone = $derived(
    doneGroups
      .filter(([key]) => key.startsWith(monthPrefix))
      .reduce((a, [, tasks]) => a + tasks.length, 0),
  )
  const weeklyAvg = $derived.by(() => {
    let n = 0
    for (let i = 0; i < 28; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      n += doneByDate.get(dateKeyOf(d)) ?? 0
    }
    return Math.round((n / 4) * 10) / 10
  })
  const activeProjects = $derived(
    visibleProjects().filter((p) => p.status === 'active'),
  )

  // t() 只回字符串,dow 数组直接读 messages(同 fitness stats 的用法)
  const dowLabels = $derived(
    messages[resolveLocale(S.settings.locale)].insights.dow,
  )

  /* ── 项目规划时间线:span 与进度全部从任务派生 ── */
  /** @param {string} d 'YYYY-MM-DD' → 当地时区当日中午(避开时区边界) */
  function dueMs(d) {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day, 12).getTime()
  }

  const timelineRows = $derived(
    activeProjects.map((p) => {
      const tasksOf = S.tasks.filter(
        (task) => task.projectId === p.id && !task.deletedAt,
      )
      const done = tasksOf.filter((task) => task.completed).length
      const total = tasksOf.length
      const progress =
        p.progressMode === 'manual' && p.manualProgress != null
          ? p.manualProgress / 100
          : total
            ? done / total
            : 0
      const dues = tasksOf
        .filter((task) => task.dueDate)
        .map((task) => ({ at: dueMs(task.dueDate), done: task.completed }))
        .sort((a, b) => a.at - b.at)
        .slice(0, 8)
      const end = Math.max(
        Date.now(),
        ...dues.map((m) => m.at),
        p.createdAt + 14 * DAY, // 新项目至少给两周跨度,不然渲染成一个点
      )
      return {
        label: p.title,
        start: p.createdAt,
        end,
        progress,
        milestones: dues,
        meta: t('insights.projectMeta', { done, total }),
      }
    }),
  )

  /* ── GitHub 式完成热力:近 52 周,周一起始 ── */
  const heat = $derived.by(() => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    // 定位本周一
    const monday = new Date(today)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const WEEKS = 52
    const cols = []
    const values = /** @type {(number | null)[][]} */ (
      Array.from({ length: 7 }, () => new Array(WEEKS).fill(null))
    )
    const dateKeys = /** @type {string[][]} */ (
      Array.from({ length: 7 }, () => new Array(WEEKS).fill(''))
    )
    let lastMonth = -1
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = new Date(monday)
      weekStart.setDate(weekStart.getDate() - (WEEKS - 1 - w) * 7)
      const m = weekStart.getMonth()
      cols.push(m !== lastMonth ? `${m + 1}月` : '')
      lastMonth = m
      for (let r = 0; r < 7; r++) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + r)
        dateKeys[r][w] = dateKeyOf(d)
        if (d > today) continue // 未来日留 null(空格)
        values[r][w] = doneByDate.get(dateKeyOf(d)) ?? 0
      }
    }
    return { cols, values, dateKeys }
  })

  /* ── burn-up:近 12 周窗口内累计完成 ── */
  const burnup = $derived.by(() => {
    const labels = []
    const values = []
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const monday = new Date(today)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    let acc = 0
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(monday)
      weekStart.setDate(weekStart.getDate() - w * 7)
      let n = 0
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        if (d > today) break
        n += doneByDate.get(dateKeyOf(d)) ?? 0
      }
      acc += n
      labels.push(dateKeyOf(weekStart).slice(5))
      values.push(acc)
    }
    return { labels, values }
  })
</script>

<PageShell title={t('insights.title')} subtitle={t('insights.subtitle')}>
  {#snippet main()}
  <div class="insights-page">
  <div class="life-os-grid life-os-grid--kpi insights-kpi">
    <div class="settings-block stat">
      <span class="stat__label">{t('insights.kpiActiveProjects')}</span>
      <span class="stat__value">{activeProjects.length}</span>
    </div>
    <div class="settings-block stat">
      <span class="stat__label">{t('insights.kpiTotalDone')}</span>
      <span class="stat__value">{totalDone}</span>
    </div>
    <div class="settings-block stat">
      <span class="stat__label">{t('insights.kpiMonthDone')}</span>
      <span class="stat__value">{monthDone}</span>
    </div>
    <div class="settings-block stat">
      <span class="stat__label">{t('insights.kpiWeeklyAvg')}</span>
      <span class="stat__value">{weeklyAvg}</span>
    </div>
  </div>

  <section class="insights-section">
    <h2>{t('insights.planningTitle')}</h2>
    <div class="insights-card">
      {#if timelineRows.length}
        <TimelineChart rows={timelineRows} ariaLabel={t('insights.planningTitle')} />
      {:else}
        <p class="insights-empty">{t('insights.planningEmpty')}</p>
      {/if}
    </div>
  </section>

  <section class="insights-section">
    <h2>{t('insights.heatmapTitle')}</h2>
    <div class="insights-card">
      {#if totalDone > 0}
        <Heatmap
          rows={dowLabels}
          cols={heat.cols}
          values={heat.values}
          cellSize={11}
          cellLabel={(r, c) => heat.dateKeys[r][c]}
          ariaLabel={t('insights.heatmapTitle')}
        />
      {:else}
        <p class="insights-empty">{t('insights.doneEmpty')}</p>
      {/if}
    </div>
  </section>

  <section class="insights-section">
    <h2>{t('insights.burnupTitle')}</h2>
    <div class="insights-card">
      {#if totalDone > 0}
        <LineChart
          labels={burnup.labels}
          series={[{ label: t('insights.burnupSeries'), values: burnup.values }]}
          area
          height={180}
          ariaLabel={t('insights.burnupTitle')}
        />
      {:else}
        <p class="insights-empty">{t('insights.doneEmpty')}</p>
      {/if}
    </div>
  </section>
  </div>
  {/snippet}
</PageShell>

<style>
  .insights-page {
    display: flex;
    flex-direction: column;
    gap: var(--stack-section);
    padding-bottom: var(--space-8);
  }

  .insights-kpi {
    margin-top: var(--space-2);
  }

  .insights-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .insights-section h2 {
    margin: 0;
    color: var(--t2);
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .insights-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--card-radius, 12px);
    padding: var(--card-padding, 16px);
  }

  .insights-empty {
    margin: 0;
    color: var(--t3, var(--text-muted));
    font-size: var(--text-sm);
  }
</style>
