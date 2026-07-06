<script>
  import TaskGroup from './TaskGroup.svelte';
  import { formatDateDisplay } from '$lib/domain/dateFormat.js';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ groups: [string, import('$lib/types.js').Task[]][], onToggle?: (id: string) => void, onEdit?: (task: import('$lib/types.js').Task) => void }} */
  let { groups, onToggle, onEdit } = $props();
</script>

{#each groups as [dateKey, tasks] (dateKey)}
  <TaskGroup
    title={formatDateDisplay(dateKey)}
    {tasks}
    compactRows
    collapsible
    defaultExpanded={groups[0]?.[0] === dateKey}
    {onToggle}
    {onEdit}
  />
{/each}

{#if !groups.length}
  <p class="done-log-empty">{t('completed.empty')}</p>
{/if}
