<script>
  // 记忆库 · 概览：整个知识库的形态与洞察（KPI + 增长 + 类型 + 标签 + 活跃热力）。
  // 「记忆库模块」的门面，数据图表集中在此；与「笔记模块」（收集箱/知识库/时间线）分工。
  import { LineChart, DonutChart, Treemap, Heatmap } from '@life-os/platform-web/svelte/charts'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S } from '$lib/state.svelte.js'
  import {
    snapshot,
    growthSeries,
    typeBreakdown,
    topTags,
    activityHeatmap,
  } from '$lib/analytics.js'
  import { t } from '$lib/i18n/index.js'

  const now = Date.now()

  const snap = $derived(snapshot(S.items, { now }))
  const growth = $derived(growthSeries(S.items, { now, weeks: 12 }))
  const types = $derived(typeBreakdown(S.items))
  const tags = $derived(topTags(S.items, 16))
  const heat = $derived(activityHeatmap(S.items, { now, weeks: 16 }))

  const TYPE_LABEL = { note: 'library.typeNote', link: 'library.typeLink', clip: 'library.typeClip' }
  const typeItems = $derived(
    ['note', 'link', 'clip']
      .map((k) => ({ label: t(TYPE_LABEL[k]), value: types[k] }))
      .filter((x) => x.value > 0),
  )
  const treeItems = $derived(tags.map((x) => ({ label: x.label, value: x.value })))
  // 热力图行：周日→周六（须与 analytics 的行序一致）
  const weekdays = $derived([0, 1, 2, 3, 4, 5, 6].map((i) => t(`overview.wd${i}`)))

  const kpis = $derived([
    { label: t('overview.kpiTotal'), value: snap.total },
    { label: t('overview.kpiWeek'), value: snap.week },
    { label: t('overview.kpiTags'), value: snap.tags },
    { label: t('overview.kpiTypes'), value: typeItems.length },
  ])
</script>

<div class="wrap">
  {#if S.items.length === 0}
    <div class="settings-block">
      <EmptyState title={t('overview.emptyTitle')} description={t('overview.emptyDesc')} />
    </div>
  {:else}
    <div class="life-os-grid life-os-grid--kpi ov-kpi">
      {#each kpis as kpi (kpi.label)}
        <div class="settings-block stat stat--compact">
          <span class="stat__label">{kpi.label}</span>
          <span class="stat__value">{kpi.value}</span>
        </div>
      {/each}
    </div>

    <section class="card ov-panel">
      <h2 class="section-title">{t('overview.growthTitle')}</h2>
      <p class="ov-sub">{t('overview.growthSub')}</p>
      <LineChart
        labels={growth.labels}
        series={[{ label: t('overview.kpiTotal'), values: growth.values }]}
        height={200}
        area
        curve="smooth"
        baseline="zero"
        ariaLabel={t('overview.growthTitle')}
      />
    </section>

    <div class="ov-row">
      <section class="card ov-panel">
        <h2 class="section-title">{t('overview.typeTitle')}</h2>
        <DonutChart items={typeItems} size={168} centerValue={String(snap.total)} centerLabel={t('overview.typeCenter')} ariaLabel={t('overview.typeTitle')} />
      </section>

      <section class="card ov-panel">
        <h2 class="section-title">{t('overview.tagsTitle')}</h2>
        {#if treeItems.length}
          <Treemap items={treeItems} height={220} ariaLabel={t('overview.tagsTitle')} />
        {:else}
          <p class="ov-sub">{t('overview.tagsEmpty')}</p>
        {/if}
      </section>
    </div>

    <section class="card ov-panel">
      <h2 class="section-title">{t('overview.activityTitle')}</h2>
      <p class="ov-sub">{t('overview.activitySub')}</p>
      <div class="ov-heat">
        <Heatmap rows={weekdays} cols={heat.cols} values={heat.values} colEvery={4} cellSize={13} ariaLabel={t('overview.activityTitle')} />
      </div>
    </section>
  {/if}
</div>

<style>
  .wrap { display: grid; gap: var(--space-4, 16px); margin-block: var(--space-4, 16px); }
  .ov-panel { display: grid; gap: var(--space-2, 8px); }
  .section-title { margin: 0; }
  .ov-sub { margin: 0; font-size: var(--text-sm); color: var(--t3, var(--text-muted)); }
  .ov-row {
    display: grid; gap: var(--space-4, 16px);
    grid-template-columns: 1fr;
  }
  .ov-heat { overflow-x: auto; }
  @media (min-width: 760px) {
    .ov-row { grid-template-columns: minmax(240px, 0.8fr) 1.2fr; }
  }
</style>
