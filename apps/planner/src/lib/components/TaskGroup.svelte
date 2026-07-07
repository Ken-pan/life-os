<script>
  import { untrack } from 'svelte';
  import TaskRow from './TaskRow.svelte';
  import EmptyState from './EmptyState.svelte';
  import Icon from './Icon.svelte';
  import { sortTasks } from '$lib/engine/prioritizer.js';

  /** @type {{
    title: string,
    tasks: import('$lib/types.js').Task[],
    empty?: string,
    hideHeader?: boolean,
    collapsible?: boolean,
    defaultExpanded?: boolean,
    compactRows?: boolean,
    ritualComplete?: boolean,
    showScheduleAction?: boolean,
    scheduleDate?: string,
    contextDate?: string,
    sectionId?: string,
    hideCount?: boolean,
    onToggle?: (id: string) => void,
    onEdit?: (task: import('$lib/types.js').Task) => void
  }} */
  let {
    title,
    tasks,
    empty,
    hideHeader = false,
    hideCount = false,
    collapsible = false,
    defaultExpanded = true,
    compactRows = false,
    ritualComplete = false,
    showScheduleAction = false,
    scheduleDate,
    contextDate,
    sectionId,
    onToggle,
    onEdit
  } = $props();

  const sorted = $derived(sortTasks(tasks, 'smart'));
  let expanded = $state(untrack(() => defaultExpanded));
</script>

<section class:task-group--compact={compactRows} id={sectionId}>
  {#if !hideHeader}
    {#if collapsible}
      <button
        type="button"
        class="sec-header sec-header--collapsible"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        <h2 class="sec-title">{title}</h2>
        <span class="sec-header-trailing">
          {#if !hideCount}
            <span class="sec-count">{tasks.length}</span>
          {/if}
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={2} />
        </span>
      </button>
    {:else}
      <div class="sec-header">
        <h2 class="sec-title">{title}</h2>
        {#if !hideCount}
          <span class="sec-count">{tasks.length}</span>
        {/if}
      </div>
    {/if}
  {/if}
  {#if !collapsible || expanded}
    {#if sorted.length}
      <div class="task-list">
        {#each sorted as task (task.id)}
          <TaskRow
            {task}
            compact={compactRows}
            metaMinimal={sectionId === 'done-today'}
            {ritualComplete}
            {showScheduleAction}
            scheduleDate={scheduleDate}
            {contextDate}
            {onToggle}
            {onEdit}
          />
        {/each}
      </div>
    {:else if empty}
      <EmptyState message={empty} />
    {/if}
  {/if}
</section>
