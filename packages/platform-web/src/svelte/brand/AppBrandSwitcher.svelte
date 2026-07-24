<script>
  import { tick } from 'svelte'
  import { getLifeOsBrand, getLifeOsBrandMarkSize, getLifeOsAppWordmarkAccent } from '@life-os/theme/brand'
  import {
    LIFE_OS_SWITCHER_APPS,
    getLifeOsAppOrigin,
    getLifeOsAppBrandMark,
    findSwitcherTypeAheadIndex,
  } from '@life-os/theme'
  import BrandMark from './BrandMark.svelte'
  import AppBrandWordmark from './AppBrandWordmark.svelte'

  /** @type {{
   *   appId: import('@life-os/theme').LifeOsAppId,
   *   tagline?: string,
   *   ariaLabel?: string,
   *   allowedAppIds?: string[] | null,
   *   canSwitch?: boolean,
   *   class?: string,
   * }} */
  let {
    appId,
    tagline = '',
    ariaLabel = '',
    allowedAppIds = null,
    canSwitch = true,
    class: className = '',
  } = $props()

  let open = $state(false)
  let selectedIndex = $state(0)
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)
  /** @type {HTMLDivElement | null} */
  let menuEl = $state(null)
  /** @type {string} */
  let typeAheadBuffer = $state('')
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let typeAheadTimer

  const brand = $derived(getLifeOsBrand(appId))
  const switcherApps = $derived.by(() => {
    const apps = allowedAppIds
      ? LIFE_OS_SWITCHER_APPS.filter((entry) => allowedAppIds.includes(entry.id))
      : LIFE_OS_SWITCHER_APPS
    return apps.some((entry) => entry.id === appId) ? apps : [{ id: appId }]
  })
  const switchingEnabled = $derived(canSwitch && switcherApps.length > 1)
  const markSize = $derived(getLifeOsBrandMarkSize(appId, 'sidebar'))
  const resolvedTheme = $derived.by(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark'
  })

  function resetMenuState() {
    typeAheadBuffer = ''
    if (typeAheadTimer) clearTimeout(typeAheadTimer)
  }

  function openMenu() {
    if (!switchingEnabled) return
    open = true
    const currentIndex = switcherApps.findIndex(
      (entry) => entry.id === appId,
    )
    selectedIndex = currentIndex >= 0 ? currentIndex : 0
    tick().then(() => menuEl?.focus())
  }

  function closeMenu() {
    open = false
    resetMenuState()
  }

  function toggleMenu() {
    if (!switchingEnabled) return
    if (open) closeMenu()
    else openMenu()
  }

  /** @param {LifeOsAppId} targetId */
  function navigateToApp(targetId) {
    if (targetId === appId) {
      closeMenu()
      return
    }
    window.location.href = getLifeOsAppOrigin(targetId)
  }

  function activateSelected() {
    const entry = switcherApps[selectedIndex]
    if (entry) navigateToApp(entry.id)
  }

  function bumpTypeAhead(char) {
    typeAheadBuffer += char.toLowerCase()
    if (typeAheadTimer) clearTimeout(typeAheadTimer)
    typeAheadTimer = setTimeout(() => {
      typeAheadBuffer = ''
    }, 700)

    const matchIndex = findSwitcherTypeAheadIndex(
      switcherApps,
      typeAheadBuffer,
    )
    if (matchIndex >= 0) selectedIndex = matchIndex
  }

  /** @param {KeyboardEvent} event */
  function handleMenuKeydown(event) {
    const { key } = event
    const count = switcherApps.length

    if (key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex = (selectedIndex + 1) % count
      return
    }

    if (key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex = (selectedIndex - 1 + count) % count
      return
    }

    if (key === 'Home') {
      event.preventDefault()
      selectedIndex = 0
      return
    }

    if (key === 'End') {
      event.preventDefault()
      selectedIndex = count - 1
      return
    }

    if (key === 'Enter') {
      event.preventDefault()
      activateSelected()
      return
    }

    if (key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }

    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      bumpTypeAhead(key)
    }
  }

  /** @param {KeyboardEvent} event */
  function handleTriggerKeydown(event) {
    if (!switchingEnabled) return
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      if (!open) openMenu()
    }
  }

  $effect(() => {
    if (!open) return

    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Node) || !rootEl?.contains(target)) {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  })
</script>

<div class="brand-switcher {className}" bind:this={rootEl}>
  <button
    type="button"
    class="brand brand-switcher-trigger"
    aria-label={ariaLabel || `${brand.fullName} · 切换应用`}
    aria-expanded={switchingEnabled ? open : undefined}
    aria-haspopup={switchingEnabled ? 'menu' : undefined}
    onclick={toggleMenu}
    onkeydown={handleTriggerKeydown}
  >
    <BrandMark
      size={markSize}
      class="brand-mark"
      lightSrc={brand.light}
      darkSrc={brand.dark}
      lightSrcSet={brand.lightSrcSet}
      darkSrcSet={brand.darkSrcSet}
    />
    <span class="brand-copy">
      <AppBrandWordmark
        base={brand.wordmarkBase}
        accent={brand.wordmarkAccent}
        class="brand-name"
      />
      {#if tagline}
        <span class="brand-tag">{tagline}</span>
      {/if}
    </span>
  </button>

  {#if open && switchingEnabled}
    <div
      bind:this={menuEl}
      class="brand-switcher-menu"
      role="menu"
      tabindex="-1"
      aria-label="切换 Korben 应用"
      onkeydown={handleMenuKeydown}
    >
      {#each switcherApps as entry, index (entry.id)}
        {@const itemBrand = getLifeOsBrand(entry.id)}
        {@const itemMark = getLifeOsAppBrandMark(entry.id)}
        {@const isCurrent = entry.id === appId}
        {@const isActive = index === selectedIndex}
        <button
          type="button"
          class="brand-switcher-item"
          class:brand-switcher-item--current={isCurrent}
          class:brand-switcher-item--active={isActive}
          data-app-id={entry.id}
          style={`--brand-switcher-item-accent: ${getLifeOsAppWordmarkAccent(entry.id, resolvedTheme)}`}
          role="menuitem"
          aria-current={isCurrent ? 'true' : undefined}
          onclick={() => navigateToApp(entry.id)}
          onmouseenter={() => {
            selectedIndex = index
          }}
        >
          <BrandMark
            size={28}
            class="brand-switcher-item-mark"
            lightSrc={itemMark.light}
            darkSrc={itemMark.dark}
            lightSrcSet={itemMark.lightSrcSet}
            darkSrcSet={itemMark.darkSrcSet}
          />
          <span class="brand-switcher-item-copy">
            <AppBrandWordmark
              base={itemBrand.wordmarkBase}
              accent={itemBrand.wordmarkAccent}
              class="brand-switcher-item-name"
            />
            {#if entry.experimental}
              <span class="brand-switcher-item-badge">beta</span>
            {/if}
          </span>
          {#if isCurrent}
            <span class="brand-switcher-item-check" aria-hidden="true">✓</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
