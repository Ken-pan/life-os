<script>
  import { t } from '$lib/i18n/index.js';

  /** @type {{
    summary: ReturnType<import('$lib/domain/rhythm.js').computeRhythmSummary>,
    progress: { done: number, total: number, remaining: number },
    doneToday: import('$lib/types.js').Task[],
    nextTask: import('$lib/types.js').Task | null,
    compact?: boolean,
    focusMetric?: 'today' | 'week',
    showWeeklyHint?: boolean,
    showFocusMetric?: boolean
  }} */
  let {
    summary,
    progress,
    doneToday,
    nextTask,
    compact = false,
    focusMetric = 'today',
    showWeeklyHint = false,
    showFocusMetric = true,
  } = $props();

  const focusCount = $derived(
    focusMetric === 'week' ? summary.focusWinsWeek : summary.focusWinsToday,
  );

  const showCombinedWeeklyHint = $derived(
    showWeeklyHint &&
      summary.enabled &&
      !summary.paused,
  );

  const showStreakRemaining = $derived(
    showCombinedWeeklyHint &&
      summary.doneThisWeek > 0 &&
      summary.streak === 0 &&
      progress.remaining > 0,
  );
</script>

<section class="rhythm-summary" class:rhythm-summary--compact={compact} aria-label={t('rhythm.title')}>
  {#if summary.enabled && !summary.paused}
    <div class="rhythm-summary-grid" class:rhythm-summary-grid--three={!showFocusMetric}>
      <div class="rhythm-stat">
        <span class="rhythm-stat-label">{t('rhythm.streak')}</span>
        <strong class="rhythm-stat-value">{summary.streak}<span class="rhythm-stat-unit">{t('rhythm.days')}</span></strong>
      </div>
      <div class="rhythm-stat">
        <span class="rhythm-stat-label">{t('rhythm.doneWeek')}</span>
        <strong class="rhythm-stat-value">{summary.doneThisWeek}</strong>
      </div>
      <div class="rhythm-stat">
        <span class="rhythm-stat-label">{t('rhythm.weekly')}</span>
        <strong class="rhythm-stat-value">{summary.weekly.active}<span class="rhythm-stat-unit">/ {summary.weekly.total}</span></strong>
      </div>
      {#if showFocusMetric}
        <div class="rhythm-stat">
          <span class="rhythm-stat-label">{t('rhythm.focusTasks')}</span>
          <strong class="rhythm-stat-value">{focusCount}</strong>
        </div>
      {/if}
    </div>

    <div class="rhythm-heatmap" aria-label={t('rhythm.weekly')}>
      {#each summary.weekly.days as day}
        <span
          class="rhythm-heat-cell"
          class:good={day.good === true}
          class:rest={day.good === null}
          title={day.dateKey}
        >{day.label}</span>
      {/each}
    </div>
    {#if showCombinedWeeklyHint}
      <p class="rhythm-streak-hint">
        {#if showStreakRemaining}
          {t('rhythm.weeklyStreakCombined', { count: progress.remaining })}
        {:else}
          {t('rhythm.weeklyGoalHint')}
        {/if}
      </p>
    {/if}
  {:else if summary.paused}
    <p class="rhythm-muted">{t('rhythm.pausedHint')}</p>
  {:else}
    <p class="rhythm-muted">{t('rhythm.disabledHint')}</p>
  {/if}

  {#if summary.milestones.some((m) => m.reached)}
    <div class="rhythm-milestones">
      {#each summary.milestones.filter((m) => m.reached) as milestone}
        <span class="rhythm-milestone">{t('rhythm.milestone', { count: milestone.threshold })}</span>
      {/each}
    </div>
  {/if}
</section>
