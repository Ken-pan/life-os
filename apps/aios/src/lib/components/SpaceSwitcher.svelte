<script>
  /**
   * Kenos Space Switcher — Continue sheet (not a 5th tab).
   * P5 Knife 2: mobile bottom sheet / tablet form sheet / desktop anchored panel.
   * Continuity: descriptor schema, owner binding, deep links, E2E testids frozen.
   */
  import { tick } from 'svelte'
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { LifeOsSheet } from '@life-os/platform-web/svelte/overlay'
  import {
    SPACE_SWITCHER,
    launchSpace,
    togglePinnedSpace,
    closeSpaceSwitcherSheet,
    consumeSpaceSwitcherTrigger,
  } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { SYSTEM_RETURN_LIST_KEY } from '$lib/kenos/spaceSwitcher.core.js'

  /** @type {{ onClose?: () => void }} */
  let { onClose = undefined } = $props()

  let query = $state('')
  let allExpanded = $state(false)
  /** @type {'mobile' | 'tablet' | 'desktop'} */
  let layoutMode = $state('mobile')
  let sheetStyle = $state('')

  const open = $derived(SPACE_SWITCHER.sheetOpen)
  const sections = $derived(SPACE_SWITCHER.sections)
  const current = $derived(SPACE_SWITCHER.currentListKey)
  const recentSection = $derived(sections.find((s) => s.id === 'recent'))
  const pinnedSection = $derived(sections.find((s) => s.id === 'pinned'))
  const allSection = $derived(sections.find((s) => s.id === 'all'))
  const allCount = $derived(allSection?.items?.length ?? 0)

  const filteredAll = $derived.by(() => {
    const items = allSection?.items ?? []
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.detail || '').toLowerCase().includes(q),
    )
  })

  const showAll = $derived(
    allExpanded || Boolean(query.trim()) || !(recentSection?.items?.length),
  )
  const showHandle = $derived(layoutMode === 'mobile')

  /**
   * @returns {'mobile' | 'tablet' | 'desktop'}
   */
  function resolveMode() {
    if (typeof window === 'undefined') return 'mobile'
    const w = window.innerWidth
    if (w >= 900) return 'desktop'
    if (w >= 600) return 'tablet'
    return 'mobile'
  }

  /** Desktop Direction A — panel anchored to Continue trigger. */
  function updateDesktopAnchor() {
    if (layoutMode !== 'desktop') {
      sheetStyle = ''
      return
    }
    const trigger = SPACE_SWITCHER.lastTriggerEl
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected) {
      sheetStyle = ''
      return
    }
    const r = trigger.getBoundingClientRect()
    const gap = 8
    const width = Math.min(440, Math.max(320, window.innerWidth - 24))
    const maxH = Math.min(window.innerHeight * 0.74, window.innerHeight - 24)
    const preferEndAlign = r.left > window.innerWidth * 0.45
    let left
    if (preferEndAlign) {
      // AppBar / right-side Continue — align panel end with trigger
      left = Math.round(r.right - width)
    } else {
      // Sidebar / left-side Continue — open to the right of trigger
      left = Math.round(r.right + gap)
      if (left + width > window.innerWidth - 12) {
        left = Math.round(r.left - gap - width)
      }
    }
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
    let top = Math.round(r.bottom + gap)
    if (top + Math.min(360, maxH) > window.innerHeight - 12) {
      top = Math.max(12, Math.round(r.top - gap - Math.min(360, maxH)))
    }
    // Prefer vertically aligning near trigger when sidebar icon is mid-rail
    if (!preferEndAlign && r.height < 64) {
      top = Math.max(12, Math.min(Math.round(r.top), window.innerHeight - Math.min(360, maxH) - 12))
    }
    sheetStyle = [
      'position:fixed',
      `top:${top}px`,
      `left:${left}px`,
      `width:${width}px`,
      `max-width:${width}px`,
      `max-height:${Math.round(maxH)}px`,
      'margin:0',
    ].join(';')
  }

  $effect(() => {
    if (!open) {
      sheetStyle = ''
      return
    }
    const sync = () => {
      layoutMode = resolveMode()
      updateDesktopAnchor()
    }
    sync()
    const raf = requestAnimationFrame(() => {
      sync()
    })
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  })

  function close() {
    closeSpaceSwitcherSheet()
    query = ''
    allExpanded = false
    sheetStyle = ''
    onClose?.()
    const trigger = consumeSpaceSwitcherTrigger()
    if (trigger) {
      void tick().then(() => {
        if (trigger.isConnected) trigger.focus({ preventScroll: true })
      })
    }
  }

  /**
   * @param {import('$lib/kenos/spaceSwitcher.core.js').SpaceEntry} space
   * @param {MouseEvent} event
   */
  function onSelect(space, event) {
    event.preventDefault()
    close()
    launchSpace(space, { goto })
  }

  /**
   * @param {string} listKey
   * @param {MouseEvent} event
   */
  function onPin(listKey, event) {
    event.preventDefault()
    event.stopPropagation()
    if (listKey === SYSTEM_RETURN_LIST_KEY || listKey.startsWith('system:')) return
    togglePinnedSpace(listKey)
  }

  /**
   * Avoid duplicate progress when detail already carries the same text.
   * @param {import('$lib/kenos/spaceSwitcher.core.js').SpaceEntry} space
   */
  function progressText(space) {
    const p = (space.progress || '').trim()
    if (!p) return ''
    const d = (space.detail || '').trim()
    if (d && (d.includes(p) || p.includes(d))) return ''
    return p
  }
</script>

<LifeOsSheet
  {open}
  title=""
  ariaLabel="Continue to a recent Space"
  sheetClass="space-switcher-sheet"
  bgClass={`space-switcher-sheet-bg layout-${layoutMode}`}
  placement="auto"
  {showHandle}
  {sheetStyle}
  onClose={close}
>
  {#snippet header()}
    <div class="continue-header">
      <h2 class="sheet-title continue-title">Continue</h2>
      <button
        type="button"
        class="sheet-close"
        data-testid="kenos-space-switcher-close"
        aria-label="Close Continue"
        onclick={close}
      >
        <Icon name="x" size={18} strokeWidth={1.75} />
      </button>
    </div>
  {/snippet}

  <div class="switcher" data-testid="kenos-space-switcher">
    <p class="hint">回到刚才做到的地方。浏览全部领域用 Spaces。</p>

    {#if recentSection?.items?.length}
      <section class="section" aria-labelledby="switcher-recent">
        <h2 id="switcher-recent" class="section-title">Recent</h2>
        <ul class="list" role="list">
          {#each recentSection.items as space (space.listKey)}
            <li class="item" class:current={current === space.listKey} class:expired={space.expired}>
              <a
                class="row"
                href={space.href}
                aria-current={current === space.listKey ? 'true' : undefined}
                onclick={(e) => onSelect(space, e)}
              >
                <span
                  class="accent"
                  style:background={space.accent || 'var(--border)'}
                  aria-hidden="true"
                ></span>
                <span class="row-text">
                  <strong>{space.label}</strong>
                  {#if space.detail || progressText(space) || space.resumeAt}
                    <span class="meta">
                      {#if space.detail}
                        <span class="detail">{space.detail}</span>
                      {/if}
                      {#if progressText(space)}
                        <span class="progress">{progressText(space)}</span>
                      {/if}
                      {#if space.resumeAt}
                        <span class="when">{space.resumeAt}</span>
                      {/if}
                    </span>
                  {/if}
                </span>
              </a>
              <button
                type="button"
                class="pin"
                class:on={SPACE_SWITCHER.state.pinned.includes(space.listKey)}
                aria-label={SPACE_SWITCHER.state.pinned.includes(space.listKey)
                  ? `Unpin ${space.label}`
                  : `Pin ${space.label}`}
                onclick={(e) => onPin(space.listKey, e)}
              >
                <Icon name="star" size={14} strokeWidth={1.75} />
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="empty-recent" role="status">还没有最近 Space。从 Spaces 进入一次后会出现在这里。</p>
    {/if}

    {#if pinnedSection?.items?.length}
      <section class="section" aria-labelledby="switcher-pinned">
        <h2 id="switcher-pinned" class="section-title">Pinned</h2>
        <ul class="list" role="list">
          {#each pinnedSection.items as space (space.listKey)}
            <li class="item" class:current={current === space.listKey}>
              <a class="row" href={space.href} onclick={(e) => onSelect(space, e)}>
                <span
                  class="accent"
                  style:background={space.accent || 'var(--border)'}
                  aria-hidden="true"
                ></span>
                <span class="row-text">
                  <strong>{space.label}</strong>
                  {#if space.detail}<span class="meta"><span class="detail">{space.detail}</span></span>{/if}
                </span>
              </a>
              <button
                type="button"
                class="pin on"
                aria-label={`Unpin ${space.label}`}
                onclick={(e) => onPin(space.listKey, e)}
              >
                <Icon name="star" size={14} strokeWidth={1.75} />
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if allSection}
      <section class="section" aria-labelledby="switcher-all">
        {#if recentSection?.items?.length && !showAll}
          <button
            type="button"
            id="switcher-all"
            class="all-toggle"
            aria-expanded="false"
            onclick={() => (allExpanded = true)}
          >
            <span class="all-toggle-label">All Spaces · {allCount}</span>
            <Icon name="chevron-down" size={16} strokeWidth={1.75} />
          </button>
        {:else}
          <div class="all-head">
            <h2 id="switcher-all" class="section-title">All Spaces · {allCount}</h2>
            {#if recentSection?.items?.length}
              <button
                type="button"
                class="expand"
                aria-expanded="true"
                onclick={() => {
                  allExpanded = false
                  query = ''
                }}
              >
                收起
              </button>
            {/if}
          </div>
          <label class="search">
            <span class="visually-hidden">搜索 Space</span>
            <input type="search" placeholder="搜索 Space" bind:value={query} />
          </label>
          <ul class="list" role="list">
            {#each filteredAll as space (space.listKey)}
              <li class="item" class:current={current === space.listKey}>
                <a class="row" href={space.href} onclick={(e) => onSelect(space, e)}>
                  <span
                    class="accent"
                    style:background={space.accent || 'var(--border)'}
                    aria-hidden="true"
                  ></span>
                  <span class="row-text">
                    <strong>{space.label}</strong>
                    {#if space.detail}<span class="meta"><span class="detail">{space.detail}</span></span>{/if}
                  </span>
                  {#if space.external}
                    <Icon name="external" size={14} strokeWidth={1.75} />
                  {/if}
                </a>
                {#if !space.external}
                  <button
                    type="button"
                    class="pin"
                    class:on={SPACE_SWITCHER.state.pinned.includes(space.listKey)}
                    aria-label={SPACE_SWITCHER.state.pinned.includes(space.listKey)
                      ? `Unpin ${space.label}`
                      : `Pin ${space.label}`}
                    onclick={(e) => onPin(space.listKey, e)}
                  >
                    <Icon name="star" size={14} strokeWidth={1.75} />
                  </button>
                {/if}
              </li>
            {:else}
              <li class="empty-search">没有匹配的 Space</li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</LifeOsSheet>

<style>
  /*
   * Knife 2 — Continue-only chrome (bgClass + sheetClass).
   * Theme .sheet defaults for other apps unchanged.
   */
  :global(.sheet-bg.space-switcher-sheet-bg) {
    z-index: calc(var(--z-sheet, 100) + 40);
    overscroll-behavior: none;
  }

  :global(.sheet.space-switcher-sheet) {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  :global(.sheet.space-switcher-sheet .sheet-handle) {
    flex: 0 0 auto;
    margin-bottom: 8px;
  }

  .continue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: 0 0 auto;
    margin-bottom: 4px;
    min-height: 44px;
  }

  .continue-title {
    margin: 0;
    flex: 1;
    min-width: 0;
  }

  .sheet-close {
    appearance: none;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--kenos-radius-control, 10px);
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }

  .sheet-close:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    color: var(--t1);
  }

  .sheet-close:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent, var(--t1)) 55%, transparent);
    outline-offset: 2px;
  }

  .sheet-close:active {
    background: color-mix(in srgb, var(--t1) 10%, transparent);
  }

  /* Mobile <600: full-width bottom sheet */
  @media (max-width: 599px) {
    :global(.sheet-bg.space-switcher-sheet-bg.layout-mobile) {
      align-items: flex-end;
      justify-content: center;
    }

    :global(.sheet.space-switcher-sheet) {
      width: 100%;
      max-width: none;
      border-radius: 22px 22px 0 0;
      max-height: min(78dvh, var(--app-vh, 100dvh));
      padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
    }
  }

  /* Tablet 600–899: centered form sheet */
  @media (min-width: 600px) and (max-width: 899px) {
    :global(.sheet-bg.space-switcher-sheet-bg.layout-tablet) {
      align-items: center;
      justify-content: center;
      padding: 24px max(16px, env(safe-area-inset-right)) 24px
        max(16px, env(safe-area-inset-left));
    }

    :global(.sheet.space-switcher-sheet) {
      width: min(560px, 100%);
      max-width: 560px;
      border-radius: var(--radius-overlay, 16px);
      max-height: min(74vh, var(--app-vh, 100dvh));
      padding-bottom: 20px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16);
    }
  }

  /* Desktop ≥900: Direction A anchored panel — light scrim, no heavy blur */
  @media (min-width: 900px) {
    :global(.sheet-bg.space-switcher-sheet-bg.layout-desktop) {
      align-items: flex-start;
      justify-content: flex-start;
      background: rgba(0, 0, 0, 0.2);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      padding: 0;
    }

    :global(.sheet.space-switcher-sheet) {
      width: min(440px, calc(100vw - 24px));
      max-width: 440px;
      border-radius: 14px;
      max-height: min(74vh, var(--app-vh, 100dvh));
      padding: 12px 16px 16px;
      border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
      box-shadow:
        0 1px 0 color-mix(in srgb, var(--t1) 4%, transparent),
        0 10px 28px rgba(0, 0, 0, 0.14);
    }
  }

  .switcher {
    display: grid;
    gap: var(--kenos-space-md, 16px);
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 4px 4px 8px;
    /* Avoid faux “right rail” from overlay scrollbars */
    scrollbar-width: thin;
  }

  .hint {
    margin: 0;
    color: var(--t3);
    font-size: var(--kenos-type-secondary, var(--text-sm));
    line-height: 1.45;
  }

  .empty-recent {
    margin: 0;
    padding: 12px 0;
    color: var(--t3);
    font-size: var(--kenos-type-secondary, var(--text-sm));
    border-top: 1px solid var(--border);
  }

  .section-title {
    margin: 0 0 6px;
    color: var(--t3);
    font-size: var(--kenos-type-meta, 12px);
    font-weight: 650;
    letter-spacing: var(--kenos-tracking-meta, 0.06em);
    text-transform: uppercase;
  }

  .all-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }

  .all-head .section-title {
    margin-bottom: 0;
    text-transform: none;
    letter-spacing: 0.02em;
    font-size: var(--text-sm);
    font-weight: 650;
    color: var(--t2);
  }

  .all-toggle {
    appearance: none;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 8px 4px;
    border: 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--t1);
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .all-toggle-label {
    font-size: var(--text-sm);
    font-weight: 650;
    color: var(--t2);
  }

  .all-toggle:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }

  .all-toggle:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent, var(--t1)) 55%, transparent);
    outline-offset: 2px;
  }

  .all-toggle:active {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
  }

  .expand {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--accent, var(--t2));
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    min-height: 44px;
    min-width: 44px;
    padding: 0 8px;
    cursor: pointer;
  }

  .expand:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent, var(--t1)) 55%, transparent);
    outline-offset: 2px;
  }

  .search {
    display: block;
    margin-bottom: 8px;
  }

  .search input {
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--kenos-radius-control, 8px);
    background: transparent;
    color: var(--t1);
    font: inherit;
  }

  .search input:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent, var(--t1)) 55%, transparent);
    outline-offset: 2px;
  }

  /* Hairline group — no stacked cards */
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
    border-top: 1px solid var(--border);
    background: transparent;
    overflow: visible;
  }

  .item {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    overflow: visible;
  }

  .item.current {
    background: var(--kenos-surface-selected, color-mix(in srgb, var(--accent) 10%, transparent));
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    min-height: 48px;
    padding: 10px 4px 10px 10px;
    color: inherit;
    text-decoration: none;
    border-radius: 8px;
    background: transparent;
    border: 0;
    outline: none;
    box-shadow: none;
  }

  .row:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }

  .row:active {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
  }

  .row:focus-visible {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
    outline: 2px solid color-mix(in srgb, var(--accent, var(--t1)) 55%, transparent);
    outline-offset: 2px;
    box-shadow: none;
  }

  .row-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .row-text strong {
    font-size: var(--kenos-type-list, 15px);
    font-weight: var(--kenos-weight-list, 600);
  }

  .meta {
    display: grid;
    gap: 1px;
  }

  .detail {
    color: var(--t2);
    font-size: var(--kenos-type-meta, var(--text-sm));
    letter-spacing: 0;
    text-transform: none;
    font-weight: 500;
  }

  .progress,
  .when {
    color: var(--t3);
    font-size: 11px;
    font-weight: 450;
    letter-spacing: 0;
    text-transform: none;
  }

  .when {
    opacity: 0.8;
  }

  .accent {
    width: 3px;
    align-self: stretch;
    min-height: 22px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  .pin {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t3);
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    margin: 2px 0;
    border-radius: 8px;
    cursor: pointer;
    align-self: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    flex-shrink: 0;
  }

  .pin.on {
    color: var(--accent, var(--t1));
    opacity: 1;
  }

  .pin:hover {
    opacity: 0.85;
    background: color-mix(in srgb, var(--t1) 5%, transparent);
  }

  .pin:active {
    background: color-mix(in srgb, var(--t1) 10%, transparent);
  }

  .pin:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent, var(--t1)) 55%, transparent);
    outline-offset: 2px;
    opacity: 1;
  }

  .item.expired .detail {
    opacity: 0.75;
  }

  .empty-search {
    padding: 14px 8px;
    color: var(--t3);
    font-size: var(--text-sm);
    border-bottom: 1px solid var(--border);
  }

  .row :global(svg) {
    color: var(--t3);
    flex-shrink: 0;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
