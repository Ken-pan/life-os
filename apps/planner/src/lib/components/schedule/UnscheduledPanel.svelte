<script>
  import { t } from '$lib/i18n/index.js';
  import { openSchedulePopover } from '$lib/ui.svelte.js';
  import { editTask } from '$lib/taskUi.js';
  import Icon from '../Icon.svelte';

  /** @type {{ dateKey: string, tasks: import('$lib/types.js').Task[] }} */
  let { dateKey, tasks } = $props();

  let expanded = $state(true);
</script>

<section class="unscheduled-panel" aria-label={t('schedule.unscheduled')}>
  <button
    type="button"
    class="unscheduled-panel-head unscheduled-panel-head--toggle"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <h2 class="unscheduled-panel-title">{t('schedule.unscheduled')}</h2>
    <span class="unscheduled-panel-trailing">
      <span class="unscheduled-panel-count">{tasks.length}</span>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={2} />
    </span>
  </button>

  {#if expanded}
    {#if tasks.length}
      <ul class="unscheduled-list">
        {#each tasks as task (task.id)}
          <li class="unscheduled-item">
            <button type="button" class="unscheduled-item-title" onclick={() => editTask(task)}>
              {task.title}
            </button>
            <button
              type="button"
              class="unscheduled-item-action"
              onclick={() => openSchedulePopover(task.id, dateKey)}
            >
              {t('schedule.scheduleAction')}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="unscheduled-empty">{t('schedule.unscheduledEmpty')}</p>
    {/if}
  {/if}
</section>
