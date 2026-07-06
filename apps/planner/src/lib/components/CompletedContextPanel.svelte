<script>
  import { t } from '$lib/i18n/index.js';
  import RhythmSummaryCard from './RhythmSummaryCard.svelte';

  /** @type {{
    summary: ReturnType<import('$lib/domain/rhythm.js').computeRhythmSummary>,
    progress: { done: number, total: number, remaining: number },
    doneToday: import('$lib/types.js').Task[],
  }} */
  let { summary, progress, doneToday } = $props();
</script>

<aside class="today-recap completed-context" aria-label={t('completed.recapTitle')}>
  <header class="today-recap-head">
    <h2 class="today-recap-title">{t('completed.recapTitle')}</h2>
    <p class="today-recap-sub">{t('home.progressDoneOnly', { count: doneToday.length })}</p>
  </header>

  <RhythmSummaryCard {summary} {progress} {doneToday} nextTask={null} compact focusMetric="week" />
</aside>
