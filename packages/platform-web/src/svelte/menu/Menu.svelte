<script>
  /**
   * Life OS Menu — 下拉菜单行为组件。
   * 外观由 @life-os/theme 的 .life-os-popover 基座提供（design-system.css 已含）；
   * 本组件只负责行为：开合、外点关闭、Escape、方向键循环、菜单 ARIA。
   *
   * 用法：
   *   <Menu label="更多" items={[{ id: 'rename', label: '重命名' }]} onselect={...} />
   *   触发器可用 trigger snippet 完全自定义（收到 { open, toggle }）。
   */

  /**
   * @typedef {{ id: string, label: string, danger?: boolean, disabled?: boolean }} MenuItem
   * @type {{
   *   label?: string,
   *   items: MenuItem[],
   *   onselect?: (id: string) => void,
   *   align?: 'start' | 'end',
   *   ariaLabel?: string,
   *   trigger?: import('svelte').Snippet<[{ open: boolean, toggle: () => void }]>
   * }}
   */
  let {
    label = '',
    items = [],
    onselect,
    align = 'start',
    ariaLabel = '',
    trigger,
  } = $props()

  let open = $state(false)
  let rootElement
  let menuElement = $state(null)

  function toggle() {
    open = !open
  }

  function close({ refocus = false } = {}) {
    if (!open) return
    open = false
    if (refocus) {
      rootElement
        ?.querySelector('[aria-haspopup="menu"]')
        ?.focus({ preventScroll: true })
    }
  }

  function select(item) {
    if (item.disabled) return
    close({ refocus: true })
    onselect?.(item.id)
  }

  function menuItems() {
    return Array.from(
      menuElement?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [],
    )
  }

  function focusItem(delta) {
    const list = menuItems()
    if (!list.length) return
    const index = list.indexOf(document.activeElement)
    const next =
      index === -1
        ? delta > 0
          ? 0
          : list.length - 1
        : (index + delta + list.length) % list.length
    list[next].focus()
  }

  function onRootKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close({ refocus: true })
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) open = true
      queueMicrotask(() => focusItem(1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) open = true
      queueMicrotask(() => focusItem(-1))
    }
  }

  $effect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootElement?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  })
</script>

<div
  bind:this={rootElement}
  class="life-os-menu"
  onkeydown={onRootKeydown}
>
  {#if trigger}
    {@render trigger({ open, toggle })}
  {:else}
    <button
      type="button"
      class="btn-secondary"
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={toggle}
    >
      {label}
    </button>
  {/if}

  {#if open}
    <div
      bind:this={menuElement}
      class="life-os-popover life-os-menu__panel"
      class:life-os-menu__panel--end={align === 'end'}
      role="menu"
      aria-label={ariaLabel || label || undefined}
    >
      {#each items as item (item.id)}
        <button
          type="button"
          class="life-os-popover__item"
          class:life-os-popover__item--danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onclick={() => select(item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .life-os-menu {
    position: relative;
    display: inline-flex;
  }

  .life-os-menu__panel {
    position: absolute;
    top: calc(100% + var(--space-1, 4px));
    left: 0;
    z-index: var(--z-sheet, 100);
    display: flex;
    flex-direction: column;
  }

  .life-os-menu__panel--end {
    left: auto;
    right: 0;
  }
</style>
