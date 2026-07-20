<script>
  /**
   * Kenos Space Switcher — temporary layer (not a 5th tab).
   * Scheme A: toolbar / sidebar trigger → sheet with System / Recent / Pinned / All.
   * Pin controls stay outside the navigation link (a11y / HTML nesting).
   */
  import { goto } from '$app/navigation'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { LifeOsSheet } from '@life-os/platform-web/svelte/overlay'
  import {
    SPACE_SWITCHER,
    openSpaceFromSwitcher,
    togglePinnedSpace,
  } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { SYSTEM_RETURN_LIST_KEY } from '$lib/kenos/spaceSwitcher.core.js'

  /** @type {{ open?: boolean, onClose?: () => void }} */
  let { open = $bindable(false), onClose = undefined } = $props()

  const sections = $derived(SPACE_SWITCHER.sections)
  const current = $derived(SPACE_SWITCHER.currentListKey)

  function close() {
    open = false
    onClose?.()
  }

  /**
   * @param {import('$lib/kenos/spaceSwitcher.core.js').SpaceEntry} space
   * @param {MouseEvent} event
   */
  function onSelect(space, event) {
    event.preventDefault()
    const href = openSpaceFromSwitcher(space)
    close()
    if (space.external) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    void goto(href)
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
</script>

<LifeOsSheet
  {open}
  title="Spaces"
  ariaLabel="Space switcher"
  sheetClass="space-switcher-sheet"
  onClose={close}
>
  <div class="switcher" data-testid="kenos-space-switcher">
    <p class="hint">切换领域，不离开当前系统入口。外部 Space 在各自应用中打开。</p>
    {#each sections as section (section.id)}
      <section class="section" aria-labelledby={`switcher-${section.id}`}>
        <h2 id={`switcher-${section.id}`} class="section-title">{section.title}</h2>
        <ul class="list" role="list">
          {#each section.items as space (space.listKey)}
            <li class="item" class:current={current === space.listKey}>
              <a
                class="row"
                href={space.href}
                aria-current={current === space.listKey ? 'true' : undefined}
                onclick={(e) => onSelect(space, e)}
              >
                <span class="row-text">
                  <strong>{space.label}</strong>
                  {#if space.detail}
                    <span class="detail">{space.detail}</span>
                  {/if}
                </span>
                {#if space.external}
                  <Icon name="external" size={14} strokeWidth={1.75} />
                {/if}
              </a>
              {#if section.id !== 'system' && !space.external}
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
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</LifeOsSheet>

<style>
  .switcher {
    display: grid;
    gap: var(--stack-tight, 12px);
    padding-bottom: 8px;
  }
  .hint {
    margin: 0;
    color: var(--t3);
    font-size: var(--text-sm);
    line-height: 1.45;
  }
  .section-title {
    margin: 0 0 8px;
    color: var(--t3);
    font-size: var(--text-xs, 12px);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .item {
    display: flex;
    align-items: stretch;
    gap: 2px;
    border-radius: var(--radius-control, 10px);
  }
  .item.current {
    background: color-mix(in srgb, var(--accent, var(--t1)) 10%, transparent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 10px 12px;
    color: inherit;
    text-decoration: none;
    border-radius: var(--radius-control, 10px);
  }
  .row:hover {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
  }
  .row-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .row-text strong {
    font-size: var(--text-base, 15px);
    font-weight: 600;
  }
  .detail {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .pin {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--t3);
    padding: 8px 12px;
    min-width: 44px;
    border-radius: 8px;
    cursor: pointer;
    align-self: center;
  }
  .pin.on {
    color: var(--accent, var(--t1));
  }
  .row :global(svg) {
    color: var(--t3);
    flex-shrink: 0;
  }
</style>
