<script>
  import PageShell from '$lib/components/PageShell.svelte'
  import QuickAddBar from '$lib/components/QuickAddBar.svelte'
  import TaskGroup from '$lib/components/TaskGroup.svelte'
  import { page } from '$app/state'
  import { S, getListById } from '$lib/state.svelte.js'
  import { taskIndex } from '$lib/taskIndex.svelte.js'
  import { selectByList } from '$lib/domain/selectors.js'
  import { completeTask, editTask } from '$lib/taskUi.js'
  import { listLabel, t } from '$lib/i18n/index.js'
  import { sortTasks } from '$lib/engine/prioritizer.js'

  const listId = $derived(page.params.id)
  const list = $derived(getListById(listId))
  const tasks = $derived(sortTasks(selectByList(taskIndex(), listId)))
</script>

<PageShell title={list ? listLabel(list) : t('nav.lists')}>
  {#snippet main()}
    {#if list}
      <QuickAddBar
        listId={list.id}
        dueDate={null}
        placeholder={t('home.quickAdd')}
      />
      <TaskGroup
        title={listLabel(list)}
        {tasks}
        hideHeader
        empty={t('common.empty')}
        onToggle={completeTask}
        onEdit={editTask}
      />
    {/if}
  {/snippet}
</PageShell>
