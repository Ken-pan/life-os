<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import DoneLogView from '$lib/components/DoneLogView.svelte';
  import CompletedContextPanel from '$lib/components/CompletedContextPanel.svelte';
  import RhythmSummaryCard from '$lib/components/RhythmSummaryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectDoneLogGroups, selectTodayProgress } from '$lib/domain/selectors.js';
  import { computeRhythmSummary } from '$lib/domain/rhythm.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { S } from '$lib/state.svelte.js';
  import { t, localeTag } from '$lib/i18n/index.js';

  const index = $derived(taskIndex());
  const groups = $derived(selectDoneLogGroups(index));
  const progress = $derived(selectTodayProgress(index));
  const rhythm = $derived(computeRhythmSummary(S.tasks, S.settings, progress, localeTag()));
</script>

<AppBar title={t('completed.title')} />

<div class="desktop-split-layout desktop-split-layout--log">
  <div class="desktop-split-main">
    <div class="wrap completed-page">
      <section class="completed-rhythm completed-rhythm--inline">
        <h2 class="completed-section-title">{t('rhythm.title')}</h2>
        <RhythmSummaryCard
          summary={rhythm}
          progress={progress}
          doneToday={progress.doneToday}
          nextTask={null}
          focusMetric="week"
          showWeeklyHint
          showFocusMetric={false}
        />
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
  </div>

  <CompletedContextPanel summary={rhythm} progress={progress} doneToday={progress.doneToday} />
</div>
