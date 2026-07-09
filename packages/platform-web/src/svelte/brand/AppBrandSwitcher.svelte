<script>
  import { tick } from 'svelte'
  import { getLifeOsBrand, getLifeOsBrandMarkSize } from '@life-os/theme/brand'
  import {
    LIFE_OS_SWITCHER_APPS,
    getLifeOsAppOrigin,
    getLifeOsAppBrandMark,
    filterLifeOsSwitcherApps,
    findSwitcherTypeAheadIndex,
  } from '@life-os/theme'
  import BrandMark from './BrandMark.svelte'
  import AppBrandWordmark from './AppBrandWordmark.svelte'

  /** @type {{
   *   appId: import('@life-os/theme').LifeOsAppId,
   *   tagline?: string,
   *   ariaLabel?: string,
   *   class?: string,
   * }} */
  let { appId, tagline = '', ariaLabel = '', class: className = '' } = $props()

  let open = $state(false)
  let query = $state('')
  let selectedIndex = $state(0)
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)
  /** @type {HTMLInputElement | null} */
  let searchInputEl = $state(null)
  /** @type {string} */
  let typeAheadBuffer = $state('')
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let typeAheadTimer

  const brand = $derived(getLifeOsBrand(appId))
  const markSize = $derived(getLifeOsBrandMarkSize(appId, 'sidebar'))
  const filteredApps = $derived(
    filterLifeOsSwitcherApps(LIFE_OS_SWITCHER_APPS, query),
  )

  function resetMenuState() {
    query = ''
    typeAheadBuffer = ''
    if (typeAheadTimer) clearTimeout(typeAheadTimer)
  }

  function openMenu() {
    open = true
    const currentIndex = LIFE_OS_SWITCHER_APPS.findIndex(
      (entry) => entry.id === appId,
    )
    selectedIndex = currentIndex >= 0 ? currentIndex : 0
    tick().then(() => {
      searchInputEl?.focus()
      scrollToSelected()
    })
  }

  function closeMenu() {
    open = false
    resetMenuState()
  }

  function toggleMenu() {
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
    const entry = filteredApps[selectedIndex]
    if (entry) navigateToApp(entry.id)
  }

  function scrollToSelected() {
    tick().then(() => {
      rootEl
        ?.querySelector('.brand-switcher-item--active')
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  function bumpTypeAhead(char) {
    typeAheadBuffer += char.toLowerCase()
    if (typeAheadTimer) clearTimeout(typeAheadTimer)
    typeAheadTimer = setTimeout(() => {
      typeAheadBuffer = ''
    }, 700)

    const matchIndex = findSwitcherTypeAheadIndex(filteredApps, typeAheadBuffer)
    if (matchIndex >= 0) {
      selectedIndex = matchIndex
      scrollToSelected()
      return
    }

    query = typeAheadBuffer
    selectedIndex = 0
    scrollToSelected()
  }

  /** @param {KeyboardEvent} event */
  function handleMenuKeydown(event) {
    const { key } = event
    const count = filteredApps.length

    if (key === 'ArrowDown') {
      event.preventDefault()
      if (!count) return
      if (event.target === searchInputEl) selectedIndex = 0
      else selectedIndex = (selectedIndex + 1) % count
      scrollToSelected()
      return
    }

    if (key === 'ArrowUp') {
      event.preventDefault()
      if (!count) return
      selectedIndex = (selectedIndex - 1 + count) % count
      scrollToSelected()
      return
    }

    if (key === 'Home') {
      event.preventDefault()
      if (!count) return
      selectedIndex = 0
      scrollToSelected()
      return
    }

    if (key === 'End') {
      event.preventDefault()
      if (!count) return
      selectedIndex = count - 1
      scrollToSelected()
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
      if (event.target === searchInputEl) return
      event.preventDefault()
      bumpTypeAhead(key)
    }
  }

  /** @param {KeyboardEvent} event */
  function handleTriggerKeydown(event) {
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
    aria-expanded={open}
    aria-haspopup="menu"
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

  {#if open}
    <div
      class="brand-switcher-menu"
      role="menu"
      aria-label="切换 Life OS 应用"
      onkeydown={handleMenuKeydown}
    >
      <div class="brand-switcher-search-wrap">
        <input
          bind:this={searchInputEl}
          type="search"
          class="brand-switcher-search"
          placeholder="搜索应用…"
          aria-label="搜索 Life OS 应用"
          bind:value={query}
          oninput={() => {
            selectedIndex = 0
          }}
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="brand-switcher-list" role="none">
        {#if filteredApps.length === 0}
          <p class="brand-switcher-empty">没有匹配的应用</p>
        {:else}
          {#each filteredApps as entry, index (entry.id)}
            {@const itemBrand = getLifeOsBrand(entry.id)}
            {@const itemMark = getLifeOsAppBrandMark(entry.id)}
            {@const isCurrent = entry.id === appId}
            {@const isActive = index === selectedIndex}
            <button
              type="button"
              class="brand-switcher-item"
              class:brand-switcher-item--current={isCurrent}
              class:brand-switcher-item--active={isActive}
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
                  <span class="brand-switcher-item-badge">实验</span>
                {/if}
              </span>
              {#if isCurrent}
                <span class="brand-switcher-item-check" aria-hidden="true"
                  >✓</span
                >
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
