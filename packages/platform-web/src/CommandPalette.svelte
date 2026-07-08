<script>
  import { onMount, tick } from 'svelte'
  import { Icon } from '@lucide/svelte'

  /**
   * @typedef {Object} CommandAction
   * @property {string} id
   * @property {string} title
   * @property {string} [subtitle]
   * @property {string} [icon]
   * @property {string} [shortcut]
   * @property {() => void} onSelect
   */

  /** @type {{ open: boolean, actions?: CommandAction[], placeholder?: string, onOpenChange?: (open: boolean) => void }} */
  let {
    open = $bindable(false),
    actions = [],
    placeholder = 'Type a command or search...',
    onOpenChange,
  } = $props()

  let query = $state('')
  let selectedIndex = $state(0)
  /** @type {HTMLInputElement | null} */
  let inputRef = $state(null)
  /** @type {HTMLDialogElement | null} */
  let dialogRef = $state(null)

  const filteredActions = $derived(
    query.trim() === ''
      ? actions
      : actions.filter(
          (a) =>
            a.title.toLowerCase().includes(query.toLowerCase()) ||
            a.subtitle?.toLowerCase().includes(query.toLowerCase()),
        ),
  )

  $effect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      tick().then(() => {
        if (dialogRef && !dialogRef.open) dialogRef.showModal()
        inputRef?.focus()
        query = ''
        selectedIndex = 0
      })
    } else {
      document.body.style.overflow = ''
      if (dialogRef && dialogRef.open) dialogRef.close()
    }
  })

  onMount(() => {
    const handleGlobalKeydown = (/** @type {KeyboardEvent} */ e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        open = !open
        if (onOpenChange) onOpenChange(open)
      }
    }
    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  })

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex = (selectedIndex + 1) % (filteredActions.length || 1)
      scrollToSelected()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex =
        (selectedIndex - 1 + filteredActions.length) %
        (filteredActions.length || 1)
      scrollToSelected()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredActions[selectedIndex]) {
        executeAction(filteredActions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      closePalette()
    }
  }

  function scrollToSelected() {
    tick().then(() => {
      const el = document.querySelector('.cp-item[aria-selected="true"]')
      if (el) el.scrollIntoView({ block: 'nearest' })
    })
  }

  /** @param {CommandAction} action */
  function executeAction(action) {
    action.onSelect()
    closePalette()
  }

  function closePalette() {
    open = false
    if (onOpenChange) onOpenChange(false)
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogRef}
  class="command-palette-modal"
  onclose={closePalette}
  onclick={(e) => e.target === dialogRef && closePalette()}
>
  <div class="cp-container" onclick={(e) => e.stopPropagation()}>
    <div class="cp-header">
      <Icon name="search" size={20} class="cp-search-icon" />
      <input
        bind:this={inputRef}
        bind:value={query}
        onkeydown={handleKeydown}
        class="cp-input"
        {placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls="cp-listbox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />
      {#if query}
        <button
          class="cp-clear"
          onclick={() => {
            query = ''
            inputRef?.focus()
          }}
          aria-label="Clear search"
        >
          <Icon name="x" size={16} />
        </button>
      {:else}
        <div class="cp-shortcut-hint">Esc</div>
      {/if}
    </div>

    <div class="cp-content" id="cp-listbox" role="listbox">
      {#if filteredActions.length === 0}
        <div class="cp-empty">No results found.</div>
      {:else}
        {#each filteredActions as action, i (action.id)}
          <button
            type="button"
            class="cp-item"
            role="option"
            aria-selected={i === selectedIndex}
            onmousemove={() => {
              selectedIndex = i
            }}
            onclick={() => executeAction(action)}
          >
            <div class="cp-item-icon">
              <Icon name={action.icon || 'file'} size={18} />
            </div>
            <div class="cp-item-text">
              <span class="cp-item-title">{action.title}</span>
              {#if action.subtitle}
                <span class="cp-item-subtitle">{action.subtitle}</span>
              {/if}
            </div>
            {#if action.shortcut}
              <div class="cp-item-shortcut">{action.shortcut}</div>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
</dialog>

<style>
  .command-palette-modal {
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    position: fixed;
    inset: 0;
    display: none;
    z-index: var(--z-sheet);
  }

  .command-palette-modal[open] {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
  }

  .command-palette-modal::backdrop {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: cp-fade-in var(--dur-fast) var(--ease-standard);
  }

  .cp-container {
    width: 100%;
    max-width: 600px;
    background: var(--card);
    border-radius: 16px;
    box-shadow: var(--shadow-elevated, 0 16px 40px rgba(0, 0, 0, 0.2));
    border: 1px solid var(--border-l, var(--border-strong, var(--border)));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: cp-slide-down var(--dur-base) var(--ease-emphasized);
  }

  .cp-header {
    display: flex;
    align-items: center;
    padding: 0 var(--space-4);
    height: 56px;
    border-bottom: 1px solid var(--border);
    gap: var(--space-3);
  }

  :global(.cp-search-icon) {
    color: var(--t3, var(--text-muted));
  }

  .cp-input {
    flex: 1;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    font-size: var(--text-lg);
    color: var(--t1, var(--text));
    font-family: inherit;
  }

  .cp-input::placeholder {
    color: var(--t3, var(--text-muted));
  }

  .cp-shortcut-hint,
  .cp-clear {
    font-size: var(--text-xs);
    color: var(--t3, var(--text-muted));
    background: color-mix(in srgb, var(--t1, var(--text)) 5%, transparent);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--space-1);
    font-weight: 500;
  }

  .cp-clear {
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1);
    background: transparent;
    transition: background var(--dur-fast) var(--ease-standard);
  }

  .cp-clear:hover {
    color: var(--t1, var(--text));
    background: color-mix(in srgb, var(--t1, var(--text)) 5%, transparent);
  }

  .cp-content {
    max-height: 400px;
    overflow-y: auto;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .cp-empty {
    padding: var(--space-8);
    text-align: center;
    color: var(--t3, var(--text-muted));
    font-size: var(--text-sm);
  }

  .cp-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: none;
    background: transparent;
    border-radius: var(--radius-control);
    cursor: pointer;
    text-align: left;
    transition: background var(--dur-fast) var(--ease-standard);
  }

  .cp-item[aria-selected='true'] {
    background: color-mix(in srgb, var(--t1, var(--text)) 5%, transparent);
  }

  .cp-item:focus-visible {
    outline: none;
    box-shadow: var(--btn-focus-ring);
  }

  .cp-item-icon {
    color: var(--t2, var(--text-secondary));
    display: flex;
  }

  .cp-item[aria-selected='true'] .cp-item-icon {
    color: var(--accent);
  }

  .cp-item-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .cp-item-title {
    font-size: var(--text-md);
    color: var(--t1, var(--text));
    font-weight: 500;
  }

  .cp-item-subtitle {
    font-size: var(--text-xs);
    color: var(--t3, var(--text-muted));
  }

  .cp-item-shortcut {
    font-size: var(--text-xs);
    color: var(--t3, var(--text-muted));
    font-family: var(--mono);
    background: var(--bg, var(--card));
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--space-1);
    border: 1px solid var(--border);
  }

  @keyframes cp-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes cp-slide-down {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 640px) {
    .command-palette-modal[open] {
      padding-top: 0;
      align-items: flex-end;
    }

    .cp-container {
      max-width: 100%;
      border-radius: 20px 20px 0 0;
      animation: life-os-mobile-more-in var(--dur-base) var(--ease-standard);
    }

    .cp-content {
      max-height: 60vh;
    }
  }
</style>
