<script>
  import { PRIORITY_COLORS } from '$lib/types.js';
  import { isOverdue } from '$lib/domain/tasks.js';
  import { recurrenceLabel } from '$lib/domain/recurrence.js';
  import { formatDateShort } from '$lib/domain/dateFormat.js';
  import { listLabel, t } from '$lib/i18n/index.js';
  import { getListById } from '$lib/state.svelte.js';
  import Icon from './Icon.svelte';

  /** @type {{ task: import('$lib/types.js').Task, compact?: boolean, onToggle?: (id: string) => void, onEdit?: (task: import('$lib/types.js').Task) => void }} */
  let { task, compact = false, onToggle, onEdit } = $props();

  const overdue = $derived(isOverdue(task));
  const list = $derived(getListById(task.listId));
  const hasRecurrence = $derived(task.recurrence?.rule && task.recurrence.rule !== 'none');
  const showMeta = $derived(
    !compact ||
      overdue ||
      hasRecurrence ||
      task.dueDate ||
      task.dueTime ||
      task.reminderMinutes != null
  );
  const showSecondaryMeta = $derived(!compact);

  function fmtDate(dateKey) {
    return formatDateShort(dateKey);
  }
</script>

<div class="task-row" class:done={task.completed} class:overdue={overdue} class:task-row--compact={compact}>
  <button
    type="button"
    class="task-check"
    class:on={task.completed}
    aria-label="toggle"
    onclick={() => onToggle?.(task.id)}
  >
    {#if task.completed}<Icon name="check" size={14} strokeWidth={3} />{/if}
  </button>

  <button type="button" class="task-body" style="text-align:left;background:none;border:none;padding:0;width:100%" onclick={() => onEdit?.(task)}>
    <div class="task-title" class:done-text={task.completed}>{task.title}</div>
    {#if showMeta && (task.dueDate || task.dueTime || hasRecurrence || task.reminderMinutes != null || (showSecondaryMeta && (task.tags.length || list)))}
      <div class="task-meta">
        {#if task.dueDate}
          <span class="chip" class:overdue={overdue}>
            {fmtDate(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ''}
          </span>
        {/if}
        {#if hasRecurrence}
          <span class="chip tag">{recurrenceLabel(task.recurrence, t)}</span>
        {/if}
        {#if task.reminderMinutes != null}
          <span class="chip">🔔</span>
        {/if}
        {#if showSecondaryMeta}
          {#if list}<span class="chip">{listLabel(list)}</span>{/if}
          {#each task.tags as tag}<span class="chip tag">{tag}</span>{/each}
        {/if}
      </div>
    {/if}
  </button>

  {#if task.priority > 0}
    <span
      class="priority-dot"
      style:background={PRIORITY_COLORS[task.priority]}
      title={t(`task.p${task.priority}`)}
      aria-label={`${t('task.priority')}: ${t(`task.p${task.priority}`)}`}
    ></span>
  {:else}
    <span></span>
  {/if}
</div>
