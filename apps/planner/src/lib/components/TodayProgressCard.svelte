<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';

  /** @type {{
    done: number,
    total: number,
    remaining: number,
    doneTodayCount?: number,
    unscheduledCount?: number,
    onOpenCalendar?: () => void
  }} */
  let {
    done,
    total,
    remaining,
    doneTodayCount = 0,
    unscheduledCount = 0,
    onOpenCalendar,
  } = $props();

  const pct = $derived(total > 0 ? Math.min(100, (done / total) * 100) : 0);
  const statsDone = $derived(total > 0 ? done : doneTodayCount);
</script>

<section class="today-progress today-progress--compact" aria-label={t('home.progressTitle')}>
  <div class="today-progress-head">
    <span class="today-progress-label">{t('home.progressTitle')}</span>
    {#if total > 0}
      <span class="today-progress-count">{t('home.progressCount', { count: remaining, done, total })}</span>
    {/if}
  </div>

  {#if total > 0}
    <div
      class="progress progress--sm"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={t('home.progressCount', { count: remaining, done, total })}
    >
      <div class="progress__fill" style="--progress-value: {pct}%"></div>
    </div>
  {/if}

  <p class="today-progress-copy">
    {#if total > 0}
      {t('home.progressRemaining', { done, count: remaining })}
    {:else if doneTodayCount > 0}
      {t('home.progressDoneOnly', { count: doneTodayCount })}
    {/if}
  </p>

  <div class="today-progress-foot">
    <div class="today-progress-foot-row">
      {#if unscheduledCount > 0}
        <button type="button" class="today-progress-stats today-progress-stats--link" onclick={() => onOpenCalendar?.()}>
          {t('home.progressStats', { done: statsDone, unscheduled: unscheduledCount })}
        </button>
      {:else}
        <p class="today-progress-stats">
          {t('home.progressStats', { done: statsDone, unscheduled: unscheduledCount })}
        </p>
      {/if}
      <button type="button" class="today-progress-chip today-progress-chip--action" onclick={() => goto('/upcoming')}>
        {t('home.planTomorrow')}
      </button>
    </div>
  </div>
</section>
