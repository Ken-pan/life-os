<script>
  import { page } from '$app/state'
  import { userLists } from '$lib/state.svelte.js'
  import { t, listLabel } from '$lib/i18n/index.js'
  import { buildTaskDrawerNavGroups } from '$lib/nav.js'
  import { taskDrawer, closeTaskDrawer, taskEditor } from '$lib/ui.svelte.js'
  import { lockScroll, unlockScroll } from '$lib/scrollLock.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { activateFocusTrap } from '@life-os/theme'
  import { tick } from 'svelte'

  const groups = $derived(buildTaskDrawerNavGroups(t, userLists(), listLabel))
  const pathname = $derived(page.url.pathname)
  const search = $derived(page.url.search)
  const open = $derived(taskDrawer.open && !taskEditor.open)

  /** @type {HTMLDivElement | null} */
  let panelEl = $state(null)

  $effect(() => {
    pathname
    closeTaskDrawer()
  })

  $effect(() => {
    if (!open) return
    lockScroll()
    /** @type {(() => void) | null} */
    let releaseFocus = null
    let cancelled = false

    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') closeTaskDrawer()
    }
    window.addEventListener('keydown', onKey)

    tick().then(() => {
      if (cancelled || !panelEl) return
      releaseFocus = activateFocusTrap(panelEl)
    })

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      releaseFocus?.()
      unlockScroll()
    }
  })

  /** @param {import('@life-os/platform-web/navigation').WebNavItem} item */
  function isActive(item) {
    return item.match(pathname, search)
  }
</script>

{#if open}
  <button
    type="button"
    class="task-drawer-backdrop"
    aria-label={t('common.close')}
    onclick={closeTaskDrawer}
  ></button>
  <div
    bind:this={panelEl}
    class="task-drawer-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-drawer-title"
  >
    <div class="task-drawer-header">
      <h2 id="task-drawer-title" class="task-drawer-title">
        {t('nav.listsMenu')}
      </h2>
      <button
        type="button"
        class="task-drawer-close"
        onclick={closeTaskDrawer}
        aria-label={t('common.close')}
      >
        <Icon name="x" size={20} strokeWidth={1.75} />
      </button>
    </div>
    <div class="task-drawer-body">
      {#each groups as group (group.label)}
        <div class="task-drawer-section">
          <p class="task-drawer-section-label">{group.label}</p>
          {#each group.items as item (item.href)}
            <a
              class="task-drawer-row"
              class:active={isActive(item)}
              href={item.href}
              data-sveltekit-noscroll
              aria-current={isActive(item) ? 'page' : undefined}
              onclick={closeTaskDrawer}
            >
              <span class="task-drawer-row-icon" aria-hidden="true">
                {#if item.dotColor}
                  <span class="sidebar-dot" style:background={item.dotColor}
                  ></span>
                {:else}
                  <Icon name={item.icon} size={20} strokeWidth={1.75} />
                {/if}
              </span>
              <span class="task-drawer-row-label">{item.label}</span>
              {#if isActive(item)}
                <span class="task-drawer-row-check" aria-hidden="true">✓</span>
              {:else}
                <Icon
                  name="chevron-right"
                  size={18}
                  strokeWidth={1.75}
                  class="task-drawer-row-chevron"
                />
              {/if}
            </a>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
