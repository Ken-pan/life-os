<script>
  import { createTask } from '$lib/domain/tasks.js';
  import { S } from '$lib/state.svelte.js';
  import { SYSTEM_LIST_INBOX } from '$lib/types.js';
  import { t } from '$lib/i18n/index.js';
  import { todayKey } from '$lib/state.svelte.js';
  import { toast } from '$lib/ui.svelte.js';
  import { getProjectById, selectableProjects } from '$lib/domain/projects.js';

  /** @type {{ placeholder?: string, listId?: string, dueDate?: string|null, projectId?: string|null, showOnMobile?: boolean, toastOnAdd?: string }} */
  let {
    placeholder = t('home.quickAdd'),
    listId,
    dueDate = todayKey(),
    projectId = null,
    showOnMobile = false,
    toastOnAdd = '',
  } = $props();

  let text = $state('');
  let selectedProjectId = $state(null);

  const canSubmit = $derived(text.trim().length > 0);
  const selectedProject = $derived(getProjectById(selectedProjectId));
  const atQuery = $derived.by(() => {
    const match = text.match(/(?:^|\s)@([^@\s]*)$/);
    return match ? match[1].toLowerCase() : null;
  });
  const projectSuggestions = $derived.by(() => {
    if (atQuery == null) return [];
    return selectableProjects()
      .filter((project) => project.title.toLowerCase().includes(atQuery))
      .slice(0, 5);
  });

  $effect(() => {
    selectedProjectId = projectId;
  });

  function cleanTitle() {
    return text.replace(/(?:^|\s)@([^@\s]*)$/, '').trim();
  }

  /** @param {import('$lib/types.js').PlannerProject} project */
  function selectProject(project) {
    selectedProjectId = project.id;
    text = cleanTitle();
  }

  function submit() {
    const title = cleanTitle() || text.trim();
    if (!title) return;
    createTask({
      title,
      listId: listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
      dueDate,
      projectId: selectedProjectId || null
    });
    text = '';
    selectedProjectId = projectId;
    if (toastOnAdd) toast(toastOnAdd);
  }
</script>

<form class="quick-add" class:quick-add--mobile={showOnMobile} onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div class="quick-add-input-wrap">
    {#if selectedProject}
      <button
        type="button"
        class="quick-add-project"
        aria-label={t('task.clearProject')}
        onclick={() => (selectedProjectId = null)}
      >
        {selectedProject.title}
      </button>
    {/if}
    <input bind:value={text} {placeholder} aria-label={placeholder} />
    {#if projectSuggestions.length}
      <div class="quick-add-project-menu">
        {#each projectSuggestions as project (project.id)}
          <button type="button" onclick={() => selectProject(project)}>
            {project.title}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <button type="submit" class="btn-primary" disabled={!canSubmit}>{t('common.add')}</button>
</form>

<style>
  .quick-add-input-wrap {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
  }

  .quick-add-input-wrap input {
    width: 100%;
  }

  .quick-add-project {
    position: absolute;
    left: 8px;
    z-index: 1;
    max-width: 42%;
    height: 28px;
    padding: 0 9px;
    border-radius: var(--radius-pill);
    border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .quick-add-project + input {
    padding-left: min(46%, 160px);
  }

  .quick-add-project-menu {
    position: absolute;
    z-index: var(--z-popover, 50);
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    box-shadow: var(--shadow-popover, 0 12px 30px rgba(0, 0, 0, 0.14));
  }

  .quick-add-project-menu button {
    min-height: 42px;
    padding: 0 var(--space-3);
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--t1);
    text-align: left;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .quick-add-project-menu button:last-child {
    border-bottom: 0;
  }

  .quick-add-project-menu button:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
</style>
