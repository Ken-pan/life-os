<script module>
  // Port of src/components/HorizontalTabs.tsx.
  const TAB_GROUP_CONTEXT_KEY = Symbol('horizontal-tabs')

  export function tabPanelId(prefix, id) {
    return `${prefix}-panel-${id}`
  }

  export function tabButtonId(prefix, id) {
    return `${prefix}-tab-${id}`
  }

  export { TAB_GROUP_CONTEXT_KEY }
</script>

<script>
  import { setContext } from 'svelte'

  /**
   * @type {{
   *   items: { id: string, label: string }[],
   *   activeId: string,
   *   onChange: (id: string) => void,
   *   ariaLabel: string,
   *   class?: string,
   *   tablistWrapperClass?: string,
   *   scrollFadeBg?: string,
   *   children?: import('svelte').Snippet,
   * }}
   */
  let {
    items,
    activeId,
    onChange,
    ariaLabel,
    class: klass = '',
    tablistWrapperClass = '',
    scrollFadeBg,
    children,
  } = $props()

  let tablistEl = $state(null)
  const listId = `htabs-${Math.random().toString(36).slice(2, 9)}`

  setContext(TAB_GROUP_CONTEXT_KEY, { prefix: listId })

  function focusTab(id) {
    tablistEl?.querySelector(`#${tabButtonId(listId, id)}`)?.focus()
  }

  $effect(() => {
    const activeTab = tablistEl?.querySelector(`#${tabButtonId(listId, activeId)}`)
    if (!activeTab) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    activeTab.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  })

  function handleKeyDown(event, index) {
    const { key } = event
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return
    event.preventDefault()
    let nextIndex = index
    if (key === 'ArrowRight') nextIndex = (index + 1) % items.length
    else if (key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length
    else if (key === 'Home') nextIndex = 0
    else if (key === 'End') nextIndex = items.length - 1

    const nextId = items[nextIndex].id
    onChange(nextId)
    requestAnimationFrame(() => focusTab(nextId))
  }
</script>

{#snippet tablist()}
  <div class="life-os-scroll-fade" style={scrollFadeBg ? `--life-os-scroll-fade-bg: ${scrollFadeBg}` : undefined}>
    <div
      bind:this={tablistEl}
      class={['horizontal-tabs', 'life-os-scroll-x', 'life-os-scroll-x--snap', klass].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {#each items as item, index (item.id)}
        {@const selected = activeId === item.id}
        <button
          id={tabButtonId(listId, item.id)}
          type="button"
          role="tab"
          class="horizontal-tab{selected ? ' active' : ''}"
          aria-selected={selected}
          aria-controls={tabPanelId(listId, item.id)}
          tabindex={selected ? 0 : -1}
          onclick={() => onChange(item.id)}
          onkeydown={(event) => handleKeyDown(event, index)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  </div>
{/snippet}

{#if tablistWrapperClass}
  <div class={tablistWrapperClass}>{@render tablist()}</div>
{:else}
  {@render tablist()}
{/if}
{@render children?.()}
