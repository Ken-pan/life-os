<script>
  import { t } from '$lib/i18n/index.js';
  import { getTaskKind } from '$lib/domain/taskKind.js';
  import {
    blockLayout,
    taskDurationMinutes,
    formatTimeRange,
    formatDurationLabel,
  } from '$lib/domain/schedule.js';
  import { completeTask, editTask } from '$lib/taskUi.js';
  import Icon from '../Icon.svelte';

  /** @type {{ task: import('$lib/types.js').Task, hasConflict?: boolean, onReschedule?: () => void }} */
  let { task, hasConflict = false, onReschedule } = $props();

  const kind = $derived(getTaskKind(task));
  const duration = $derived(taskDurationMinutes(task));
  const layout = $derived(
    task.scheduledStart
      ? blockLayout(task.scheduledStart, duration)
      : null,
  );
  const rangeLabel = $derived(
    layout
      ? formatTimeRange(layout.startMinutes, layout.endMinutes, t)
      : '',
  );
  const compact = $derived(Boolean(layout && layout.height < 44));
</script>

{#if layout}
  <article
    class="time-block"
    class:time-block--done={task.completed}
    class:time-block--focus={kind === 'focus'}
    class:time-block--conflict={hasConflict && !task.completed}
    class:time-block--compact={compact}
    style:top="{layout.top}px"
    style:height="{layout.height}px"
  >
    <button type="button" class="time-block-body" onclick={() => editTask(task)}>
      <div class="time-block-title">{task.title}</div>
      {#if !compact}
        <div class="time-block-meta">
          {rangeLabel}
          · {formatDurationLabel(duration, t)}
        </div>
      {/if}
    </button>
    <div class="time-block-actions">
      {#if task.completed}
        <span class="time-block-check" aria-label={t('common.done')}>
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      {:else}
        <button
          type="button"
          class="time-block-check time-block-check--toggle"
          aria-label={t('common.done')}
          onclick={() => completeTask(task.id)}
        >
          <span class="time-block-check-ring"></span>
        </button>
      {/if}
      {#if onReschedule && !compact}
        <button type="button" class="time-block-reschedule" onclick={onReschedule} aria-label={t('schedule.reschedule')}>
          {t('schedule.rescheduleShort')}
        </button>
      {/if}
    </div>
  </article>
{/if}
