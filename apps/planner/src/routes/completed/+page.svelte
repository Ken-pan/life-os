<script>
  import PageShell from '$lib/components/PageShell.svelte'
  import DoneLogView from '$lib/components/DoneLogView.svelte'
  import CompletedContextPanel from '$lib/components/CompletedContextPanel.svelte'
  import RhythmSummaryCard from '$lib/components/RhythmSummaryCard.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import {
    selectDoneLogGroups,
    selectTodayProgress,
  } from '$lib/domain/selectors.js'
  import { computeRhythmSummary } from '$lib/domain/rhythm.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { S } from '$lib/state.svelte.js'
  import { t, localeTag } from '$lib/i18n/index.js'
  import { dateKeyOf } from '$lib/persist/migrate.js'
  import { BarChart } from '@life-os/platform-web/svelte/charts'

  const index = $derived(taskIndex())
  const groups = $derived(selectDoneLogGroups(index))
  const progress = $derived(selectTodayProgress(index))
  const rhythm = $derived(
    computeRhythmSummary(S.tasks, S.settings, progress, localeTag()),
  )

  // 近 14 天每日完成数(补零日,groups 只含有记录的日期)
  const trend = $derived.by(() => {
    const byDate = new Map(groups.map(([key, tasks]) => [key, tasks.length]))
    const labels = []
    const values = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = dateKeyOf(d)
      labels.push(key.slice(5))
      values.push(byDate.get(key) ?? 0)
    }
    return { labels, values, total: values.reduce((a, b) => a + b, 0) }
  })
</script>

<PageShell title={t('completed.title')} layout="split" asideWide>
  {#snippet main()}
      <div class="wrap completed-page">
        <section class="completed-rhythm completed-rhythm--inline">
          <h2 class="completed-section-title">{t('rhythm.title')}</h2>
          <RhythmSummaryCard
            summary={rhythm}
            {progress}
            doneToday={progress.doneToday}
            nextTask={null}
            focusMetric="week"
            showWeeklyHint
            showFocusMetric={false}
          />
        </section>

        {#if trend.total > 0}
          <section class="completed-trend">
            <h2 class="completed-section-title">{t('completed.trendTitle')}</h2>
            <div class="completed-trend-card">
              <BarChart
                labels={trend.labels}
                series={[{ label: t('completed.trendSeries'), values: trend.values }]}
                height={150}
                ariaLabel={t('completed.trendTitle')}
              />
            </div>
          </section>
        {/if}

        <section class="completed-log">
          <h2 class="completed-section-title">{t('completed.logTitle')}</h2>
          {#if groups.length}
            <DoneLogView {groups} onToggle={completeTask} onEdit={editTask} />
          {:else}
            <EmptyState message={t('completed.empty')} />
          {/if}
        </section>
      </div>
  {/snippet}
  {#snippet aside()}
    <CompletedContextPanel
      summary={rhythm}
      {progress}
      doneToday={progress.doneToday}
    />
  {/snippet}
</PageShell>

<style>
  .completed-trend-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--card-radius, 12px);
    padding: var(--card-padding, 16px);
  }
</style>
