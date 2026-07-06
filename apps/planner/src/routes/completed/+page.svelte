<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import DoneLogView from '$lib/components/DoneLogView.svelte';
  import RhythmSummaryCard from '$lib/components/RhythmSummaryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectDoneLogGroups, selectTodayProgress } from '$lib/domain/selectors.js';
  import { computeRhythmSummary } from '$lib/domain/rhythm.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { S } from '$lib/state.svelte.js';
  import { t } from '$lib/i18n/index.js';

  const index = $derived(taskIndex());
  const groups = $derived(selectDoneLogGroups(index));
  const progress = $derived(selectTodayProgress(index));
  const rhythm = $derived(computeRhythmSummary(S.tasks, S.settings, progress));
</script>

<AppBar title={t('completed.title')} />

<div class="wrap completed-page">
  <section class="completed-rhythm">
    <h2 class="completed-section-title">{t('rhythm.title')}</h2>
    <RhythmSummaryCard summary={rhythm} progress={progress} doneToday={progress.doneToday} nextTask={null} />
  </section>

  <section class="completed-log">
    <h2 class="completed-section-title">{t('completed.logTitle')}</h2>
    {#if groups.length}
      <DoneLogView {groups} onToggle={completeTask} onEdit={editTask} />
    {:else}
      <EmptyState message={t('completed.empty')} />
    {/if}
  </section>
</div>
