<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectCompleted } from '$lib/domain/selectors.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';

  const tasks = $derived(selectCompleted(taskIndex()));
</script>

<AppBar title={t('completed.title')} />

<div class="wrap">
  {#if tasks.length}
    <TaskGroup title={t('completed.title')} {tasks} hideHeader compactRows onToggle={completeTask} onEdit={editTask} />
  {:else}
    <EmptyState message={t('completed.empty')} />
  {/if}
</div>
