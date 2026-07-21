<script>
  import { createTaskAsync, deleteTaskAsync } from '$lib/domain/tasks.js'
  import { sensory } from '@life-os/platform-web/kenos-sensory'
  import { S } from '$lib/state.svelte.js'
  import { SYSTEM_LIST_INBOX } from '$lib/types.js'
  import { t } from '$lib/i18n/index.js'
  import { todayKey } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { getProjectById, selectableProjects } from '$lib/domain/projects.js'
  import {
    filterCaptureProjects,
    parseQuickAddTokens,
    projectQueryFromTitle,
    titleWithoutProjectQuery,
  } from '$lib/domain/taskCapture.js'
  import { createImeGuard } from '@life-os/theme'

  const ime = createImeGuard()

  /** @type {{ placeholder?: string, listId?: string, dueDate?: string|null, projectId?: string|null, showOnMobile?: boolean, toastOnAdd?: string }} */
  let {
    placeholder = t('home.quickAdd'),
    listId,
    dueDate = todayKey(),
    projectId = null,
    showOnMobile = false,
    toastOnAdd = '',
  } = $props()

  let text = $state('')
  let selectedProjectId = $state(null)
  let composing = $state(false)
  let suggestionsDismissed = $state(false)
  let activeSuggestion = $state(0)
  let submitting = $state(false)

  const canSubmit = $derived(text.trim().length > 0)
  const selectedProject = $derived(getProjectById(selectedProjectId))
  const atQuery = $derived.by(() => {
    if (composing || suggestionsDismissed) return null
    return projectQueryFromTitle(text)
  })
  const projectSuggestions = $derived.by(() => {
    if (atQuery == null) return []
    return filterCaptureProjects(selectableProjects(), atQuery, 5)
  })

  $effect(() => {
    selectedProjectId = projectId
  })

  function cleanTitle() {
    return titleWithoutProjectQuery(text)
  }

  /** @param {import('$lib/types.js').PlannerProject} project */
  function selectProject(project) {
    selectedProjectId = project.id
    text = cleanTitle()
    suggestionsDismissed = true
    activeSuggestion = 0
  }

  async function submit() {
    if (ime.isComposing()) return
    if (submitting) return
    const base = cleanTitle() || text.trim()
    if (!base) return
    const parsed = parseQuickAddTokens(base, todayKey())
    // 若整串都是语法 token，回退用原文，避免创建空标题
    const title = parsed.title || base
    submitting = true
    try {
      const created = await createTaskAsync({
        title,
        listId: listId || S.settings.defaultListId || SYSTEM_LIST_INBOX,
        dueDate: parsed.dueDate ?? dueDate,
        priority: parsed.priority ?? undefined,
        tags: parsed.tags.length ? parsed.tags : undefined,
        projectId: selectedProjectId || null,
      })
      text = ''
      selectedProjectId = projectId
      suggestionsDismissed = false
      void sensory('success')
      toast(toastOnAdd || t('toast.taskCreated'), {
        actionLabel: t('common.undo'),
        onAction: () => {
          void deleteTaskAsync(created.id)
        },
        key: `task-created:${created.id}`,
        dedupeMs: 0,
      })
    } catch (error) {
      void sensory('error')
      toast(error?.message || t('toast.schedulePersistFailed'), 'warn')
    } finally {
      submitting = false
    }
  }

  /** @param {KeyboardEvent} event */
  function handleKeydown(event) {
    if (ime.isComposing(event)) return
    if (!projectSuggestions.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeSuggestion = Math.min(
        activeSuggestion + 1,
        projectSuggestions.length - 1,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeSuggestion = Math.max(activeSuggestion - 1, 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectProject(projectSuggestions[activeSuggestion])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      suggestionsDismissed = true
    }
  }
</script>

<form
  class="quick-add"
  class:quick-add--mobile={showOnMobile}
  onsubmit={(e) => {
    e.preventDefault()
    submit()
  }}
>
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
    <input
      bind:value={text}
      {placeholder}
      aria-label={placeholder}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={projectSuggestions.length > 0}
      aria-controls="quick-add-project-options"
      aria-activedescendant={projectSuggestions[activeSuggestion]
        ? `quick-add-project-${projectSuggestions[activeSuggestion].id}`
        : undefined}
      oninput={() => {
        suggestionsDismissed = false
        activeSuggestion = 0
      }}
      oncompositionstart={() => {
        composing = true
        ime.compositionstart()
      }}
      oncompositionend={(event) => {
        ime.compositionend(event)
        setTimeout(() => (composing = false), 0)
      }}
      oncompositioncancel={() => {
        composing = false
        ime.compositioncancel()
      }}
      onkeydown={handleKeydown}
    />
    {#if projectSuggestions.length}
      <div
        id="quick-add-project-options"
        class="quick-add-project-menu"
        role="listbox"
      >
        {#each projectSuggestions as project, index (project.id)}
          <button
            id={`quick-add-project-${project.id}`}
            type="button"
            role="option"
            aria-selected={index === activeSuggestion}
            class:is-active={index === activeSuggestion}
            onpointerenter={() => (activeSuggestion = index)}
            onclick={() => selectProject(project)}
          >
            {project.title}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <button type="submit" class="btn-primary" disabled={!canSubmit}
    >{t('common.add')}</button
  >
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

  .quick-add-project-menu button.is-active {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
</style>
