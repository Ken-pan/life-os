<script>
  import AppBar from '$lib/components/AppBar.svelte';
  import QuickAddBar from '$lib/components/QuickAddBar.svelte';
  import TaskGroup from '$lib/components/TaskGroup.svelte';
  import { taskIndex } from '$lib/taskIndex.svelte.js';
  import { selectByList } from '$lib/domain/selectors.js';
  import { SYSTEM_LIST_INBOX } from '$lib/types.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import { t } from '$lib/i18n/index.js';
  import { sortTasks } from '$lib/engine/prioritizer.js';

  const tasks = $derived(sortTasks(selectByList(taskIndex(), SYSTEM_LIST_INBOX)));
</script>

<AppBar title={t('inbox.title')} />

<div class="wrap">
  <QuickAddBar listId={SYSTEM_LIST_INBOX} dueDate={null} />
  <TaskGroup title={t('inbox.title')} {tasks} hideHeader compactRows empty={t('common.empty')} onToggle={completeTask} onEdit={editTask} />
</div>
