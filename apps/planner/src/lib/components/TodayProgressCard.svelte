<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';

  /** @type {{
    done: number,
    total: number,
    remaining: number,
    doneTodayCount?: number,
    streak?: number,
    weeklyActive?: number,
    rhythmEnabled?: boolean,
    unscheduledCount?: number,
    onScrollDone?: () => void,
    onOpenTimeline?: () => void
  }} */
  let {
    done,
    total,
    remaining,
    doneTodayCount = 0,
    streak = 0,
    weeklyActive = 0,
    rhythmEnabled = true,
    unscheduledCount = 0,
    onScrollDone,
    onOpenTimeline,
  } = $props();

  const pct = $derived(total > 0 ? Math.min(100, (done / total) * 100) : 0);
  const allDone = $derived(total > 0 && remaining === 0);
  const dots = $derived(Math.min(total, 8));

  function scrollToDone() {
    onScrollDone?.();
    document.getElementById('done-today')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
</script>

<section class="today-progress" aria-label={t('home.progressTitle')}>
  <div class="today-progress-head">
    <span class="today-progress-label">{t('home.progressTitle')}</span>
    {#if total > 0}
      <span class="today-progress-count">{t('home.progressCount', { done, total })}</span>
    {/if}
  </div>

  {#if rhythmEnabled && (streak > 0 || weeklyActive > 0)}
    <div class="today-progress-rhythm">
      {#if streak > 0}
        <span class="today-progress-rhythm-pill">{t('rhythm.streakShort', { count: streak })}</span>
      {/if}
      {#if weeklyActive > 0}
        <span class="today-progress-rhythm-pill">{t('rhythm.weeklyShort', { active: weeklyActive })}</span>
      {/if}
    </div>
  {/if}

  {#if total > 0}
    <div class="today-progress-dots" aria-hidden="true">
      {#each Array(dots) as _, i}
        <span class="today-progress-dot" class:filled={i < done}></span>
      {/each}
    </div>

    <div
      class="today-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={t('home.progressCount', { done, total })}
    >
      <div class="today-progress-fill" style:width="{pct}%"></div>
    </div>
  {/if}

  <p class="today-progress-copy">
    {#if allDone}
      {t('home.progressAllDone')}
    {:else if total > 0}
      {t('home.progressRemaining', { count: remaining })}
    {:else if doneTodayCount > 0}
      {t('home.progressDoneOnly', { count: doneTodayCount })}
    {/if}
  </p>

  <div class="today-progress-actions">
    {#if done > 0}
      <button type="button" class="today-progress-chip" onclick={scrollToDone}>
        {t('home.doneToday')}
      </button>
    {/if}
    {#if unscheduledCount > 0}
      <button type="button" class="today-progress-chip" onclick={() => onOpenTimeline?.()}>
        {t('schedule.summaryUnscheduled')} · {unscheduledCount}
      </button>
    {:else}
      <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={() => onOpenTimeline?.()}>
        {t('home.viewTimeline')}
      </button>
    {/if}
    <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={() => goto('/upcoming')}>
      {t('home.planTomorrow')}
    </button>
  </div>
</section>
