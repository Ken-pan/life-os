<script>
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n/index.js';
  import { editTask } from '$lib/taskUi.js';
  import RhythmSummaryCard from './RhythmSummaryCard.svelte';
  import Icon from '@life-os/platform-web/svelte/icon';

  /** @type {{
    summary: ReturnType<import('$lib/domain/rhythm.js').computeRhythmSummary>,
    progress: { done: number, total: number, remaining: number },
    doneToday: import('$lib/types.js').Task[],
    nextTask: import('$lib/types.js').Task | null,
    unscheduledCount?: number,
    onOpenCalendar?: () => void
  }} */
  let { summary, progress, doneToday, nextTask, unscheduledCount = 0, onOpenCalendar } = $props();

  const previewDone = $derived(doneToday.slice(0, 5));
</script>

<aside class="life-os-grid__aside today-recap" aria-label={t('home.recapTitle')}>
  <header class="today-recap-head">
    <h2 class="today-recap-title">{t('home.recapTitle')}</h2>
    <p class="today-recap-sub">
      {#if progress.total > 0}
        {t('home.progressCount', {
          count: progress.remaining,
          done: progress.done,
          total: progress.total,
        })}
      {:else}
        {t('home.progressDoneOnly', { count: doneToday.length })}
      {/if}
    </p>
  </header>

  <RhythmSummaryCard {summary} {progress} {doneToday} {nextTask} compact />

  {#if doneToday.length}
    <section class="today-recap-block">
      <h3 class="today-recap-block-title">{t('home.doneToday')}</h3>
      <ul class="today-recap-done-list">
        {#each previewDone as task (task.id)}
          <li>
            <button type="button" class="today-recap-done-item" onclick={() => editTask(task)}>
              <Icon name="check" size={14} strokeWidth={3} />
              <span>{task.title}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if doneToday.length > previewDone.length}
        <button type="button" class="today-recap-link" onclick={() => document.getElementById('done-today')?.scrollIntoView({ behavior: 'smooth' })}>
          {t('home.viewAllDone', { count: doneToday.length })}
        </button>
      {/if}
    </section>
  {/if}

  {#if nextTask}
    <section class="today-recap-block">
      <h3 class="today-recap-block-title">{t('home.nextAction')}</h3>
      <button type="button" class="today-recap-next" onclick={() => editTask(nextTask)}>
        <span>{nextTask.title}</span>
        <Icon name="chevron-right" size={16} strokeWidth={2} />
      </button>
    </section>
  {/if}

  <div class="today-recap-foot">
    {#if unscheduledCount > 0}
      <button type="button" class="today-progress-chip" onclick={() => onOpenCalendar?.()}>
        {t('schedule.planToday', { count: unscheduledCount })}
      </button>
    {/if}
    <button type="button" class="today-progress-chip today-progress-chip--ghost" onclick={() => goto('/completed')}>
      {t('home.viewDoneLog')}
    </button>
  </div>
</aside>
