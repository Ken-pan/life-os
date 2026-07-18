<script>
  // 行动型首页：先告诉用户今天该处理什么，图表下沉为「数据概览」。
  import { goto } from '$app/navigation'
  import { LineChart, DonutChart, Heatmap } from '@life-os/platform-web/svelte/charts'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import { S } from '$lib/state.svelte.js'
  import { isProjectItem } from '$lib/projects.js'
  import {
    snapshot,
    growthSeries,
    typeBreakdown,
    topTags,
    activityHeatmap,
    actionSignals,
  } from '$lib/analytics.js'
  import { t } from '$lib/i18n/index.js'

  const now = Date.now()

  const snap = $derived(snapshot(S.items, { now }))
  const growth = $derived(growthSeries(S.items, { now, weeks: 12 }))
  const types = $derived(typeBreakdown(S.items))
  const tags = $derived(topTags(S.items, 10))
  const heat = $derived(activityHeatmap(S.items, { now, weeks: 16 }))
  const signals = $derived(actionSignals(S.items, { now, isProject: isProjectItem }))

  const TYPE_LABEL = { note: 'library.typeNote', link: 'library.typeLink', clip: 'library.typeClip' }
  const typeItems = $derived(
    ['note', 'link', 'clip']
      .map((k) => ({ label: t(TYPE_LABEL[k]), value: types[k] }))
      .filter((x) => x.value > 0),
  )
  const weekdays = $derived([0, 1, 2, 3, 4, 5, 6].map((i) => t(`overview.wd${i}`)))
  const tagMax = $derived(Math.max(1, ...tags.map((x) => x.value)))

  const openNote = (item) => item && goto(`/library?note=${encodeURIComponent(item.id)}`)
</script>

<div class="wrap">
  {#if S.items.length === 0}
    <div class="settings-block">
      <EmptyState title={t('overview.emptyTitle')} description={t('overview.emptyDesc')} />
    </div>
  {:else}
    <section class="card actions">
      <h2 class="section-title">{t('overview.todayTitle')}</h2>
      <ul class="action-list">
        <li>
          <a class="action-row" href="/">
            <span class="action-row__label">
              {signals.pending.length
                ? t('overview.actionInbox', { count: signals.pending.length })
                : t('overview.actionInboxEmpty')}
            </span>
            <span class="action-row__cta">{t('overview.openInbox')}</span>
          </a>
        </li>
        <li>
          <a class="action-row" href="/projects">
            <span class="action-row__label">
              {signals.staleProjects.length
                ? t('overview.actionStale', { count: signals.staleProjects.length })
                : t('overview.actionStaleEmpty')}
            </span>
            <span class="action-row__cta">{t('overview.openProjects')}</span>
          </a>
        </li>
        <li class="action-static">
          <span class="action-row__label">
            {signals.orphans.length
              ? t('overview.actionOrphan', { count: signals.orphans.length })
              : t('overview.actionOrphanEmpty')}
          </span>
        </li>
      </ul>
    </section>

    {#if signals.continueItems.length}
      <section class="card">
        <h2 class="section-title">{t('overview.continueTitle')}</h2>
        <ul class="note-links">
          {#each signals.continueItems as item (item.id)}
            <li>
              <button type="button" class="note-link" onclick={() => openNote(item)}>
                <span class="note-link__title">{item.title || t('library.typeNote')}</span>
                <span class="note-link__cta">{t('overview.openNote')}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if signals.revisit.length}
      <section class="card">
        <h2 class="section-title">{t('overview.revisitTitle')}</h2>
        <ul class="note-links">
          {#each signals.revisit as item (item.id)}
            <li>
              <button type="button" class="note-link" onclick={() => openNote(item)}>
                <span class="note-link__title">{item.title || t('library.typeNote')}</span>
                <span class="note-link__cta">{t('overview.openNote')}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="stats-block">
      <h2 class="section-title stats-heading">{t('overview.statsTitle')}</h2>

      <div class="life-os-grid life-os-grid--kpi ov-kpi">
        <div class="settings-block stat stat--compact">
          <span class="stat__label">{t('overview.kpiTotal')}</span>
          <span class="stat__value">{snap.total}</span>
        </div>
        <div class="settings-block stat stat--compact">
          <span class="stat__label">{t('overview.kpiWeek')}</span>
          <span class="stat__value">{snap.week}</span>
        </div>
        <div class="settings-block stat stat--compact">
          <span class="stat__label">{t('overview.kpiTags')}</span>
          <span class="stat__value">{snap.tags}</span>
        </div>
        <div class="settings-block stat stat--compact">
          <span class="stat__label">{t('overview.kpiTypes')}</span>
          <span class="stat__value">{typeItems.length}</span>
        </div>
      </div>

      <section class="card ov-panel">
        <h3 class="panel-title">{t('overview.growthTitle')}</h3>
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
          <h3 class="panel-title">{t('overview.typeTitle')}</h3>
          <DonutChart
            items={typeItems}
            size={168}
            centerValue={String(snap.total)}
            centerLabel={t('overview.typeCenter')}
            ariaLabel={t('overview.typeTitle')}
          />
        </section>

        <section class="card ov-panel">
          <h3 class="panel-title">{t('overview.tagsTitle')}</h3>
          {#if tags.length}
            <ol class="tag-rank">
              {#each tags as tag (tag.label)}
                <li>
                  <button
                    type="button"
                    class="tag-rank__row"
                    onclick={() => goto(`/library?tag=${encodeURIComponent(tag.label)}`)}
                  >
                    <span class="tag-rank__label">{tag.label}</span>
                    <span class="tag-rank__bar" style="--w: {(tag.value / tagMax) * 100}%"></span>
                    <span class="tag-rank__val">{tag.value}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="ov-sub">{t('overview.tagsEmpty')}</p>
          {/if}
        </section>
      </div>

      <section class="card ov-panel">
        <h3 class="panel-title">{t('overview.activityTitle')}</h3>
        <p class="ov-sub">{t('overview.activitySub')}</p>
        <div class="ov-heat">
          <Heatmap
            rows={weekdays}
            cols={heat.cols}
            values={heat.values}
            colEvery={4}
            cellSize={13}
            ariaLabel={t('overview.activityTitle')}
          />
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .wrap {
    display: grid;
    gap: var(--space-4, 16px);
    margin-block: var(--space-4, 16px);
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-4, 16px) var(--space-5, 20px);
    display: grid;
    gap: var(--space-3, 12px);
  }
  .ov-panel { display: grid; gap: var(--space-2, 8px); }
  .panel-title {
    margin: 0;
    font-size: var(--text-md, 1rem);
    font-weight: 600;
  }
  .ov-sub {
    margin: 0;
    font-size: var(--kn-meta, 12px);
    color: var(--t3, var(--text-muted));
  }
  .action-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 6%, var(--card-h, var(--bg-2)));
    text-decoration: none;
    color: inherit;
  }
  .action-row:hover {
    background: color-mix(in srgb, var(--accent) 12%, var(--card-h, var(--bg-2)));
  }
  .action-static {
    padding: 12px 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }
  .action-row__label {
    font-size: var(--kn-list-title, 14px);
    font-weight: 550;
    color: var(--t1);
  }
  .action-row__cta {
    font-size: var(--kn-meta, 12px);
    font-weight: 600;
    color: var(--accent);
    flex: 0 0 auto;
  }
  .note-links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .note-link {
    all: unset;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
    padding: 10px 8px;
    border-radius: 8px;
    cursor: pointer;
  }
  .note-link:hover {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
  }
  .note-link__title {
    font-size: var(--kn-list-title, 14px);
    font-weight: 550;
    color: var(--t1);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-link__cta {
    font-size: var(--kn-meta, 12px);
    color: var(--accent);
    flex: 0 0 auto;
  }
  .stats-block {
    display: grid;
    gap: var(--space-4, 16px);
    margin-top: var(--space-2, 8px);
    padding-top: var(--space-4, 16px);
    border-top: 1px solid var(--border);
  }
  .stats-heading { margin: 0; }
  .ov-row {
    display: grid;
    gap: var(--space-4, 16px);
    grid-template-columns: 1fr;
  }
  .ov-heat { overflow-x: auto; }
  .tag-rank {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .tag-rank__row {
    all: unset;
    display: grid;
    grid-template-columns: minmax(72px, 0.9fr) 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 4px;
    border-radius: 6px;
    cursor: pointer;
  }
  .tag-rank__row:hover {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
  }
  .tag-rank__label {
    font-size: var(--kn-list-excerpt, 13px);
    font-weight: 550;
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag-rank__bar {
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    position: relative;
    overflow: hidden;
  }
  .tag-rank__bar::after {
    content: '';
    display: block;
    height: 100%;
    width: var(--w, 0%);
    background: var(--accent);
    border-radius: inherit;
  }
  .tag-rank__val {
    font-size: var(--kn-meta, 12px);
    font-variant-numeric: tabular-nums;
    color: var(--t2);
    font-family: var(--mono);
  }
  @media (min-width: 760px) {
    .ov-row { grid-template-columns: minmax(240px, 0.8fr) 1.2fr; }
  }
</style>
