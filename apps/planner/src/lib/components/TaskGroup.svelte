<script>
  import { untrack } from 'svelte';
  import TaskRow from './TaskRow.svelte';
  import EmptyState from './EmptyState.svelte';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { sortTasks } from '$lib/engine/prioritizer.js';
  import { t } from '$lib/i18n/index.js';

  /** @type {{
    title: string,
    tasks: import('$lib/types.js').Task[],
    empty?: string,
    hideHeader?: boolean,
    collapsible?: boolean,
    defaultExpanded?: boolean,
    collapseAfter?: number,
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
    collapseAfter = 0,
    compactRows = false,
    ritualComplete = false,
    showScheduleAction = false,
    hideQuickActions = false,
    scheduleDate,
    contextDate,
    sectionId,
    onToggle,
    onEdit
  } = $props();

  const sorted = $derived(sortTasks(tasks, 'smart'));
  let expanded = $state(untrack(() => defaultExpanded));

  // 部分折叠：只展示前 collapseAfter 条,其余收进「展开更多」。
  // 逾期任务这类「重要但可能很多」的组用它——最紧急的几条始终可见,不淹没今日视图。
  const partial = $derived(collapseAfter > 0 && sorted.length > collapseAfter);
  let showAll = $state(false);
  const visible = $derived(
    partial && !showAll ? sorted.slice(0, collapseAfter) : sorted,
  );
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
        {#each visible as task (task.id)}
          <TaskRow
            {task}
            compact={compactRows}
            metaMinimal={sectionId === 'done-today'}
            {ritualComplete}
            {showScheduleAction}
            {hideQuickActions}
            scheduleDate={scheduleDate}
            {contextDate}
            {onToggle}
            {onEdit}
          />
        {/each}
      </div>
      {#if partial}
        <button
          type="button"
          class="task-group-more"
          aria-expanded={showAll}
          onclick={() => (showAll = !showAll)}
        >
          <span>
            {showAll
              ? t('common.collapse')
              : t('common.showMore', { count: sorted.length - collapseAfter })}
          </span>
          <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={14} strokeWidth={2} />
        </button>
      {/if}
    {:else if empty}
      <EmptyState message={empty} />
    {/if}
  {/if}
</section>

<style>
  .task-group-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 6px 0 2px;
    padding: 4px 2px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #6b7280);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1;
  }
  .task-group-more:hover {
    color: var(--text, inherit);
  }
</style>
