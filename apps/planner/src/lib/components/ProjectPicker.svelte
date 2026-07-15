<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { getProjectById, selectableProjects } from '$lib/domain/projects.js'
  import { filterCaptureProjects } from '$lib/domain/taskCapture.js'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ value?: string|null, onchange?: (value: string|null) => void }} */
  let { value = null, onchange = () => {} } = $props()

  let open = $state(false)
  let query = $state('')
  let activeIndex = $state(0)
  let searchInput = $state(null)
  let root = $state(null)

  const selectedProject = $derived(getProjectById(value))
  const orphanProject = $derived(value && !selectedProject ? value : null)
  const results = $derived(filterCaptureProjects(selectableProjects(), query, 6))

  $effect(() => {
    if (!open) return
    activeIndex = 0
    requestAnimationFrame(() => searchInput?.focus())
  })

  function openPicker() {
    query = ''
    open = true
  }

  function closePicker({ restoreFocus = false } = {}) {
    open = false
    query = ''
    if (restoreFocus) requestAnimationFrame(() => root?.querySelector('.project-picker-trigger')?.focus())
  }

  /** @param {import('$lib/types.js').PlannerProject} project */
  function select(project) {
    onchange(project.id)
    closePicker({ restoreFocus: true })
  }

  /** @param {KeyboardEvent} event */
  function handleSearchKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex = Math.min(activeIndex + 1, Math.max(0, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      select(results[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePicker({ restoreFocus: true })
    }
  }

  /** @param {FocusEvent} event */
  function handleFocusOut(event) {
    if (event.relatedTarget instanceof Node && root?.contains(event.relatedTarget)) return
    closePicker()
  }
</script>

<div class="project-picker" bind:this={root} onfocusout={handleFocusOut}>
  <span id="task-project-label" class="field-label">{t('task.project')}</span>
  <button
    type="button"
    class="project-picker-trigger"
    class:has-value={selectedProject || orphanProject}
    aria-labelledby="task-project-label"
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={() => (open ? closePicker() : openPicker())}
    onkeydown={(event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        openPicker()
      }
    }}
  >
    <span class="project-picker-value">
      <Icon name="folder" size={17} strokeWidth={1.8} />
      <span>{selectedProject?.title ?? (orphanProject ? t('task.unknownProject') : t('task.noProject'))}</span>
    </span>
    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} strokeWidth={1.8} />
  </button>

  {#if open}
    <div class="project-picker-popover">
      <div class="project-picker-search">
        <Icon name="search" size={16} strokeWidth={1.8} />
        <input
          bind:this={searchInput}
          bind:value={query}
          role="combobox"
          aria-label={t('task.searchProjects')}
          aria-controls="task-project-options"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={results[activeIndex] ? `task-project-${results[activeIndex].id}` : undefined}
          placeholder={t('task.searchProjects')}
          onkeydown={handleSearchKeydown}
        />
      </div>

      <div id="task-project-options" class="project-picker-options" role="listbox">
        {#if value}
          <button
            type="button"
            class="project-picker-option project-picker-option--clear"
            role="option"
            aria-selected="false"
            onclick={() => {
              onchange(null)
              closePicker({ restoreFocus: true })
            }}
          >
            <Icon name="x" size={16} strokeWidth={1.8} />
            {t('task.clearProject')}
          </button>
        {/if}
        {#each results as project, index (project.id)}
          <button
            id={`task-project-${project.id}`}
            type="button"
            class="project-picker-option"
            class:is-active={index === activeIndex}
            role="option"
            aria-selected={project.id === value}
            onpointerenter={() => (activeIndex = index)}
            onclick={() => select(project)}
          >
            <span>{project.title}</span>
            {#if project.id === value}<Icon name="check" size={16} strokeWidth={2} />{/if}
          </button>
        {:else}
          <p class="project-picker-empty">{t('task.noProjectMatches')}</p>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .project-picker {
    position: relative;
    min-width: 0;
  }

  .project-picker-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    min-height: 48px;
    padding: 0 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--t2);
    text-align: left;
  }

  .project-picker-trigger.has-value {
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
    background: color-mix(in srgb, var(--accent) 6%, var(--card));
    color: var(--t1);
  }

  .project-picker-value {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .project-picker-value span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-picker-popover {
    position: absolute;
    z-index: var(--z-popover, 50);
    top: calc(100% + 7px);
    left: 0;
    right: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    box-shadow: var(--shadow-popover, 0 14px 34px rgba(0, 0, 0, 0.16));
  }

  .project-picker-search {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    color: var(--t3);
  }

  .project-picker-search input {
    min-width: 0;
    height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .project-picker-options {
    max-height: 236px;
    overflow-y: auto;
    padding: 5px;
  }

  .project-picker-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    min-height: 42px;
    padding: 0 10px;
    border-radius: calc(var(--radius-control) - 2px);
    color: var(--t1);
    text-align: left;
  }

  .project-picker-option:hover,
  .project-picker-option.is-active {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .project-picker-option--clear {
    justify-content: flex-start;
    color: var(--t3);
  }

  .project-picker-empty {
    margin: 0;
    padding: 14px 10px;
    color: var(--t3);
    font-size: var(--text-sm);
  }

  @media (max-width: 839px) {
    .project-picker-trigger {
      min-height: 52px;
    }

    .project-picker-option {
      min-height: 48px;
    }
  }
</style>

